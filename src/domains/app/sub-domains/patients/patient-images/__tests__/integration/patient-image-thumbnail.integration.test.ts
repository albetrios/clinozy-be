import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { operatorQuery } from '@/tests/helpers/operator-database.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { runGlobalRetentionWorkerJob } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow } from '@/domains/app/__tests__/factories/app-flow.factory.js';
import {
  findOrganizationsWithPhotosWithoutThumbnail,
  findPatientImagesOutOfThumbnailSync,
  findPhotosWithoutThumbnail,
} from '@/domains/app/sub-domains/patients/patient-images/patient-image-thumbnail.repository.js';
import { syncPatientImageThumbnail } from '@/domains/app/sub-domains/patients/patient-images/workers/patient-image-thumbnail.processor.js';

/**
 * A patient photo's thumbnail kept in step with its row (feat-patient-image-thumbnails): the real
 * job against the database — the organization's RLS context, the compare-and-set writes, the
 * sweep's cross-organization read — with the object store faked (the S3 round trip is out of
 * reach here). Create → made, the grid reads the thumbnail's link; delete → removed, the key
 * cleared; restore → made again.
 */
describe('Patient image thumbnails — integration', () => {
  const S = String(Date.now());
  const lastName = `x${S}`;

  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let images = '';
  let photo = '';
  let fileKey = '';
  let thumbnailKey = '';

  const storage = {
    createThumbnail: vi.fn(async ({ fileKey: key }: { fileKey: string }) => ({
      kind: 'created' as const,
      thumbnailKey: key.replace(/\.jpg$/, '.thumb.webp'),
    })),
    deleteThumbnail: vi.fn(async () => undefined),
  };

  /** Runs the photo's thumbnail job once, as the worker does. */
  function runJob() {
    return syncPatientImageThumbnail({
      organizationPublicId: fixture.organization.publicId,
      patientImagePublicId: photo,
      storage,
    });
  }

  /** The photo's stored thumbnail key. */
  async function storedThumbnailKey(): Promise<string | null> {
    const [row] = await operatorQuery<{ thumbnail_key: string | null }[]>`
      SELECT thumbnail_key FROM app.patient_images WHERE public_id = ${photo}
    `;
    return row?.thumbnail_key ?? null;
  }

  /** The sweep's read over the last week, as public ids. */
  async function sweepCandidates(): Promise<string[]> {
    const rows = await runGlobalRetentionWorkerJob((databaseHandle) =>
      findPatientImagesOutOfThumbnailSync(databaseHandle, {
        afterId: 0,
        createdAfter: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        // The sweep's grace: a photo younger than 10 minutes is left to its own job
        createdBefore: new Date(Date.now() - 10 * 60 * 1000),
        limit: 500,
      }),
    );
    return rows.map((row) => row.publicId);
  }

  /** The backfill's reads: is this organization listed, and which of its photos. */
  async function backfillCandidates(): Promise<{ listed: boolean; photos: string[] }> {
    return runGlobalRetentionWorkerJob(async (databaseHandle) => {
      const organizations = await findOrganizationsWithPhotosWithoutThumbnail(databaseHandle, {
        afterId: 0,
        limit: 500,
      });
      const photos = await findPhotosWithoutThumbnail(databaseHandle, {
        organizationId: fixture.organization.id,
        afterId: 0,
        limit: 500,
      });
      return {
        listed: organizations.some(
          (organization) => organization.publicId === fixture.organization.publicId,
        ),
        photos: photos.map((row) => row.publicId),
      };
    });
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture);
    flow.as('owner');
    await flow.expect(200, 'a patient file with its contact', 'POST', '/app/patients', {
      contact: {
        first_name: 'Thumb',
        last_name: lastName,
        phones: [{ phone: `+91${`7${S.slice(-7)}`}71`, is_primary: true }],
      },
      home_branch_id: fixture.branches.vesu,
    });
    images = `/app/patients/${flow.last('.data.id')}/images`;
    fileKey = `organization-files/${fixture.organization.publicId}/${lastName}-cheek.jpg`;
    thumbnailKey = fileKey.replace(/\.jpg$/, '.thumb.webp');
    await operatorQuery`
      INSERT INTO upload.uploads (public_id, user_id, organization_id, file_name, file_key, mime_type,
        file_size, bucket, status, uploaded_at)
      VALUES (${generatePublicId('upload')}, ${fixture.members.owner.userId}, ${fixture.organization.id},
        'cheek.jpg', ${fileKey}, 'image/jpeg', 4096, 'local', 'UPLOADED', now())
    `;
    await flow.expect(200, 'a photo', 'POST', images, { file_key: fileKey });
    photo = flow.last('.data.id');
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. a new photo shows its full image until the job makes the thumbnail', async () => {
    flow.expectValue(
      'no thumbnail yet: thumbnail_url is the full photo link',
      '[(.data.thumbnail_key == null), (.data.thumbnail_url == .data.file_url), (.data.file_url | test("^https://"))] | map(tostring) | join(",")',
      'true,true,true',
    );
    expect(await sweepCandidates()).not.toContain(photo);
    expect(await backfillCandidates()).toEqual({ listed: true, photos: [photo] });
  });

  it('2. the job makes it; the grid then reads the thumbnail link, the open photo the full one', async () => {
    await expect(runJob()).resolves.toEqual({ outcome: 'created', thumbnailKey });
    expect(await storedThumbnailKey()).toBe(thumbnailKey);
    await expect(runJob()).resolves.toEqual({ outcome: 'skipped', reason: 'in_sync' });
    expect(storage.createThumbnail).toHaveBeenCalledTimes(1);
    // Done photos drop out of the backfill: a re-run picks up where the last one stopped
    expect(await backfillCandidates()).toEqual({ listed: false, photos: [] });
    await flow.expect(200, 'the photo', 'GET', `${images}/${photo}`);
    flow.expectValue(
      'thumbnail_url signs the thumbnail; file_url still the photo',
      '[.data.thumbnail_key, (.data.thumbnail_url | contains(".thumb.webp")), (.data.thumbnail_url | test("X-Amz-Expires=900")), (.data.file_url | contains(".thumb.webp"))] | map(tostring) | join(",")',
      `${thumbnailKey},true,true,false`,
    );
    await flow.expect(200, 'the album', 'GET', images);
    flow.expectValue(
      'the list carries it too',
      `[.data[] | select(.id == "${photo}") | (.thumbnail_url | contains(".thumb.webp"))][0]`,
      true,
    );
  });

  it('3. a delete removes the thumbnail and clears the key; the sweep catches a lost removal', async () => {
    await flow.expect(204, 'delete the photo', 'DELETE', `${images}/${photo}?reason=duplicate`);
    expect(await sweepCandidates()).toContain(photo);
    await expect(runJob()).resolves.toEqual({ outcome: 'removed', thumbnailKey });
    expect(storage.deleteThumbnail).toHaveBeenCalledWith({
      organizationPublicId: fixture.organization.publicId,
      thumbnailKey,
    });
    expect(await storedThumbnailKey()).toBeNull();
    expect(await sweepCandidates()).not.toContain(photo);
  });

  it('4. a restore makes it again', async () => {
    await flow.expect(200, 'restore the photo', 'POST', `${images}/${photo}/restore`);
    flow.expectValue(
      'restored: the full photo for now',
      '.data.thumbnail_url == .data.file_url',
      true,
    );
    await expect(runJob()).resolves.toEqual({ outcome: 'created', thumbnailKey });
    expect(await storedThumbnailKey()).toBe(thumbnailKey);
  });
});

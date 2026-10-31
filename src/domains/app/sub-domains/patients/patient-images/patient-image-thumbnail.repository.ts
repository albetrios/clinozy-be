import { and, asc, eq, gt, gte, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { assertWorkerDatabaseContext } from '@/infrastructure/database/contexts/database-context-runtime.js';
import type { WorkerDatabaseHandle } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { patient_images } from './patient-images.schema.js';

/** What the thumbnail job reads of one photo. */
export interface PatientImageThumbnailRow {
  id: number;
  fileKey: string;
  thumbnailKey: string | null;
  deletedAt: Date | null;
}

/** A photo whose thumbnail does not match its row, with its organization (the sweep's read). */
export interface PatientImageThumbnailCandidate {
  id: number;
  publicId: string;
  organizationPublicId: string;
}

/**
 * The thumbnail job's reads and writes of `app.patient_images` on an explicit handle pinned to one
 * organization's context (feat-patient-image-thumbnails).
 *
 * @remarks
 * - **Algorithm:** {@link PatientImageThumbnailRepository.findByPublicId} reads a photo, live or
 *   deleted; {@link PatientImageThumbnailRepository.setThumbnailKey} fills an empty
 *   `thumbnail_key` and {@link PatientImageThumbnailRepository.clearThumbnailKey} empties the one
 *   it removed — each a compare-and-set, so a retried or overtaken job changes nothing twice.
 * - **Notes:** neither write touches `updated_at`: the thumbnail is the system's, not an edit (a
 *   save holding the `updated_at` it read stays valid).
 */
export class PatientImageThumbnailRepository {
  constructor(private readonly databaseHandle: WorkerDatabaseHandle) {}

  /**
   * A photo of the organization by its public id, live or deleted — null when it is gone (purged).
   * The organization is named in the read, not left to RLS alone.
   */
  async findByPublicId({
    publicId,
    organizationPublicId,
  }: {
    publicId: string;
    organizationPublicId: string;
  }): Promise<PatientImageThumbnailRow | null> {
    const [row] = await this.databaseHandle
      .select({
        id: patient_images.id,
        fileKey: patient_images.file_key,
        thumbnailKey: patient_images.thumbnail_key,
        deletedAt: patient_images.deleted_at,
      })
      .from(patient_images)
      .innerJoin(organizations, eq(organizations.id, patient_images.organization_id))
      .where(
        and(
          eq(patient_images.public_id, publicId),
          eq(organizations.public_id, organizationPublicId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /** Sets `thumbnail_key` when it is still empty; true when this call set it. */
  async setThumbnailKey({
    id,
    thumbnailKey,
  }: {
    id: number;
    thumbnailKey: string;
  }): Promise<boolean> {
    const rows = await this.databaseHandle
      .update(patient_images)
      .set({ thumbnail_key: thumbnailKey })
      .where(and(eq(patient_images.id, id), isNull(patient_images.thumbnail_key)))
      .returning({ id: patient_images.id });
    return rows.length > 0;
  }

  /** Empties `thumbnail_key` when it still holds the key just removed; true when this call did. */
  async clearThumbnailKey({
    id,
    thumbnailKey,
  }: {
    id: number;
    thumbnailKey: string;
  }): Promise<boolean> {
    const rows = await this.databaseHandle
      .update(patient_images)
      .set({ thumbnail_key: null })
      .where(and(eq(patient_images.id, id), eq(patient_images.thumbnail_key, thumbnailKey)))
      .returning({ id: patient_images.id });
    return rows.length > 0;
  }
}

/** The thumbnail job's repository on a handle pinned to an organization's context. */
export function createWorkerPatientImageThumbnailRepository(
  databaseHandle: WorkerDatabaseHandle,
): PatientImageThumbnailRepository {
  assertWorkerDatabaseContext(['organization']);
  return new PatientImageThumbnailRepository(databaseHandle);
}

/**
 * The sweep's page of photos whose thumbnail does not match their row (lost enqueues): live ones
 * created inside `[createdAfter, createdBefore)` without a thumbnail, and deleted ones still
 * holding one — in id order after `afterId`, across organizations.
 *
 * @remarks
 * - **Notes:** reads under the global retention cleanup context (the table's retention arm).
 */
export async function findPatientImagesOutOfThumbnailSync(
  databaseHandle: WorkerDatabaseHandle,
  options: { afterId: number; createdAfter: Date; createdBefore: Date; limit: number },
): Promise<PatientImageThumbnailCandidate[]> {
  assertWorkerDatabaseContext(['global_retention_cleanup']);
  return databaseHandle
    .select({
      id: patient_images.id,
      publicId: patient_images.public_id,
      organizationPublicId: organizations.public_id,
    })
    .from(patient_images)
    .innerJoin(organizations, eq(organizations.id, patient_images.organization_id))
    .where(
      and(
        gt(patient_images.id, options.afterId),
        or(
          and(
            isNull(patient_images.deleted_at),
            isNull(patient_images.thumbnail_key),
            gte(patient_images.created_at, options.createdAfter),
            lt(patient_images.created_at, options.createdBefore),
          ),
          and(isNotNull(patient_images.deleted_at), isNotNull(patient_images.thumbnail_key)),
        ),
      ),
    )
    .orderBy(asc(patient_images.id))
    .limit(options.limit);
}

/**
 * The backfill's page of organizations holding a live photo without a thumbnail, in id order
 * after `afterId`.
 *
 * @remarks
 * - **Notes:** reads under the global retention cleanup context.
 */
export async function findOrganizationsWithPhotosWithoutThumbnail(
  databaseHandle: WorkerDatabaseHandle,
  options: { afterId: number; limit: number },
): Promise<{ id: number; publicId: string }[]> {
  assertWorkerDatabaseContext(['global_retention_cleanup']);
  return databaseHandle
    .select({ id: organizations.id, publicId: organizations.public_id })
    .from(organizations)
    .where(
      and(
        gt(organizations.id, options.afterId),
        sql`exists (select 1 from ${patient_images} where ${patient_images.organization_id} = ${organizations.id} and ${patient_images.deleted_at} is null and ${patient_images.thumbnail_key} is null)`,
      ),
    )
    .orderBy(asc(organizations.id))
    .limit(options.limit);
}

/**
 * The backfill's page of one organization's live photos without a thumbnail, in id order after
 * `afterId`.
 *
 * @remarks
 * - **Notes:** reads under the global retention cleanup context.
 */
export async function findPhotosWithoutThumbnail(
  databaseHandle: WorkerDatabaseHandle,
  options: { organizationId: number; afterId: number; limit: number },
): Promise<{ id: number; publicId: string }[]> {
  assertWorkerDatabaseContext(['global_retention_cleanup']);
  return databaseHandle
    .select({ id: patient_images.id, publicId: patient_images.public_id })
    .from(patient_images)
    .where(
      and(
        eq(patient_images.organization_id, options.organizationId),
        gt(patient_images.id, options.afterId),
        isNull(patient_images.deleted_at),
        isNull(patient_images.thumbnail_key),
      ),
    )
    .orderBy(asc(patient_images.id))
    .limit(options.limit);
}

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';
import { redisConnection } from '@/infrastructure/cache/redis.client.js';
import { buildIdempotencyCacheKey } from '@/shared/utils/idempotency/idempotency-key.util.js';
import { buildInFlightIdempotencyEntry } from '@/tests/helpers/idempotency-entry.helper.js';
import { createTestApp } from '@/tests/helpers/test-app.js';
import {
  injectAuthenticated,
  injectUnauthenticated,
} from '@/tests/helpers/test-http-inject.helper.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { generateTestToken } from '@/tests/helpers/test-auth.js';
import { createObjectStoragePortMock } from '@/tests/helpers/object-storage-mock.helper.js';
import { getDefaultS3ObjectStorageAdapter } from '@/infrastructure/storage/s3-adapter.js';
import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import { uploads } from '@/domains/upload/upload.schema.js';
import { stripPendingObjectKeyPrefix } from '@/domains/upload/upload.constants.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { MFA_AUTHENTICATION_METHOD } from '@/shared/utils/security/jwt.util.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import {
  createMembership,
  createRoleWithPermissions,
  seedPermissions,
} from '@/domains/tenancy/__tests__/factories/permission.factory.js';
import { organization_settings } from '@/domains/tenancy/sub-domains/organization/organization-settings/organization-settings.schema.js';
import { UPLOAD_PERMISSIONS } from '@/domains/upload/upload.permissions.js';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

/** Bucket recorded on seeded rows; asserted to be absent from the detail response body. */
const SEEDED_BUCKET = 'test-uploads';

/** PNG file signature, so the confirm step's magic-byte check accepts the mocked object. */
const PNG_MAGIC_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('Upload Domain — Integration', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { app: testApplication } = await createTestApp();
    app = testApplication;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Answers the confirm and delete storage calls from {@link createObjectStoragePortMock} by
   * spying on the default S3 adapter — the singleton the upload container is built on — so a test
   * can walk PENDING → UPLOADED over HTTP without a bucket. The presign stays real (it signs
   * locally), so every other case in this file keeps running on the production adapter.
   */
  function mockDefaultObjectStorage() {
    const objectStorageMock = createObjectStoragePortMock({
      getObjectFirstBytes: vi
        .fn()
        .mockResolvedValue({ body: PNG_MAGIC_BYTES, contentType: 'image/png', eTag: '"etag"' }),
    });
    const adapter = getDefaultS3ObjectStorageAdapter();
    vi.spyOn(adapter, 'verifyUploadedObject').mockImplementation(
      objectStorageMock.verifyUploadedObject,
    );
    vi.spyOn(adapter, 'getObjectFirstBytes').mockImplementation(
      objectStorageMock.getObjectFirstBytes,
    );
    vi.spyOn(adapter, 'copyObject').mockImplementation(objectStorageMock.copyObject);
    vi.spyOn(adapter, 'deleteObject').mockImplementation(objectStorageMock.deleteObject);
    return objectStorageMock;
  }

  /**
   * Inserts an already-`UPLOADED` upload row directly. The read and re-confirm paths never
   * touch object storage, so seeding the terminal state is both sufficient and cheaper than
   * walking request → confirm behind a mocked S3 port.
   */
  async function seedUploadedRow(
    userInternalId: number,
  ): Promise<{ id: number; publicId: string; fileKey: string }> {
    const publicId = generatePublicId('upload');
    const fileKey = `avatars/${publicId}/verified.png`;
    const [seeded] = await getOperatorDatabase()
      .insert(uploads)
      .values({
        public_id: publicId,
        user_id: userInternalId,
        organization_id: null,
        file_name: 'verified.png',
        file_key: fileKey,
        mime_type: 'image/png',
        file_size: 1024,
        storage_provider: 's3',
        bucket: SEEDED_BUCKET,
        status: 'UPLOADED',
        metadata: { purpose: 'AVATAR', target: 'USER' },
        uploaded_at: new Date(),
      })
      .returning();
    return { id: seeded!.id, publicId, fileKey };
  }

  describe('POST /api/v1/uploads', () => {
    it('should return 401 without authentication', async () => {
      const response = await injectUnauthenticated(app, {
        method: 'POST',
        url: testApiPath('/uploads'),
        payload: {},
        // POST /uploads is idempotencyRequired; without a key the global onRequest hook returns 422
        // before auth. Supply one so this exercises the auth 401 it intends to assert.
        headers: { 'x-idempotency-key': `idem-${randomUUID()}` },
      });
      expect(response.statusCode).toBe(401);
    });

    it('should return 400 for missing upload data', async () => {
      const user = await createTestUser();
      const token = await generateTestToken({ userId: user.public_id });
      const response = await injectAuthenticated(app, {
        method: 'POST',
        url: testApiPath('/uploads'),
        token: token,
        payload: {},
      });
      expect(response.statusCode, response.body).toBe(400);
    });

    it('should return 400 for invalid purpose enum', async () => {
      const user = await createTestUser();
      const token = await generateTestToken({ userId: user.public_id });
      const response = await injectAuthenticated(app, {
        method: 'POST',
        url: testApiPath('/uploads'),
        token: token,
        payload: {
          purpose: 'invalid-purpose',
          for: 'user',
          content_type: 'image/png',
          file_name: 'avatar.png',
          file_size: 1024,
        },
      });
      expect(response.statusCode, response.body).toBe(400);
    });
  });

  describe('GET /api/v1/uploads/:publicId', () => {
    const unknownUploadPublicId = 'upl_abcdefghijklmnopqrstu';

    it('should return 401 without authentication', async () => {
      const response = await injectUnauthenticated(app, {
        method: 'GET',
        url: testApiPath(`/uploads/${unknownUploadPublicId}`),
      });
      expect(response.statusCode).toBe(401);
    });

    it('should return 200 with the upload detail for its owner', async () => {
      const user = await createTestUser();
      const token = await generateTestToken({ userId: user.public_id });
      const { publicId } = await seedUploadedRow(user.id);

      const response = await injectAuthenticated(app, {
        method: 'GET',
        url: testApiPath(`/uploads/${publicId}`),
        token,
      });

      expect(response.statusCode, response.body).toBe(200);
      const data = (response.json() as { data: Record<string, unknown> }).data;
      expect(data).toMatchObject({
        id: publicId,
        file_name: 'verified.png',
        mime_type: 'image/png',
        file_size: 1024,
        status: 'UPLOADED',
        storage_provider: 's3',
        organization_id: null,
      });
    });

    it('should omit the internal storage key and bucket from the detail body', async () => {
      const user = await createTestUser();
      const token = await generateTestToken({ userId: user.public_id });
      const { publicId, fileKey } = await seedUploadedRow(user.id);

      const response = await injectAuthenticated(app, {
        method: 'GET',
        url: testApiPath(`/uploads/${publicId}`),
        token,
      });

      expect(response.statusCode, response.body).toBe(200);
      const data = (response.json() as { data: Record<string, unknown> }).data;
      // Storage layout is internal: the client attaches via the create-time `key` and reads
      // via presigned URLs, never the raw path. Leaking either invites bucket enumeration.
      expect(data).not.toHaveProperty('key');
      expect(data).not.toHaveProperty('file_key');
      expect(data).not.toHaveProperty('bucket');
      expect(response.body).not.toContain(fileKey);
      expect(response.body).not.toContain(SEEDED_BUCKET);
    });

    it('should return 404 for unknown upload', async () => {
      const user = await createTestUser();
      const token = await generateTestToken({ userId: user.public_id });
      const response = await injectAuthenticated(app, {
        method: 'GET',
        url: testApiPath(`/uploads/${unknownUploadPublicId}`),
        token: token,
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/v1/uploads/:publicId', () => {
    const unknownUploadPublicId = 'upl_abcdefghijklmnopqrstu';

    it('should return 401 without authentication', async () => {
      const response = await injectUnauthenticated(app, {
        method: 'DELETE',
        url: testApiPath(`/uploads/${unknownUploadPublicId}`),
      });
      expect(response.statusCode).toBe(401);
    });

    it('should return 404 for unknown upload', async () => {
      const user = await createTestUser();
      const token = await generateTestToken({ userId: user.public_id });
      const response = await injectAuthenticated(app, {
        method: 'DELETE',
        url: testApiPath(`/uploads/${unknownUploadPublicId}`),
        token: token,
      });
      expect(response.statusCode).toBe(404);
    });

    it('returns 404 on a GET of the upload once its owner has deleted it', async () => {
      mockDefaultObjectStorage();
      const user = await createTestUser();
      const token = await generateTestToken({ userId: user.public_id });
      const { publicId } = await seedUploadedRow(user.id);

      const remove = await injectAuthenticated(app, {
        method: 'DELETE',
        url: testApiPath(`/uploads/${publicId}`),
        token,
      });
      expect(remove.statusCode, remove.body).toBe(204);

      const read = await injectAuthenticated(app, {
        method: 'GET',
        url: testApiPath(`/uploads/${publicId}`),
        token,
      });
      expect(read.statusCode, read.body).toBe(404);
    });
  });

  describe('POST /api/v1/uploads/:publicId/confirm (route-coverage gap-fill)', () => {
    const unknownUploadPublicId = 'upl_abcdefghijklmnopqrstu';

    it('should return 401 without authentication', async () => {
      const response = await injectUnauthenticated(app, {
        method: 'POST',
        url: testApiPath(`/uploads/${unknownUploadPublicId}/confirm`),
        payload: {},
      });
      expect(response.statusCode).toBe(401);
    });

    it('should return 404 for unknown upload public_id', async () => {
      const user = await createTestUser();
      const token = await generateTestToken({ userId: user.public_id });
      const response = await injectAuthenticated(app, {
        method: 'POST',
        url: testApiPath(`/uploads/${unknownUploadPublicId}/confirm`),
        token,
        payload: {},
      });
      expect(response.statusCode).toBe(404);
    });

    it('is idempotent: re-confirming an already-UPLOADED row returns 200 without S3 calls', async () => {
      const user = await createTestUser();
      const token = await generateTestToken({ userId: user.public_id });
      const { id, publicId } = await seedUploadedRow(user.id);

      const response = await injectAuthenticated(app, {
        method: 'POST',
        url: testApiPath(`/uploads/${publicId}/confirm`),
        token,
        payload: {},
      });
      expect(response.statusCode).toBe(200);

      const [postCall] = await getOperatorDatabase()
        .select()
        .from(uploads)
        .where(eq(uploads.id, id));
      expect(postCall!.status).toBe('UPLOADED');
    });

    it('moves a PENDING upload to UPLOADED and repoints it at the final key (storage verdict mocked)', async () => {
      const objectStorageMock = mockDefaultObjectStorage();
      const user = await createTestUser();
      const token = await generateTestToken({ userId: user.public_id });
      const create = await injectAuthenticated(app, {
        method: 'POST',
        url: testApiPath('/uploads'),
        token,
        payload: {
          purpose: 'avatar',
          for: 'user',
          content_type: 'image/png',
          file_name: 'avatar.png',
          file_size: 1024,
        },
      });
      expect(create.statusCode, create.body).toBe(200);
      const createdPublicId = (create.json() as { data: { id: string } }).data.id;

      const pending = await injectAuthenticated(app, {
        method: 'GET',
        url: testApiPath(`/uploads/${createdPublicId}`),
        token,
      });
      expect(pending.statusCode, pending.body).toBe(200);
      expect((pending.json() as { data: { status: string } }).data.status).toBe('PENDING');
      const [pendingRow] = await getOperatorDatabase()
        .select()
        .from(uploads)
        .where(eq(uploads.public_id, createdPublicId));
      const pendingKey = pendingRow!.file_key;
      const finalKey = stripPendingObjectKeyPrefix(pendingKey);
      expect(finalKey).not.toBe(pendingKey);

      const confirm = await injectAuthenticated(app, {
        method: 'POST',
        url: testApiPath(`/uploads/${createdPublicId}/confirm`),
        token,
        payload: {},
      });
      expect(confirm.statusCode, confirm.body).toBe(200);
      expect((confirm.json() as { data: Record<string, unknown> }).data).toMatchObject({
        id: createdPublicId,
        status: 'UPLOADED',
        file_size: 1024,
      });
      // The storage verdict is checked against what the client declared at create time.
      expect(objectStorageMock.verifyUploadedObject).toHaveBeenCalledWith({
        key: pendingKey,
        expected: {
          contentType: 'image/png',
          contentLength: 1024,
        },
      });
      expect(objectStorageMock.copyObject).toHaveBeenCalledWith(
        expect.objectContaining({ sourceKey: pendingKey, destinationKey: finalKey }),
      );

      const [confirmedRow] = await getOperatorDatabase()
        .select()
        .from(uploads)
        .where(eq(uploads.public_id, createdPublicId));
      expect(confirmedRow!.status).toBe('UPLOADED');
      expect(confirmedRow!.file_key).toBe(finalKey);
    });
  });

  /**
   * `POST /uploads` is the only `idempotencyRequired` route in this domain, but the
   * middleware's own suite (`idempotency.security.test.ts`) exercises it exclusively against
   * `/tenancy/organizations`. These cases pin the contract at this route.
   *
   * Both use a raw `app.inject` on purpose: `injectAuthenticated` auto-supplies a fresh
   * `X-Idempotency-Key` for exactly this path, which would route straight past the hook
   * under test.
   */
  describe('POST /api/v1/uploads — idempotency contract', () => {
    const validAvatarPayload = {
      purpose: 'avatar',
      for: 'user',
      content_type: 'image/png',
      file_name: 'avatar.png',
      file_size: 1024,
    };

    it('should return 422 when X-Idempotency-Key is missing', async () => {
      const user = await createTestUser();
      const token = await generateTestToken({ userId: user.public_id });

      const response = await app.inject({
        method: 'POST',
        url: testApiPath('/uploads'),
        headers: { authorization: `Bearer ${token}` },
        payload: validAvatarPayload,
      });

      expect(response.statusCode, response.body).toBe(422);
    });

    /**
     * CHARACTERIZATION — this pins today's behavior, which is NOT replay protection.
     *
     * The presign response carries `upload_url` and a SigV4 `Policy`/`X-Amz-Signature`, so
     * `responseBodyContainsSecretFields` refuses to cache it
     * (`idempotency.cache.secret_response_skipped`). With no completed entry stashed,
     * `idempotencyOnResponse` takes its release branch and DELETEs the placeholder — leaving
     * no record of the key at all.
     *
     * Consequence: the key is mandatory (see the 422 above) but spent-and-forgotten. A client
     * that retries after a timeout mints a SECOND upload row and burns another
     * `UPLOAD_MAX_PENDING_PER_USER` slot, and the divergent-payload guard never fires either.
     * Only the in-flight window is protected.
     *
     * If that is later judged a defect, this test should flip — deliberately, not silently.
     */
    it('does not replay a reused key: the presign response is never cached (characterization)', async () => {
      const user = await createTestUser();
      const token = await generateTestToken({ userId: user.public_id });
      const headers = {
        authorization: `Bearer ${token}`,
        'x-idempotency-key': `idem-${randomUUID()}`,
      };

      const first = await app.inject({
        method: 'POST',
        url: testApiPath('/uploads'),
        headers,
        payload: validAvatarPayload,
      });
      expect(first.statusCode, first.body).toBe(200);

      const second = await app.inject({
        method: 'POST',
        url: testApiPath('/uploads'),
        headers,
        payload: validAvatarPayload,
      });
      expect(second.statusCode, second.body).toBe(200);

      const idOf = (raw: string): string => (JSON.parse(raw) as { data: { id: string } }).data.id;
      // A replay would return the first id byte-for-byte; a fresh execution mints a new row.
      expect(idOf(second.body)).not.toBe(idOf(first.body));
      const rows = await getOperatorDatabase()
        .select()
        .from(uploads)
        .where(eq(uploads.user_id, user.id));
      expect(rows).toHaveLength(2);
    });

    it('returns 409 conflict_in_flight while the same key is mid-flight — the one window that IS protected', async () => {
      // The characterization above proves a COMPLETED request's key is spent-and-forgotten.
      // This is the other half of that finding: DURING flight the placeholder exists, so a
      // concurrent retry gets 409 (retry the same key shortly) rather than minting a second
      // upload row. Deterministic per the billing-idempotency-replay pattern: seed the exact
      // in-flight placeholder the preHandler writes, then issue one request.
      const user = await createTestUser();
      const token = await generateTestToken({ userId: user.public_id });
      const idempotencyKey = `idem-${randomUUID()}`;
      // No organization in the token -> the middleware scopes the key as `none:<userId>`.
      const cacheKey = buildIdempotencyCacheKey({
        idempotencyKey,
        scope: { userId: user.public_id },
      });
      await redisConnection.set(
        cacheKey,
        buildInFlightIdempotencyEntry({
          method: 'POST',
          routePath: testApiPath('/uploads'),
          body: validAvatarPayload,
        }),
        'EX',
        60,
      );

      try {
        const response = await app.inject({
          method: 'POST',
          url: testApiPath('/uploads'),
          headers: { authorization: `Bearer ${token}`, 'x-idempotency-key': idempotencyKey },
          payload: validAvatarPayload,
        });

        expect(response.statusCode, response.body).toBe(409);
        const body = response.json() as { error?: { code?: string } };
        expect(body.error?.code).toBe('conflict_in_flight');
      } finally {
        await redisConnection.del(cacheKey);
      }
    });
  });

  describe('organization uploads are authorized like every organization route', () => {
    async function memberWithUploadManage(options: { mfaRequired: boolean }) {
      await seedPermissions([UPLOAD_PERMISSIONS.UPLOAD_MANAGE]);
      const member = await createTestUser();
      const organization = await createTestOrganization({ ownerUserId: member.id });
      await getOperatorDatabase()
        .insert(organization_settings)
        .values({
          organization_id: organization.id,
          security_policy: { mfa_required: options.mfaRequired },
          default_locale: 'en',
        });
      const role = await createRoleWithPermissions({
        organizationId: organization.id,
        permissionCodes: [UPLOAD_PERMISSIONS.UPLOAD_MANAGE],
      });
      await createMembership({
        userId: member.id,
        organizationId: organization.id,
        roleId: role.id,
      });
      return { member, organization, role };
    }

    function requestOrganizationLogo(token: string, organizationPublicId: string) {
      return app.inject({
        method: 'POST',
        url: testApiPath('/uploads'),
        headers: { authorization: `Bearer ${token}`, 'x-idempotency-key': `idem-${randomUUID()}` },
        payload: {
          purpose: 'organization-logo',
          for: 'organization',
          organization_id: organizationPublicId,
          content_type: 'image/png',
          file_name: 'logo.png',
          file_size: 1024,
        },
      });
    }

    it('an MFA-required organization refuses a session without a second factor', async () => {
      const { member, organization } = await memberWithUploadManage({ mfaRequired: true });

      const firstFactorOnly = await generateTestToken({
        userId: member.public_id,
        organizationPublicId: organization.public_id,
      });
      const refused = await requestOrganizationLogo(firstFactorOnly, organization.public_id);
      expect(refused.statusCode, refused.body).toBe(403);
      expect((refused.json() as { error: { reason?: string } }).error.reason).toBe('mfa_required');

      const withMfa = await generateTestToken({
        userId: member.public_id,
        organizationPublicId: organization.public_id,
        authenticationMethods: [MFA_AUTHENTICATION_METHOD],
      });
      const allowed = await requestOrganizationLogo(withMfa, organization.public_id);
      expect(allowed.statusCode, allowed.body).toBe(200);
    });

    it('an organization upload must target the active organization', async () => {
      const { member, organization } = await memberWithUploadManage({ mfaRequired: false });
      const other = await createTestOrganization({ ownerUserId: member.id });
      const otherRole = await createRoleWithPermissions({
        organizationId: other.id,
        permissionCodes: [UPLOAD_PERMISSIONS.UPLOAD_MANAGE],
      });
      await createMembership({ userId: member.id, organizationId: other.id, roleId: otherRole.id });

      const token = await generateTestToken({
        userId: member.public_id,
        organizationPublicId: organization.public_id,
      });
      const refused = await requestOrganizationLogo(token, other.public_id);
      expect(refused.statusCode, refused.body).toBe(403);
      const allowed = await requestOrganizationLogo(token, organization.public_id);
      expect(allowed.statusCode, allowed.body).toBe(200);
    });
  });
});

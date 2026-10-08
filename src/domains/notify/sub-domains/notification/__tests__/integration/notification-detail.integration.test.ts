import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { injectAuthenticated } from '@/tests/helpers/test-http-inject.helper.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { generateTestToken } from '@/tests/helpers/test-auth.js';
import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import { notifications } from '@/domains/notify/sub-domains/notification/notification.schema.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import type { FastifyInstance } from 'fastify';

async function insertNotificationFor(userId: number): Promise<string> {
  const publicId = generatePublicId('notification');
  await getOperatorDatabase().insert(notifications).values({
    public_id: publicId,
    user_id: userId,
    type: 'system',
    title: 'Detail happy-path notification',
    message: 'Created directly for the notification detail routes.',
  });
  return publicId;
}

/**
 * Happy paths for the user-scoped notification detail routes — declared
 * statuses observed for GET `:id` (200), PATCH `:id/read` (200), and
 * DELETE `:notification_id` (204).
 */
describe('Notification detail — happy paths', () => {
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

  it('GET /notify/notifications/:id returns the owned notification', async () => {
    const user = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: user.id });
    const token = await generateTestToken({
      userId: user.public_id,
      organizationPublicId: organization.public_id,
    });
    const notificationId = await insertNotificationFor(user.id);

    const response = await injectAuthenticated(app, {
      method: 'GET',
      url: testApiPath(`/notify/notifications/${notificationId}`),
      token,
    });
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as { data: Record<string, unknown> };
    expect(body.data).toMatchObject({
      id: notificationId,
      type: 'system',
      title: 'Detail happy-path notification',
      message: 'Created directly for the notification detail routes.',
      is_read: false,
      read_at: null,
    });
    expect(body.data).not.toHaveProperty('user_id');
    expect(body.data).not.toHaveProperty('organization_id');
  });

  it('PATCH /notify/notifications/:id/read marks it read', async () => {
    const user = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: user.id });
    const token = await generateTestToken({
      userId: user.public_id,
      organizationPublicId: organization.public_id,
    });
    const notificationId = await insertNotificationFor(user.id);

    const response = await injectAuthenticated(app, {
      method: 'PATCH',
      url: testApiPath(`/notify/notifications/${notificationId}/read`),
      token,
    });
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as { data: { id: string; is_read: boolean; read_at: string } };
    expect(body.data.id).toBe(notificationId);
    expect(body.data.is_read).toBe(true);
    expect(new Date(body.data.read_at).toISOString()).toBe(body.data.read_at);

    const [persisted] = await getOperatorDatabase()
      .select()
      .from(notifications)
      .where(eq(notifications.public_id, notificationId));
    expect(persisted).toMatchObject({ public_id: notificationId, is_read: true });
    expect(persisted?.read_at).toBeInstanceOf(Date);
    expect(persisted?.read_at?.toISOString()).toBe(body.data.read_at);
  });

  it('DELETE /notify/notifications/:notification_id removes it', async () => {
    const user = await createTestUser();
    const organization = await createTestOrganization({ ownerUserId: user.id });
    const token = await generateTestToken({
      userId: user.public_id,
      organizationPublicId: organization.public_id,
    });
    const notificationId = await insertNotificationFor(user.id);

    const response = await injectAuthenticated(app, {
      method: 'DELETE',
      url: testApiPath(`/notify/notifications/${notificationId}`),
      token,
    });
    expect(response.statusCode, response.body).toBe(204);
    const persisted = await getOperatorDatabase()
      .select()
      .from(notifications)
      .where(eq(notifications.public_id, notificationId));
    expect(persisted).toEqual([]);

    const afterDelete = await injectAuthenticated(app, {
      method: 'GET',
      url: testApiPath(`/notify/notifications/${notificationId}`),
      token,
    });
    expect(afterDelete.statusCode, afterDelete.body).toBe(404);
  });
});

import { describe, expect, it } from 'vitest';
import { notificationJobDataSchema } from '@/domains/notify/sub-domains/notification/queues/notification.job.schema.js';

const NOTIFICATION_PUBLIC_ID = 'ntf_9z3rura5kqvcv8zggriym';
const USER_PUBLIC_ID = 'usr_0y8vf3ktxqnhcm1ze21ab';

/**
 * The `notification` queue's payload gate.
 *
 * This schema parses an untrusted payload read back off Redis before the worker touches
 * Postgres — a corrupted or hand-crafted job must fail here rather than mid-transaction.
 *
 * Note the deliberate contrast with the webhook-delivery schema: `organizationPublicId` here is
 * `.nullable()` but still **required**, because a user-only notification legitimately has no
 * tenant while a missing key is a producer bug. The recipient's public id is always required: it
 * scopes the read of a notification without an organization.
 */
describe('notificationJobDataSchema', () => {
  const validPayload = {
    notificationPublicId: NOTIFICATION_PUBLIC_ID,
    organizationPublicId: 'org_abcdefghijklmnopqrstu',
    userPublicId: USER_PUBLIC_ID,
    requestId: 'request-1',
  };

  it('accepts a well-formed tenant-scoped payload', () => {
    const parsed = notificationJobDataSchema.safeParse(validPayload);

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toEqual(validPayload);
  });

  it('accepts a null organizationPublicId for a user-only notification', () => {
    // User-scoped notifications carry no tenant. This is the reason the field is nullable
    // rather than optional — see notification-dispatch.service.
    const parsed = notificationJobDataSchema.safeParse({
      notificationPublicId: NOTIFICATION_PUBLIC_ID,
      organizationPublicId: null,
      userPublicId: USER_PUBLIC_ID,
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.organizationPublicId).toBeNull();
  });

  it('carries the merged trace-context and DLQ-replay fields through', () => {
    // The two .extend() calls are the only thing keeping API→worker spans linked and DLQ
    // replay provenance intact; a dropped extend would silently strip both.
    const parsed = notificationJobDataSchema.safeParse({
      ...validPayload,
      traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
      tracestate: 'vendor=value',
      replayFromDlq: true,
      dlqReplayAttempt: 2,
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toMatchObject({
      traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
      tracestate: 'vendor=value',
      replayFromDlq: true,
      dlqReplayAttempt: 2,
    });
  });

  it('rejects a payload with no notificationPublicId', () => {
    const parsed = notificationJobDataSchema.safeParse({
      organizationPublicId: null,
      userPublicId: USER_PUBLIC_ID,
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects an omitted organizationPublicId (nullable, not optional)', () => {
    const parsed = notificationJobDataSchema.safeParse({
      notificationPublicId: NOTIFICATION_PUBLIC_ID,
      userPublicId: USER_PUBLIC_ID,
    });

    expect(parsed.success).toBe(false);
  });

  it.each([
    [
      'a numeric notification id (a bigserial never travels in a job)',
      { notificationPublicId: 42, organizationPublicId: null, userPublicId: USER_PUBLIC_ID },
    ],
    [
      'an empty notificationPublicId',
      { notificationPublicId: '', organizationPublicId: null, userPublicId: USER_PUBLIC_ID },
    ],
    [
      'a missing userPublicId',
      { notificationPublicId: NOTIFICATION_PUBLIC_ID, organizationPublicId: null },
    ],
    [
      'an over-long organizationPublicId',
      {
        notificationPublicId: NOTIFICATION_PUBLIC_ID,
        organizationPublicId: 'o'.repeat(29),
        userPublicId: USER_PUBLIC_ID,
      },
    ],
    [
      'an empty requestId',
      {
        notificationPublicId: NOTIFICATION_PUBLIC_ID,
        organizationPublicId: null,
        userPublicId: USER_PUBLIC_ID,
        requestId: '',
      },
    ],
  ])('rejects %s', (_label, payload) => {
    expect(notificationJobDataSchema.safeParse(payload).success).toBe(false);
  });

  it('strips unknown keys rather than rejecting them', () => {
    // Documents the actual contract: the schema is a plain z.object, not .strict(), so an extra
    // key in a hand-crafted job is dropped before the worker sees it.
    const parsed = notificationJobDataSchema.safeParse({
      ...validPayload,
      attackerControlled: 'ignored',
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).not.toHaveProperty('attackerControlled');
  });
});

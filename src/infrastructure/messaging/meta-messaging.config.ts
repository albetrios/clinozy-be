import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/shared/config/env.config.js';

/** The prefix of Meta's `X-Hub-Signature-256` header value (`sha256=<hex>`). */
const SIGNATURE_PREFIX = 'sha256=';

/**
 * Whether queued messages are sent at all on this deployment (`MESSAGING_DELIVERY_ENABLED`).
 *
 * @remarks
 * - **Algorithm:** reads the one flag.
 * - **Failure modes:** none.
 */
export function isMessagingDeliveryEnabled(): boolean {
  return env.MESSAGING_DELIVERY_ENABLED;
}

/**
 * Whether automated notices outside the 24-hour window, and the admins' day-close summaries, go as
 * the approved WhatsApp templates (`WHATSAPP_TEMPLATES_ENABLED`, launch D32).
 *
 * @remarks
 * - **Algorithm:** reads the one flag.
 * - **Failure modes:** none.
 */
export function isWhatsAppTemplatesEnabled(): boolean {
  return env.WHATSAPP_TEMPLATES_ENABLED;
}

/**
 * Whether the messaging webhook can verify callbacks — the app secret and the verify token are
 * set. Unset, the webhook answers 503.
 *
 * @remarks
 * - **Algorithm:** both `META_APP_SECRET` and `META_WEBHOOK_VERIFY_TOKEN` present.
 * - **Failure modes:** none.
 */
export function isMetaWebhookIngressConfigured(): boolean {
  return Boolean(env.META_APP_SECRET) && Boolean(env.META_WEBHOOK_VERIFY_TOKEN);
}

/** Constant-time equality of two strings. */
function safeEquals({ left, right }: { left: string; right: string }): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

/**
 * Whether a callback's `X-Hub-Signature-256` is Meta's signature of its raw body.
 *
 * @remarks
 * - **Algorithm:** `sha256=` + the hex HMAC-SHA256 of the raw body under `META_APP_SECRET`,
 *   compared in constant time.
 * - **Failure modes:** none — false for a missing secret, a malformed header or a mismatch.
 */
export function verifyMetaWebhookSignature({
  rawBody,
  signatureHeader,
}: {
  rawBody: Buffer;
  signatureHeader: string;
}): boolean {
  const secret = env.META_APP_SECRET;
  if (!(secret && signatureHeader.startsWith(SIGNATURE_PREFIX))) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEquals({
    left: expected,
    right: signatureHeader.slice(SIGNATURE_PREFIX.length).toLowerCase(),
  });
}

/**
 * Whether the subscription handshake's `hub.verify_token` is ours.
 *
 * @remarks
 * - **Algorithm:** constant-time comparison with `META_WEBHOOK_VERIFY_TOKEN`.
 * - **Failure modes:** none — false when the token is unset.
 */
export function matchesMetaWebhookVerifyToken(token: string): boolean {
  const expected = env.META_WEBHOOK_VERIFY_TOKEN;
  return expected !== undefined && safeEquals({ left: expected, right: token });
}

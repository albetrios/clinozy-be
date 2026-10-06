import type { FastifyRequest } from 'fastify';
import type { AuditActor, AuditLogRecordFields } from '@/domains/audit/audit.types.js';
import type { AuthContext } from '@/shared/types/index.js';
import { isApiKeyPrincipal } from '@/shared/utils/http/request.util.js';
import { recordAuditEvent } from '@/shared/utils/infrastructure/audit-record.util.js';

/**
 * Derives the audit actor fields from an authenticated principal: an organization API-key
 * principal is recorded as `actorApiKeyPublicId`, a user principal as `actorUserPublicId`. Spread
 * the result into a {@link recordScopedAuditEvent} input so API-key-driven mutations are attributed
 * (the audit row carries a key actor) instead of being silently dropped for lack of a user.
 */
export function buildAuditActorFields(auth: AuthContext): AuditActor {
  return isApiKeyPrincipal(auth)
    ? { actorApiKeyPublicId: auth.apiKeyPublicId }
    : { actorUserPublicId: auth.userId };
}

/** Extracts `ip_address` and `user_agent` from the Fastify request for audit log fields; either may be `null`. */
export function getAuditRequestNetworkContext(request: FastifyRequest): {
  ip_address: string | null;
  user_agent: string | null;
} {
  return {
    ip_address: request.ip ?? null,
    user_agent:
      typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : null,
  };
}

/**
 * The field names a validated request body sets — an audit row's `metadata.changed_fields`. Names
 * only, never values: a value can be personal data or a secret. Empty for a body that is not an
 * object.
 */
export function listBodyFieldNames(body: unknown): string[] {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return [];
  return Object.keys(body);
}

type ScopedAuditInput = AuditActor &
  Omit<AuditLogRecordFields, 'ip_address' | 'user_agent' | 'organization_public_id'> & {
    /**
     * Organization public id, recorded verbatim on the outbox row. The drain worker resolves
     * it to the internal id out-of-band, so the request never pays for that lookup (P0-#2).
     */
    organizationPublicId?: string;
  };

/**
 * Records an audit row with request network context. Under the P0-#2 outbox model the
 * row is staged in `audit.outbox` in the caller's transaction; the audit drain worker
 * resolves identifiers and inserts into `audit.logs` asynchronously. No DB lookup
 * happens here.
 *
 * Best-effort like every audit write: without the audit domain on the server (a unit test's fake
 * request, a boot that never registered it) the row is lost with an `audit.record.unavailable`
 * error log, and the request still succeeds.
 */
export async function recordScopedAuditEvent(
  request: FastifyRequest,
  input: ScopedAuditInput,
): Promise<void> {
  const auditService = request.server?.auditDomain?.auditService;
  if (!auditService) {
    request.log?.error({ action: input.action }, 'audit.record.unavailable');
    return;
  }
  const network = getAuditRequestNetworkContext(request);
  const { organizationPublicId, ...rest } = input;
  await recordAuditEvent(
    auditService,
    { ...rest, ...network, organization_public_id: organizationPublicId ?? null },
    request.log,
  );
}

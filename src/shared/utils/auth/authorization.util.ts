import type { FastifyReply, FastifyRequest } from 'fastify';
import { resolveUserOrganizationPermissions } from '@/domains/tenancy/sub-domains/permission/authorization.service.js';
import { organizationRequiresMfa } from '@/domains/tenancy/sub-domains/organization/organization-settings/organization-mfa-policy.js';
import { GLOBAL_ROLES, type GlobalRole } from '@/shared/constants/roles.constants.js';
import {
  ForbiddenError,
  MISSING_PERMISSION_REASON,
  UnauthorizedError,
} from '@/shared/errors/index.js';
import {
  buildAuditActorFields,
  recordScopedAuditEvent,
} from '@/shared/utils/infrastructure/audit-request-context.util.js';

/**
 * Best-effort emit `auth.permission.denied` audit row before throwing
 * {@link ForbiddenError} (sec-U13). Volume is already bounded by the global
 * authenticated rate-limit middleware, so no bespoke per-(user, route)
 * throttle is added here. The audit write is awaited (so it lands before
 * the 403 reaches the client) but failures are swallowed — the
 * `ForbiddenError` path is unchanged. A server without the audit domain
 * (a unit test's fake request) is handled by {@link recordScopedAuditEvent},
 * which logs and returns, so the deny path is the same either way.
 */
async function emitPermissionDenyAudit({
  request,
  metadata,
}: {
  request: FastifyRequest;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const auth = request.auth;
  // Every caller answers an unauthenticated request with 401 first, so `auth` is always set here.
  if (!auth) return;
  try {
    await recordScopedAuditEvent({
      request,
      input: {
        // A user is recorded as the user, an API key denied a scope as the key. Key denials used to
        // carry no actor, and the audit service dropped every one of those rows.
        ...buildAuditActorFields(auth),
        action: 'auth.permission.denied',
        resource_type: 'route',
        severity: 'WARNING',
        metadata,
      },
    });
  } catch {
    // best-effort: a failure to record must not affect the 403 response.
  }
}

function buildDenyMetadata({
  request,
  extra,
}: {
  request: FastifyRequest;
  extra: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    route: request.routeOptions?.url ?? request.url,
    method: request.method,
    ...extra,
  };
}

/** Per-request memo: one Redis/DB resolve per (user, organization) per HTTP request. */
const organizationPermissionResolveMemo = new WeakMap<
  FastifyRequest,
  Map<string, Promise<string[]>>
>();

function buildOrganizationPermissionMemoKey({
  userPublicId,
  organizationPublicId,
}: {
  userPublicId: string;
  organizationPublicId: string;
}): string {
  return `${userPublicId}:${organizationPublicId}`;
}

function resolveOrganizationPermissionsForRequest({
  request,
  userPublicId,
  organizationPublicId,
}: {
  request: FastifyRequest;
  userPublicId: string;
  organizationPublicId: string;
}): Promise<string[]> {
  const memoKey = buildOrganizationPermissionMemoKey({ userPublicId, organizationPublicId });
  let requestMemo = organizationPermissionResolveMemo.get(request);
  if (!requestMemo) {
    requestMemo = new Map();
    organizationPermissionResolveMemo.set(request, requestMemo);
  }
  const existing = requestMemo.get(memoKey);
  if (existing) {
    return existing;
  }
  const resolved = resolveUserOrganizationPermissions({ userPublicId, organizationPublicId });
  requestMemo.set(memoKey, resolved);
  return resolved;
}

/**
 * Whether the authenticated caller holds `permissionCode` in its active organization — the
 * non-throwing twin of {@link requireOrganizationPermission}, for a route whose result WIDENS
 * with a permission rather than being gated by it (`GET /app/branches/my`: every branch for a
 * branch reader, the assigned ones otherwise).
 *
 * @remarks
 * - **Algorithm:** no auth or no organization claim → false; an API key → its scopes; a user →
 *   the same per-request memoized permission set the preHandler resolves.
 * - **Notes:** never use it to gate a write — a gate must throw (and audit the deny) through
 *   {@link requireOrganizationPermission}.
 */
export async function hasOrganizationPermission({
  request,
  permissionCode,
}: {
  request: FastifyRequest;
  permissionCode: string;
}): Promise<boolean> {
  const auth = request.auth;
  const organizationPublicId = auth?.organizationPublicId;
  if (!(auth && organizationPublicId)) return false;
  if (auth.kind === 'apiKey') return auth.apiKeyScopes.includes(permissionCode);
  const permissionCodes = await resolveOrganizationPermissionsForRequest({
    request,
    userPublicId: auth.userId,
    organizationPublicId,
  });
  return permissionCodes.includes(permissionCode);
}

/**
 * Returns a Fastify preHandler that checks the authenticated user's global role.
 * Throws ForbiddenError if the user's role is not in the allowed list.
 *
 * A-2: a `super_admin` is admitted only on a session that proved a second factor
 * (`request.auth.mfaVerified`, the `amr: ['mfa']` claim); otherwise 403
 * `errors:superAdminRequiresMfa` with reason `mfa_required`.
 *
 * Usage:
 *   { preHandler: [app.authenticate, requireRole(GLOBAL_ROLES.SUPER_ADMIN)] }
 */
export function requireRole(
  ...allowedRoles: GlobalRole[]
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const auth = request.auth;
    if (auth?.kind !== 'user') throw new UnauthorizedError();
    if (!(auth.role && allowedRoles.includes(auth.role))) {
      await emitPermissionDenyAudit({
        request,
        metadata: buildDenyMetadata({
          request,
          extra: {
            deny_reason: 'insufficient_role',
            required_roles: allowedRoles,
            actor_role: auth.role,
          },
        }),
      });
      throw new ForbiddenError('errors:insufficientRolePrivileges');
    }
    if (auth.role === GLOBAL_ROLES.SUPER_ADMIN && !auth.mfaVerified) {
      await emitPermissionDenyAudit({
        request,
        metadata: buildDenyMetadata({
          request,
          extra: {
            deny_reason: 'super_admin_requires_mfa',
            required_roles: allowedRoles,
            actor_role: auth.role,
          },
        }),
      });
      throw new ForbiddenError('errors:superAdminRequiresMfa').withReason('mfa_required');
    }
  };
}

/**
 * Returns a Fastify preHandler that checks the authenticated user has a specific
 * permission within the **active organization** — the signed `org` token claim.
 *
 * Looks up: user -> membership -> role -> role_permissions
 *
 * A caller without the code (an API key without the scope) gets a 403 with `reason`
 * `missing_permission` ({@link MISSING_PERMISSION_REASON}) — the same field the service-level
 * checks set, so a client branches on one value (launch D83 (6)); an organization that requires MFA
 * answers `mfa_required`.
 *
 * @param permissionCode - The permission code to check (use domain constants, never bare strings)
 *
 * Usage:
 *   { preHandler: [app.authenticate, requireOrganizationPermission(TENANCY_PERMISSIONS.MEMBERSHIP_UPDATE)] }
 */
export function requireOrganizationPermission(
  permissionCode: string,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    await assertOrganizationPermission({ request, permissionCode });
  };
}

/**
 * Throws unless the request's principal holds `permissionCode` in the active organization — the
 * check behind {@link requireOrganizationPermission}, for a permission known only from the request
 * (e.g. the read permission each subscribed webhook event needs).
 *
 * @remarks
 * - **Algorithm:** an API key must carry the code in its scopes; a user must hold it through the
 *   organization role, and in an MFA-required organization the session must have proved a second
 *   factor.
 * - **Failure modes:** `UnauthorizedError` without a principal; `ForbiddenError` without an
 *   organization claim, without the permission, or without the required MFA.
 * - **Side effects:** a deny audit row on every refusal.
 */
export async function assertOrganizationPermission({
  request,
  permissionCode,
}: {
  request: FastifyRequest;
  permissionCode: string;
}): Promise<void> {
  const auth = request.auth;
  if (!auth) throw new UnauthorizedError();

  // The organization is the signed `org` token claim — the same source `requireOrganizationScope`
  // hands the controller, so authz and the data/RLS scope cannot diverge. The claim is scope, not
  // authority: membership is verified below (and RLS re-checked per request).
  const organizationId = auth.organizationPublicId;
  if (!organizationId) {
    throw new ForbiddenError('errors:organizationContextRequired');
  }

  if (auth.kind === 'apiKey') {
    // An API key is pinned to the one organization it was minted in (its claim above); fail
    // closed when its scopes lack the permission.
    if (!auth.apiKeyScopes.includes(permissionCode)) {
      await emitPermissionDenyAudit({
        request,
        metadata: buildDenyMetadata({
          request,
          extra: {
            deny_reason: 'api_key_scope_missing',
            permission_code: permissionCode,
            organization_id: organizationId,
          },
        }),
      });
      throw new ForbiddenError('errors:insufficientOrganizationPermissions').withReason(
        MISSING_PERMISSION_REASON,
      );
    }
    return;
  }

  const permissionCodes = await resolveOrganizationPermissionsForRequest({
    request,
    userPublicId: auth.userId,
    organizationPublicId: organizationId,
  });
  if (!permissionCodes.includes(permissionCode)) {
    await emitPermissionDenyAudit({
      request,
      metadata: buildDenyMetadata({
        request,
        extra: {
          deny_reason: 'organization_permission_missing',
          permission_code: permissionCode,
          organization_id: organizationId,
        },
      }),
    });
    throw new ForbiddenError('errors:insufficientOrganizationPermissions').withReason(
      MISSING_PERMISSION_REASON,
    );
  }
  // An organization whose security policy requires MFA admits only a session that proved a
  // second factor (the token's `amr`). Checked per request — not only at login — so a session
  // that joined later (invitation accepted after a first-factor login) or predates the policy
  // cannot use the organization's authority. Runs after the permission check so a non-member
  // learns nothing about the policy; an MFA-verified principal skips the lookup entirely.
  if (auth.mfaVerified !== true && (await organizationRequiresMfa(organizationId))) {
    await emitPermissionDenyAudit({
      request,
      metadata: buildDenyMetadata({
        request,
        extra: {
          deny_reason: 'organization_mfa_required',
          permission_code: permissionCode,
          organization_id: organizationId,
        },
      }),
    });
    throw new ForbiddenError('errors:organizationRequiresMfa').withReason('mfa_required');
  }
}

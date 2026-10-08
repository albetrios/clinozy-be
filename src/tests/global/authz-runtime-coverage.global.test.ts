import { describe, it, expect } from 'vitest';
import { loadRouteAuthorizationModel } from '@/tests/helpers/route-authorization-model.js';

/**
 * Structural parity between the authorization model and the reviewed attack-test map.
 *
 * Every modeled route must have a descriptive mapping below, with no orphan entries.
 * These labels document the intended security scenarios. This gate does not resolve
 * labels to test declarations, execute attacker requests, or prove that mapped tests
 * still exist. Observed authorization coverage must come from the security test run.
 */
const RUNTIME_COVERAGE: Readonly<Record<string, string>> = {
  // ── model: user — cross-user BOLA (object-ownership.security.test.ts) ──────
  'DELETE /api/v1/auth/me/auth-methods/:auth_method_id':
    'object-ownership: auth methods (step-up gated)',
  'DELETE /api/v1/auth/me/sessions/:session_id': 'object-ownership: sessions (step-up gated)',
  'DELETE /api/v1/auth/me/mfa/:mfa_method_id': 'object-ownership: MFA methods (step-up gated)',
  'DELETE /api/v1/auth/me/webauthn/credentials/:credential_id':
    'object-ownership: WebAuthn passkeys (step-up gated)',
  'DELETE /api/v1/notify/notifications/:notification_id': 'object-ownership: notifications',
  'GET /api/v1/notify/notifications/:notification_id': 'object-ownership: notifications',
  'PATCH /api/v1/notify/notifications/:notification_id/read': 'object-ownership: notifications',
  'GET /api/v1/uploads/:upload_id': 'object-ownership: uploads',
  'DELETE /api/v1/uploads/:upload_id': 'object-ownership: uploads',
  'POST /api/v1/uploads/:upload_id/confirm': 'object-ownership: uploads',
  'GET /api/v1/users/me/data-export/:data_export_id': 'object-ownership: data exports',

  // ── model: organization — cross-organization reads (cross-organization-resource.security.test.ts) ─────
  'GET /api/v1/billing/subscriptions/:subscription_id':
    'object-ownership: subscriptions (cross-organization)',
  'GET /api/v1/billing/subscriptions/:subscription_id/payment-setup':
    'object-ownership: subscription payment-setup (cross-organization)',
  'GET /api/v1/notify/webhooks/:webhook_id': 'cross-organization-resource: webhook',
  'GET /api/v1/notify/webhooks/:webhook_id/delivery-attempts':
    'cross-organization-resource: webhook delivery-attempts',
  'GET /api/v1/tenancy/organization/api-keys/:api_key_id': 'cross-organization-resource: API key',
  'GET /api/v1/tenancy/organization/memberships/:membership_id':
    'cross-organization-resource: membership',
  'GET /api/v1/tenancy/organization/memberships/:membership_id/permissions':
    'cross-organization-resource: membership permissions',
  'GET /api/v1/tenancy/organization/notification-policies/:notification_policy_id':
    'cross-organization-resource: notification policy',
  'GET /api/v1/tenancy/organization/roles/:role_id': 'cross-organization-resource: role',
  'GET /api/v1/tenancy/organization/roles/:role_id/permissions':
    'cross-organization-resource: role permissions',
  'GET /api/v1/tenancy/organizations/by-slug/:slug':
    'cross-organization-resource: organization by-slug',

  // ── model: organization — cross-organization writes (cross-organization-mutation.security.test.ts) ────
  'POST /api/v1/billing/subscriptions/:subscription_id/cancel':
    'cross-organization-mutation: subscription cancel',
  'POST /api/v1/billing/subscriptions/:subscription_id/change-plan':
    'cross-organization-mutation: subscription change-plan',
  'POST /api/v1/billing/subscriptions/:subscription_id/resume':
    'cross-organization-mutation: subscription resume',
  'PATCH /api/v1/notify/webhooks/:webhook_id': 'cross-organization-mutation: webhook PATCH',
  'POST /api/v1/notify/webhooks/:webhook_id/test': 'cross-organization-mutation: webhook test',
  'PATCH /api/v1/tenancy/organization/api-keys/:api_key_id':
    'cross-organization-mutation: API key PATCH',
  'DELETE /api/v1/tenancy/organization/api-keys/:api_key_id':
    'cross-organization-mutation: API key DELETE',
  'POST /api/v1/tenancy/organization/api-keys/:api_key_id/rotate':
    'cross-organization-mutation: API key rotate',
  'DELETE /api/v1/notify/webhooks/:webhook_id': 'cross-organization-mutation: webhook DELETE',
  'PATCH /api/v1/tenancy/organization/notification-policies/:notification_policy_id':
    'cross-organization-mutation: notification policy PATCH',
  'DELETE /api/v1/tenancy/organization/notification-policies/:notification_policy_id':
    'cross-organization-mutation: notification policy DELETE',
  'PATCH /api/v1/tenancy/organization/roles/:role_id': 'cross-organization-mutation: role PATCH',
  'DELETE /api/v1/tenancy/organization/roles/:role_id': 'cross-organization-mutation: role DELETE',
  'DELETE /api/v1/tenancy/organization/invitations/:invitation_id':
    'cross-organization-mutation: invitation DELETE',
  'POST /api/v1/tenancy/organization/invitations/:invitation_id/resend':
    'cross-organization-mutation: invitation resend',

  // ── model: tier:owner (tier-and-grant.security.test.ts) ────────────────────
  'POST /api/v1/tenancy/organization/transfer-ownership':
    'tier-and-grant: non-owner transfer-ownership → 403',
  'POST /api/v1/tenancy/organization/leave': 'tier-and-grant: owner cannot leave → 403',
  'PATCH /api/v1/tenancy/organization/memberships/:membership_id':
    "tier-and-grant: cannot modify owner's membership → 403",
  'DELETE /api/v1/tenancy/organization/memberships/:membership_id':
    "tier-and-grant: cannot remove owner's membership → 403",

  // ── model: grant (tier-and-grant.security.test.ts) ─────────────────────────
  'PUT /api/v1/tenancy/organization/roles/:role_id/permissions':
    'tier-and-grant: cannot grant un-held permission → 403',

  // ── model: email (invitation-email.security.test.ts) ───────────────────────
  'POST /api/v1/tenancy/invitations/:invitation_id/accept':
    'invitation-email: email-mismatch accept → 403',

  // ── model: global-role (admin-only.security.test.ts) ───────────────────────
  'GET /api/v1/users/:user_id': 'admin-only: regular user denied',
  'PATCH /api/v1/users/:user_id': 'admin-only: regular user denied',
  'DELETE /api/v1/users/:user_id': 'admin-only: regular user denied',
  'POST /api/v1/users/:user_id/suspend': 'admin-only: regular user denied',
  'POST /api/v1/users/:user_id/unsuspend': 'admin-only: regular user denied',
};

describe('Global: authorization-model attack-test mapping parity', () => {
  const model = loadRouteAuthorizationModel();

  it('every modeled route has a reviewed attack-test mapping', () => {
    const missing = Object.keys(model).filter((key) => !(key in RUNTIME_COVERAGE));
    expect(
      missing,
      `Modeled routes missing an attack-test mapping (review the security scenario and document it here):\n${missing.join('\n')}`,
    ).toEqual([]);
  });

  it('every runtime-coverage entry maps to a real modelled route (no stale entries)', () => {
    const orphans = Object.keys(RUNTIME_COVERAGE).filter((key) => !(key in model));
    expect(orphans, `Stale runtime-coverage entries:\n${orphans.join('\n')}`).toEqual([]);
  });
});

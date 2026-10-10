import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { injectAuthenticated } from '@/tests/helpers/test-http-inject.helper.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import { generateTestToken } from '@/tests/helpers/test-auth.js';
import { createTestPlan } from '@/tests/factories/plan.factory.js';
import {
  seedPermissions,
  createRoleWithPermissions,
  createMembership,
} from '@/domains/tenancy/__tests__/factories/permission.factory.js';
import { invalidatePermissions } from '@/domains/tenancy/sub-domains/permission/permission-cache.service.js';
import { loadOrganizationPermissionRoutesFromCatalog } from '@/tests/helpers/route-catalog-registry.js';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import { plans } from '@/domains/billing/sub-domains/plan/plan.schema.js';

// Keep provider responses deterministic: this suite proves permission dispatch,
// while signed webhook/provider transport contracts are exercised separately.
vi.mock('@/infrastructure/payment/stripe.client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/infrastructure/payment/stripe.client.js')>();
  return {
    ...actual,
    isStripeConfigured: () => true,
    createStripeCustomer: vi.fn(async () => ({ id: 'cus_permission_matrix' })),
    createStripeSubscription: vi.fn(async () => ({
      id: 'sub_permission_matrix',
      status: 'incomplete',
    })),
  };
});

const organizationPermissionRoutes = loadOrganizationPermissionRoutesFromCatalog();
import {
  PARAM_NAME_TO_ENTITY,
  publicIdPlaceholderFor,
} from '@/shared/utils/identity/public-id.util.js';

function placeholderForParamName(paramName: string): string {
  const entity = PARAM_NAME_TO_ENTITY[paramName as keyof typeof PARAM_NAME_TO_ENTITY];
  return entity ? publicIdPlaceholderFor(entity) : 'placeholder';
}

function materializeOrganizationScopedPath(path: string, organizationPublicId: string): string {
  return path
    .replace(':organization_id', organizationPublicId)
    .replace(/:([a-zA-Z_]+)/g, (_, name: string) => placeholderForParamName(name));
}

function payloadForPermissionRoute(
  route: (typeof organizationPermissionRoutes)[number],
  planPublicId: string = publicIdPlaceholderFor('plan'),
  rolePublicId: string = publicIdPlaceholderFor('memberRole'),
): Record<string, unknown> | undefined {
  if (route.method === 'GET' || route.method === 'DELETE') return undefined;
  if (route.path.includes('/subscriptions/:subscription_id/change-plan')) {
    return { plan_id: planPublicId };
  }
  if (route.path.endsWith('/subscriptions')) {
    return { plan_id: planPublicId, billing_cycle: 'monthly' };
  }
  if (route.path.includes('/subscriptions/:subscription_id')) {
    return {};
  }
  if (route.path.endsWith('/api-keys')) {
    return { name: 'Matrix API key', scopes: [route.permissionCode] };
  }
  if (route.path.includes('/api-keys/:api_key_id')) {
    return { name: 'Matrix API key updated' };
  }
  if (route.path.endsWith('/logo')) {
    return { key: 'organization-logos/matrix-logo.png' };
  }
  if (route.path.endsWith('/notification-policies')) {
    // `notification_type` and `channel` must both be valid NOTIFICATION_TYPES / NOTIFICATION_CHANNELS
    // members; an invalid value makes schema validation (400) preempt the permission check (403)
    // this matrix asserts on.
    return { notification_type: 'billing.usage_threshold', channel: 'EMAIL' };
  }
  if (route.path.includes('/notification-policies/:notification_policy_id')) {
    return { default_enabled: false };
  }
  if (route.path.endsWith('/webhooks')) {
    // An event every member may read: `membership.*` / `subscription.*` would also need their read
    // permission, and the matrix grants exactly the route's own.
    return { url: 'https://example.com/webhook', events: ['organization.updated'] };
  }
  if (route.path.includes('/webhooks/:webhook_id')) {
    return { is_enabled: false };
  }
  if (route.path.includes('/invitations/:invitation_id/resend')) {
    return { expires_in_days: 7 };
  }
  if (route.path.endsWith('/memberships')) {
    // REQ-1: "Add member" is invite-by-email — a valid `{ email, role_id }` body so validation
    // passes and the request reaches the permission preHandler this matrix asserts on (the route
    // always creates an INVITED membership; status is no longer an input).
    return {
      email: 'matrix-member@example.test',
      role_id: rolePublicId,
    };
  }
  if (route.path.includes('/memberships/:membership_id')) {
    return { status: 'ACTIVE' };
  }
  if (route.path.endsWith('/roles')) {
    return { name: 'Matrix role' };
  }
  if (route.path.includes('/roles/:role_id/permissions')) {
    return { permission_codes: [] };
  }
  if (route.path.includes('/roles/:role_id')) {
    return { name: 'Matrix role updated' };
  }
  if (route.path.endsWith('/settings')) {
    return { is_email_notifications_enabled: true };
  }
  if (route.path.endsWith('/tenancy/organization')) {
    return { name: 'Matrix organization' };
  }
  return {};
}

function routeNeedsExistingPlan(route: (typeof organizationPermissionRoutes)[number]): boolean {
  return (
    route.path.endsWith('/subscriptions') ||
    route.path.includes('/subscriptions/:subscription_id/change-plan')
  );
}

async function createPermissionMatrixPlan() {
  const plan = await createTestPlan();
  // The authorized half needs a configured billing fixture; missing prices now fail closed.
  await getOperatorDatabase()
    .update(plans)
    .set({
      stripe_price_monthly_id: 'price_permission_matrix',
      stripe_price_yearly_id: 'price_permission_matrix_yearly',
    })
    .where(eq(plans.id, plan.id));
  return plan;
}

function idempotencyHeadersForPermissionRoute(
  route: (typeof organizationPermissionRoutes)[number],
): Record<string, string> | undefined {
  if (route.method === 'GET' || route.method === 'DELETE') return undefined;
  return { 'x-idempotency-key': `permission-matrix-${randomUUID()}` };
}

/** The positive half proves permission dispatch, not success of missing resource fixtures. */
function expectedAuthorizedStatus(route: (typeof organizationPermissionRoutes)[number]): number {
  // Every resource path parameter is a deliberately absent but valid public id.
  if (/:[a-zA-Z_]+/.test(route.path.replace(':organization_id', ''))) return 404;
  if (route.method === 'PUT' && route.path.endsWith('/logo')) {
    // Placeholder logo key fails ownership validation after permission dispatch.
    return 400;
  }
  if (route.method === 'POST' && route.path.endsWith('/payment-methods/setup')) {
    // Fresh organizations have no Stripe customer/subscription to set up payment against.
    return 422;
  }
  return route.method === 'DELETE' ? 204 : 200;
}

/**
 * Authorization matrix — every organization-permission route from docs/routes.txt returns 403 without permission.
 */
describe('Security: Permission route matrix', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { app: testApplication } = await createTestApp();
    app = testApplication;
    expect(organizationPermissionRoutes.length).toBeGreaterThan(20);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanupDatabase();
  });

  for (const route of organizationPermissionRoutes) {
    it(`${route.method} ${route.path} returns 403 without ${route.permissionCode}`, async () => {
      await seedPermissions([route.permissionCode]);

      const user = await createTestUser();
      const organization = await createTestOrganization({ ownerUserId: user.id });
      const role = await createRoleWithPermissions({
        organizationId: organization.id,
        permissionCodes: [],
        createdByUserId: user.id,
      });
      await createMembership({
        userId: user.id,
        organizationId: organization.id,
        roleId: role.id,
      });
      const token = await generateTestToken({
        userId: user.public_id,
        organizationPublicId: organization.public_id,
      });
      const materializedPath = materializeOrganizationScopedPath(
        route.path,
        organization.public_id,
      );
      const plan = routeNeedsExistingPlan(route) ? await createPermissionMatrixPlan() : undefined;
      const headers = idempotencyHeadersForPermissionRoute(route);
      const payload = payloadForPermissionRoute(route, plan?.public_id, role.public_id);

      const response = await injectAuthenticated(app, {
        method: route.method,
        url: materializedPath,
        token,
        ...(headers ? { headers } : {}),
        ...(payload !== undefined ? { payload } : {}),
      });

      expect(response.statusCode, response.body).toBe(403);
    });

    it(`${route.method} ${route.path} reaches its documented authorized outcome with ${route.permissionCode}`, async () => {
      await seedPermissions([route.permissionCode]);

      const user = await createTestUser();
      const organization = await createTestOrganization({ ownerUserId: user.id });
      const role = await createRoleWithPermissions({
        organizationId: organization.id,
        permissionCodes: [route.permissionCode],
        createdByUserId: user.id,
      });
      await createMembership({
        userId: user.id,
        organizationId: organization.id,
        roleId: role.id,
      });
      await invalidatePermissions(user.public_id, organization.public_id);
      // A recent step-up too: some permission routes also sit behind the step-up gate
      // (organization deletion), and the matrix asserts the permission outcome.
      const token = await generateTestToken({
        userId: user.public_id,
        organizationPublicId: organization.public_id,
        stepUp: true,
      });
      const materializedPath = materializeOrganizationScopedPath(
        route.path,
        organization.public_id,
      );
      const plan = routeNeedsExistingPlan(route) ? await createPermissionMatrixPlan() : undefined;
      const headers = idempotencyHeadersForPermissionRoute(route);
      const payload = payloadForPermissionRoute(route, plan?.public_id, role.public_id);

      const response = await injectAuthenticated(app, {
        method: route.method,
        url: materializedPath,
        token,
        ...(headers ? { headers } : {}),
        ...(payload !== undefined ? { payload } : {}),
      });

      const expectedStatus = expectedAuthorizedStatus(route);
      expect(response.statusCode, `${route.method} ${route.path}: ${response.body}`).toBe(
        expectedStatus,
      );
      if (expectedStatus >= 400) {
        const body = response.json() as {
          error?: { type?: string; code?: string; reason?: string };
        };
        expect(body.error).toBeDefined();
        if (expectedStatus === 404) expect(body.error?.code).toBe('not_found');
        if (expectedStatus === 400) expect(body.error?.type).toBe('validation_error');
        if (expectedStatus === 422) expect(body.error?.code).toBe('unprocessable_entity');
      }
    });
  }
});

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
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
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import {
  appRouteBody,
  appRouteDeleteQuery,
  appRouteGetQuery,
  placeholderAppRouteReferences,
} from '@/tests/helpers/app-route-requests.js';

const organizationPermissionRoutes = loadOrganizationPermissionRoutesFromCatalog();

/** The public API prefix the catalog paths carry; the shared route table keys drop it. */
const API_PREFIX = '/api/v1';

/** Placeholder ids for the shared table's bodies — the permission check answers before any lookup. */
const PLACEHOLDER_REFERENCES = placeholderAppRouteReferences();

/**
 * The codes a route checks besides the one its catalog line names: an app export also reads the
 * list (`<resource>:read`, the base controller's `readPermission`), and a patient's clinical notes,
 * images and reports also need `patient_clinical_record:read` (their routes stack both checks).
 */
function companionPermissionCodes(route: (typeof organizationPermissionRoutes)[number]): string[] {
  if (route.permissionCode.endsWith(':export')) {
    return [route.permissionCode.replace(/:export$/, ':read')];
  }
  if (/\/app\/patients\/:patient_id\/(clinical-notes|images|reports)\b/.test(route.path)) {
    return [APP_PERMISSIONS.PATIENT_CLINICAL_RECORD_READ];
  }
  return [];
}

/** A catalog path without the API prefix (`/app/…`, `/tenancy/…`). */
function routeKeyPath(path: string): string {
  return path.startsWith(API_PREFIX) ? path.slice(API_PREFIX.length) : path;
}
import {
  PARAM_NAME_TO_ENTITY,
  publicIdPlaceholderFor,
} from '@/shared/utils/identity/public-id.util.js';

function placeholderForParamName(paramName: string): string {
  const entity = PARAM_NAME_TO_ENTITY[paramName as keyof typeof PARAM_NAME_TO_ENTITY];
  return entity ? publicIdPlaceholderFor(entity) : 'placeholder';
}

function materializeOrganizationScopedPath(
  route: (typeof organizationPermissionRoutes)[number],
  organizationPublicId: string,
): string {
  const path = route.path
    .replace(':organization_id', organizationPublicId)
    .replace(/:([a-zA-Z_]+)/g, (_, name: string) => placeholderForParamName(name));
  // A DELETE's reason and a GET's required filters are query schema: without them the request
  // answers 400 before the permission check this matrix asserts on.
  if (route.method === 'DELETE') return `${path}${appRouteDeleteQuery(routeKeyPath(route.path))}`;
  if (route.method === 'GET') {
    return `${path}${appRouteGetQuery({ path: routeKeyPath(route.path), references: PLACEHOLDER_REFERENCES })}`;
  }
  return path;
}

function payloadForPermissionRoute(
  route: (typeof organizationPermissionRoutes)[number],
  planPublicId: string = publicIdPlaceholderFor('plan'),
): Record<string, unknown> | undefined {
  if (route.method === 'GET' || route.method === 'DELETE') return undefined;
  // The app's writes and the tenancy team writes: the shared table's smallest valid body.
  const sharedBody = appRouteBody({
    method: route.method,
    path: routeKeyPath(route.path),
    references: PLACEHOLDER_REFERENCES,
  });
  if (sharedBody !== undefined) return sharedBody as Record<string, unknown>;
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
    return { url: 'https://example.com/webhook', events: ['notification.created'] };
  }
  if (route.path.includes('/webhooks/:webhook_id')) {
    return { is_enabled: false };
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

function idempotencyHeadersForPermissionRoute(
  route: (typeof organizationPermissionRoutes)[number],
): Record<string, string> | undefined {
  if (route.method === 'GET' || route.method === 'DELETE') return undefined;
  return { 'x-idempotency-key': `permission-matrix-${randomUUID()}` };
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
      const materializedPath = materializeOrganizationScopedPath(route, organization.public_id);
      const plan = routeNeedsExistingPlan(route) ? await createTestPlan() : undefined;
      const headers = idempotencyHeadersForPermissionRoute(route);
      const payload = payloadForPermissionRoute(route, plan?.public_id);

      const response = await injectAuthenticated(app, {
        method: route.method,
        url: materializedPath,
        token,
        ...(headers ? { headers } : {}),
        ...(payload !== undefined ? { payload } : {}),
      });

      expect(response.statusCode, response.body).toBe(403);
    });

    it(`${route.method} ${route.path} does not return 403 with ${route.permissionCode}`, async () => {
      const grantedCodes = [route.permissionCode, ...companionPermissionCodes(route)];
      await seedPermissions(grantedCodes);

      const user = await createTestUser();
      const organization = await createTestOrganization({ ownerUserId: user.id });
      const role = await createRoleWithPermissions({
        organizationId: organization.id,
        permissionCodes: grantedCodes,
        createdByUserId: user.id,
      });
      await createMembership({
        userId: user.id,
        organizationId: organization.id,
        roleId: role.id,
      });
      await invalidatePermissions(user.public_id, organization.public_id);
      const token = await generateTestToken({
        userId: user.public_id,
        organizationPublicId: organization.public_id,
      });
      const materializedPath = materializeOrganizationScopedPath(route, organization.public_id);
      const plan = routeNeedsExistingPlan(route) ? await createTestPlan() : undefined;
      const headers = idempotencyHeadersForPermissionRoute(route);
      const payload = payloadForPermissionRoute(route, plan?.public_id);

      const response = await injectAuthenticated(app, {
        method: route.method,
        url: materializedPath,
        token,
        ...(headers ? { headers } : {}),
        ...(payload !== undefined ? { payload } : {}),
      });

      expect(response.statusCode, response.body).not.toBe(403);
    });
  }
});

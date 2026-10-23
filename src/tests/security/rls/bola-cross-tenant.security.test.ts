import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { injectAuthenticated } from '@/tests/helpers/test-http-inject.helper.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import { generateTestToken } from '@/tests/helpers/test-auth.js';
import {
  seedPermissions,
  createRoleWithPermissions,
  createMembership,
} from '@/domains/tenancy/__tests__/factories/permission.factory.js';
import { createTestWebhook } from '@/tests/factories/webhook.factory.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import {
  AppFlow,
  type AppFlowResponse,
  calendarDay,
} from '@/domains/app/__tests__/factories/app-flow.factory.js';

/**
 * BOLA / IDOR cross-tenant sweep on the by-:id routes.
 *
 * The existing tenant-isolation suite covers list endpoints; this covers the
 * classic IDOR vector — fetching/mutating a specific resource by id that belongs
 * to another organization.
 *
 * Tenancy by-id routes were flattened (`/tenancy/organization/roles/:role_id`,
 * `/tenancy/organization/memberships/:membership_id`) so the organization is
 * resolved from the JWT `org` claim — there is no organization path segment to
 * point at organization B. The only addressable attack shape is therefore the real guard:
 *  - foreign-resource-id: the attacker, fully privileged in their OWN organization A
 *    (token scoped to A via the `org` claim), puts organization B's resource id in the
 *    flat route → 404 (the organization-scoped lookup runs under organization A's RLS context, so
 *    the foreign resource is invisible). Privileges in your organization must never reach
 *    another org's objects.
 *  - foreign-resource-id in a query: an app read that names a record by id in its query
 *    (`GET /app/appointments/slots?exclude_appointment_id=`) answers organization B's id exactly
 *    as it answers an id that exists nowhere (400 on the field), and organization A's own answer
 *    does not move.
 */
const ALL_PERMISSIONS = [
  'webhook:read',
  'webhook:manage',
  'role:read',
  'role:manage',
  'membership:read',
  'membership:manage',
];

describe('Security: BOLA / IDOR cross-tenant (by-id)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanupDatabase();
    await seedPermissions(ALL_PERMISSIONS);
  });

  /**
   * Builds organization A (attacker, fully privileged in their own organization) and organization B (victim,
   * with a webhook, a role, and a membership). Returns organization-A's admin token plus
   * the public ids needed to address organization B's resources.
   */
  async function setup() {
    const attacker = await createTestUser();
    const organizationA = await createTestOrganization({ ownerUserId: attacker.id });
    const roleA = await createRoleWithPermissions({
      organizationId: organizationA.id,
      permissionCodes: ALL_PERMISSIONS,
    });
    await createMembership({
      userId: attacker.id,
      organizationId: organizationA.id,
      roleId: roleA.id,
    });

    const victimOwner = await createTestUser();
    const organizationB = await createTestOrganization({ ownerUserId: victimOwner.id });
    const webhookB = await createTestWebhook({ organizationId: organizationB.id });
    const roleB = await createRoleWithPermissions({
      organizationId: organizationB.id,
      permissionCodes: ['webhook:read'],
    });
    const victimMember = await createTestUser();
    const membershipB = await createMembership({
      userId: victimMember.id,
      organizationId: organizationB.id,
      roleId: roleB.id,
    });

    return { attacker, organizationA, organizationB, webhookB, roleB, membershipB };
  }

  // Each tuple: a flat by-id resource path builder (organization resolved from
  // the JWT `org` claim, so only the resource id is in the path). Webhook is
  // covered by the dedicated flat-route tests below, mirroring the billing by-id
  // pattern.
  const RESOURCES = [
    {
      name: 'role',
      path: (id: string) => `/tenancy/organization/roles/${id}`,
    },
    {
      name: 'membership',
      path: (id: string) => `/tenancy/organization/memberships/${id}`,
    },
  ] as const;

  function resourceId(name: string, resources: Awaited<ReturnType<typeof setup>>): string {
    if (name === 'role') return resources.roleB.public_id;
    return resources.membershipB.public_id;
  }

  // ─── foreign-resource-id (organization B's id inside organization A's claim context) → 404 ─────
  //
  // With flat routes there is no organization path param, so "address organization B directly"
  // (the old cross-organization-id shape) is no longer expressible — an actor only ever
  // addresses its own claim organization. The surviving (and real) IDOR guard: organization B's
  // resource id placed in the flat route while the attacker is scoped to organization A.

  describe('foreign-resource-id: organization B resource id inside organization A context', () => {
    for (const resource of RESOURCES) {
      it(`GET organization B's ${resource.name} via organization A → not found`, async () => {
        const ctx = await setup();
        // Attacker scoped to organization A via the `org` claim; flat route resolves to A.
        const tokenScopedToA = await generateTestToken({
          userId: ctx.attacker.public_id,
          organizationPublicId: ctx.organizationA.public_id,
        });
        const response = await injectAuthenticated(app, {
          method: 'GET',
          url: testApiPath(resource.path(resourceId(resource.name, ctx))),
          token: tokenScopedToA,
        });
        // Attacker IS authorized in organization A, so this reaches the organization-scoped lookup,
        // which must not find organization B's resource.
        expect(response.statusCode).toBe(404);
      });
    }

    it("GET organization B's webhook via organization A → not found (flat route, organization from claim)", async () => {
      const ctx = await setup();
      // Attacker IS authorized in organization A (token scoped to A via the `org` claim),
      // so the flat webhook route resolves to organization A and the organization-scoped lookup must
      // not find organization B's webhook.
      const tokenScopedToA = await generateTestToken({
        userId: ctx.attacker.public_id,
        organizationPublicId: ctx.organizationA.public_id,
      });
      const response = await injectAuthenticated(app, {
        method: 'GET',
        url: testApiPath(`/notify/webhooks/${ctx.webhookB.public_id}`),
        token: tokenScopedToA,
      });
      expect(response.statusCode).toBe(404);
    });

    it("DELETE organization B's webhook via organization A → not found (no cross-tenant mutation)", async () => {
      const ctx = await setup();
      const tokenScopedToA = await generateTestToken({
        userId: ctx.attacker.public_id,
        organizationPublicId: ctx.organizationA.public_id,
      });
      const response = await injectAuthenticated(app, {
        method: 'DELETE',
        url: testApiPath(`/notify/webhooks/${ctx.webhookB.public_id}`),
        token: tokenScopedToA,
      });
      expect(response.statusCode).toBe(404);
    });
  });

  // ─── foreign-resource-id in a query parameter (an app read inside organization A) ──────
  //
  // The slots read takes the booking being moved as `exclude_appointment_id`. Organization B's
  // booking named there must be unknown inside organization A's claim context — the same 400 an
  // id that exists nowhere gets — and must never change A's grid.

  describe('foreign-resource-id in a query: organization B appointment inside organization A', () => {
    const UNKNOWN_APPOINTMENT = 'appt_aaaaaaaaaaaaaaaaaaaaa';
    const STARTS = '[.data.slots[].start_time] | join(",")';

    /**
     * A 60-minute booking at 15:00 with `fixture`'s doctor at Vesu — on `day`, or on the first day
     * 30–44 days out that takes it.
     */
    async function bookDoctor(options: {
      fixture: AppFixture;
      phone: string;
      day?: string;
    }): Promise<{ day: string; appointmentId: string }> {
      const flow = new AppFlow(app, options.fixture).as('owner');
      const contact = await flow.call('POST', '/app/contacts', {
        first_name: 'Asha',
        last_name: 'Bola',
        phones: [{ phone: options.phone, is_primary: true }],
      });
      expect(contact.status).toBe(200);
      const contactId = flow.last('.data.id');
      const candidates =
        options.day === undefined
          ? Array.from({ length: 15 }, (_, offset) => calendarDay(options.fixture, 30 + offset))
          : [options.day];
      for (const day of candidates) {
        const booking = await flow.call('POST', '/app/appointments', {
          contact_id: contactId,
          branch_id: options.fixture.branches.vesu,
          doctor_membership_id: options.fixture.members.doctor.membershipPublicId,
          appointment_date: day,
          start_time: '15:00',
          duration_minutes: 60,
          service_label: 'Consultation',
        });
        if (booking.status === 200) return { day, appointmentId: flow.last('.data.id') };
      }
      throw new Error('bookDoctor: the doctor takes no booking at 15:00 in those days');
    }

    /** A 400's `error`, with the id it names replaced — so two refusals compare as one. */
    function refusalOf(response: AppFlowResponse, id: string): string {
      return JSON.stringify((response.body as { error?: unknown }).error).replaceAll(id, '<id>');
    }

    it("slots with organization B's appointment as exclude_appointment_id inside organization A → 400, A's grid unchanged", async () => {
      const attacker = await createAppFixture(app);
      const victim = await createAppFixture(app);
      const own = await bookDoctor({ fixture: attacker, phone: '+919812300021' });
      const foreign = await bookDoctor({
        fixture: victim,
        phone: '+919812300022',
        day: own.day,
      });
      // Organization A's owner, scoped to A by the `org` claim, reading A's own doctor's grid.
      const attackFlow = new AppFlow(app, attacker).as('owner');
      const read = `/app/appointments/slots?branch_id=${attacker.branches.vesu}&appointment_date=${own.day}&duration_minutes=60&doctor_membership_id=${attacker.members.doctor.membershipPublicId}&step_minutes=15`;

      expect((await attackFlow.call('GET', read)).status).toBe(200);
      const before = attackFlow.last(STARTS);
      expect(before.split(',')).not.toContain('15:00');

      const foreignRead = await attackFlow.call(
        'GET',
        `${read}&exclude_appointment_id=${foreign.appointmentId}`,
      );
      expect(foreignRead.status).toBe(400);
      expect(attackFlow.last('[.error.errors[].field] | join(",")')).toBe('exclude_appointment_id');
      const unknownRead = await attackFlow.call(
        'GET',
        `${read}&exclude_appointment_id=${UNKNOWN_APPOINTMENT}`,
      );
      expect(unknownRead.status).toBe(400);
      // Nothing tells organization B's booking apart from one that does not exist.
      expect(refusalOf(foreignRead, foreign.appointmentId)).toBe(
        refusalOf(unknownRead, UNKNOWN_APPOINTMENT),
      );

      expect((await attackFlow.call('GET', read)).status).toBe(200);
      expect(attackFlow.last(STARTS)).toBe(before);

      // Baseline: A's own booking does leave A's grid — the refusal is specific to B's id.
      const ownRead = await attackFlow.call(
        'GET',
        `${read}&exclude_appointment_id=${own.appointmentId}`,
      );
      expect(ownRead.status).toBe(200);
      expect(attackFlow.last(STARTS).split(',')).toContain('15:00');
    });
  });

  // ─── Baseline: same-organization access works (proves the guard is specific) ─────────

  it('baseline: a user can GET a webhook in their OWN organization (200)', async () => {
    const ctx = await setup();
    const ownWebhook = await createTestWebhook({ organizationId: ctx.organizationA.id });
    // Flat route: organization A resolved from the `org` claim, webhook owned by organization A.
    const tokenScopedToA = await generateTestToken({
      userId: ctx.attacker.public_id,
      organizationPublicId: ctx.organizationA.public_id,
    });
    const response = await injectAuthenticated(app, {
      method: 'GET',
      url: testApiPath(`/notify/webhooks/${ownWebhook.public_id}`),
      token: tokenScopedToA,
    });
    expect(response.statusCode).toBe(200);
  });
});

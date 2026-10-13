import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { createTestApp } from '@/tests/helpers/test-app.js';
import {
  injectAuthenticated,
  injectUnauthenticated,
} from '@/tests/helpers/test-http-inject.helper.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import { createTestBranch } from '@/tests/factories/branches.factory.js';
import { generateTestToken } from '@/tests/helpers/test-auth.js';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';
import {
  seedPermissions,
  createRoleWithPermissions,
  createMembership,
} from '@/domains/tenancy/__tests__/factories/permission.factory.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import { MEMBERSHIP_STATUS } from '@/domains/tenancy/sub-domains/membership/membership.constants.js';
import { roles } from '@/domains/tenancy/sub-domains/member-roles/member-role.schema.js';
import { organization_settings } from '@/domains/tenancy/sub-domains/organization/organization-settings/organization-settings.schema.js';
import { offerings } from '@/domains/app/sub-domains/offerings/offerings.schema.js';
import { contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';

const SETUP_PATH = testApiPath('/app/onboarding-setup');
const COMPLETE_PATH = testApiPath('/app/onboarding-setup/complete');

type SetupBody = {
  data: {
    answered_steps: string[];
    skipped_items: string[];
    main_branch_id: string | null;
    next_step: string | null;
    live_checks: { clinic_type: boolean; main_branch: boolean; services: boolean };
    is_live: boolean;
    has_someone_to_book: boolean;
    guide_items: { key: string; is_done: boolean; is_skipped: boolean; can_skip: boolean }[];
    guide_done_count: number;
    guide_total_count: number;
    deferred_at: string | null;
    completed_at: string | null;
    guide_hidden_at: string | null;
    guide_done_at: string | null;
    completed_by_membership_id: string | null;
    updated_at: string;
  };
};
type ErrorBody = {
  error: { code: string; reason?: string; detail: string; errors?: { field: string }[] };
};

/**
 * feat-clinic-setup ROUTE #4 — `GET`/`PATCH /app/onboarding-setup` and `POST …/complete`
 * (routes-final §2.A): managers only, team clinics only; ticks read from the records; merged
 * answers; going live checked by the server, once; "all done" stored once.
 */
describe('Onboarding setup — Integration', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanupDatabase();
    await seedPermissions([
      TENANCY_PERMISSIONS.ORGANIZATION_READ,
      TENANCY_PERMISSIONS.ORGANIZATION_UPDATE,
    ]);
  });

  /** A new team clinic and its owner, signed in with organization:update. */
  async function newClinic(options: { type?: 'TEAM' | 'PERSONAL' } = {}) {
    const owner = await createTestUser();
    const organization = await createTestOrganization({
      ownerUserId: owner.id,
      type: options.type ?? 'TEAM',
    });
    const role = await createRoleWithPermissions({
      organizationId: organization.id,
      permissionCodes: [
        TENANCY_PERMISSIONS.ORGANIZATION_READ,
        TENANCY_PERMISSIONS.ORGANIZATION_UPDATE,
      ],
    });
    const membership = await createMembership({
      userId: owner.id,
      organizationId: organization.id,
      roleId: role.id,
    });
    const token = await generateTestToken({
      userId: owner.public_id,
      organizationPublicId: organization.public_id,
    });
    return { owner, organization, membership, token };
  }

  type Clinic = Awaited<ReturnType<typeof newClinic>>;

  /** Another member of `clinic`, holding a system role named `roleName` when given. */
  async function addMember(clinic: Clinic, options: { roleName?: string; status?: string } = {}) {
    const user = await createTestUser();
    const role = await createRoleWithPermissions({
      organizationId: clinic.organization.id,
      permissionCodes: [TENANCY_PERMISSIONS.ORGANIZATION_READ],
      name: options.roleName ?? `Front desk ${randomUUID().slice(0, 6)}`,
    });
    if (options.roleName) {
      await getOperatorDatabase()
        .update(roles)
        .set({ is_system: true })
        .where(eq(roles.id, role.id));
    }
    return createMembership({
      userId: user.id,
      organizationId: clinic.organization.id,
      roleId: role.id,
      status: options.status ?? MEMBERSHIP_STATUS.ACTIVE,
    });
  }

  /** One active service of `clinic` (operator connection). */
  async function addService(clinic: Clinic, name: string) {
    await getOperatorDatabase()
      .insert(offerings)
      .values({
        public_id: generatePublicId('offering'),
        organization_id: clinic.organization.id,
        name,
        category: 'consultation',
        price: '500.00',
      });
  }

  /** One appointment of `clinic` at its first branch, with its owner as the doctor (operator connection). */
  async function addAppointment(clinic: Clinic, branchId: number) {
    const [contact] = await getOperatorDatabase()
      .insert(contacts)
      .values({
        public_id: generatePublicId('contact'),
        organization_id: clinic.organization.id,
        first_name: 'Riya',
        primary_phone: '+919825012345',
        // The database's `trg_contacts_household` fills the household (as the contacts seed does).
      } as typeof contacts.$inferInsert)
      .returning({ id: contacts.id });
    await getOperatorDatabase()
      .insert(appointments)
      .values({
        public_id: generatePublicId('appointment'),
        organization_id: clinic.organization.id,
        contact_id: contact!.id,
        branch_id: branchId,
        service_label: 'Consultation',
        doctor_membership_id: clinic.membership.id,
        appointment_date: '2026-10-20',
        start_time: '11:30',
      });
  }

  function getSetup(token: string) {
    return injectAuthenticated(app, { url: SETUP_PATH, token });
  }

  function changeSetup(token: string, payload: Record<string, unknown>) {
    return injectAuthenticated(app, { method: 'PATCH', url: SETUP_PATH, token, payload });
  }

  function goLive(token: string) {
    return injectAuthenticated(app, {
      method: 'POST',
      url: COMPLETE_PATH,
      token,
      headers: { 'x-idempotency-key': `setup-${randomUUID()}` },
    });
  }

  describe('access', () => {
    it('returns 401 without authentication', async () => {
      const response = await injectUnauthenticated(app, { url: SETUP_PATH });
      expect(response.statusCode).toBe(401);
    });

    it('returns 403 without organization:update', async () => {
      const clinic = await newClinic();
      const member = await createTestUser();
      const role = await createRoleWithPermissions({
        organizationId: clinic.organization.id,
        permissionCodes: [TENANCY_PERMISSIONS.ORGANIZATION_READ],
      });
      await createMembership({
        userId: member.id,
        organizationId: clinic.organization.id,
        roleId: role.id,
      });
      const token = await generateTestToken({
        userId: member.public_id,
        organizationPublicId: clinic.organization.public_id,
      });
      expect((await getSetup(token)).statusCode).toBe(403);
      expect((await changeSetup(token, { deferred: true })).statusCode).toBe(403);
      expect((await goLive(token)).statusCode).toBe(403);
    });

    it('refuses a personal workspace: 404 on the read, 422 on the writes, team_organization_required', async () => {
      const clinic = await newClinic({ type: 'PERSONAL' });
      const read = await getSetup(clinic.token);
      expect(read.statusCode).toBe(404);
      expect((read.json() as ErrorBody).error.reason).toBe('team_organization_required');
      for (const response of [
        await changeSetup(clinic.token, { deferred: true }),
        await goLive(clinic.token),
      ]) {
        expect(response.statusCode).toBe(422);
        expect((response.json() as ErrorBody).error.reason).toBe('team_organization_required');
      }
    });

    it('returns 422 without X-Idempotency-Key on going live', async () => {
      const clinic = await newClinic();
      const response = await injectAuthenticated(app, {
        method: 'POST',
        url: COMPLETE_PATH,
        token: clinic.token,
      });
      expect(response.statusCode).toBe(422);
    });
  });

  describe('GET /app/onboarding-setup', () => {
    it('starts a new clinic at step 1 with nothing ticked', async () => {
      const clinic = await newClinic();
      const response = await getSetup(clinic.token);
      expect(response.statusCode).toBe(200);
      expect((response.json() as SetupBody).data).toMatchObject({
        answered_steps: [],
        skipped_items: [],
        main_branch_id: null,
        next_step: 'clinic_type',
        live_checks: { clinic_type: false, main_branch: false, services: false },
        is_live: false,
        has_someone_to_book: false,
        guide_items: [
          { key: 'treatments', is_done: false, is_skipped: false, can_skip: true },
          { key: 'invite_team', is_done: false, is_skipped: false, can_skip: true },
          { key: 'first_appointment', is_done: false, is_skipped: false, can_skip: false },
        ],
        guide_done_count: 0,
        guide_total_count: 3,
        deferred_at: null,
        completed_at: null,
        guide_hidden_at: null,
        guide_done_at: null,
        completed_by_membership_id: null,
      });
    });

    it('follows the steps in order, reading the branch from the records', async () => {
      const clinic = await newClinic();
      await changeSetup(clinic.token, { answered_steps_add: ['clinic_type'] });
      expect(((await getSetup(clinic.token)).json() as SetupBody).data.next_step).toBe('location');

      const branch = await createTestBranch({
        organizationId: clinic.organization.id,
        isMain: true,
      });
      const afterBranch = (await getSetup(clinic.token)).json() as SetupBody;
      expect(afterBranch.data.next_step).toBe('you');
      expect(afterBranch.data.main_branch_id).toBe(branch.public_id);

      await changeSetup(clinic.token, { answered_steps_add: ['you'] });
      expect(((await getSetup(clinic.token)).json() as SetupBody).data.next_step).toBe('go_live');
    });

    it('reads someone to book from a Doctor or Therapist, main role or extra', async () => {
      const clinic = await newClinic();
      await addMember(clinic, { roleName: 'Front desk' });
      expect(((await getSetup(clinic.token)).json() as SetupBody).data.has_someone_to_book).toBe(
        false,
      );
      await addMember(clinic, { roleName: 'Therapist' });
      expect(((await getSetup(clinic.token)).json() as SetupBody).data.has_someone_to_book).toBe(
        true,
      );
    });
  });

  describe('PATCH /app/onboarding-setup', () => {
    it.each([
      ['an empty body', {}],
      ['a step that is read from the records', { answered_steps_add: ['location'] }],
      ['a repeated value', { answered_steps_add: ['you', 'you'] }],
      ['skipping the first appointment', { skipped_items_add: ['first_appointment'] }],
      ['deferred false', { deferred: false }],
      ['an unknown field', { step: 'you' }],
    ])('returns 400 for %s', async (_case, payload) => {
      const clinic = await newClinic();
      const response = await changeSetup(clinic.token, payload);
      expect(response.statusCode).toBe(400);
    });

    it('keeps both answers when two admins answer at once', async () => {
      const clinic = await newClinic();
      const [first, second] = await Promise.all([
        changeSetup(clinic.token, { answered_steps_add: ['clinic_type'] }),
        changeSetup(clinic.token, { answered_steps_add: ['you'] }),
      ]);
      expect([first.statusCode, second.statusCode]).toEqual([200, 200]);
      const body = (await getSetup(clinic.token)).json() as SetupBody;
      expect([...body.data.answered_steps].sort()).toEqual(['clinic_type', 'you']);
    });

    it('skips and un-skips guide items, defers once, hides and reopens the guide', async () => {
      const clinic = await newClinic();
      const skipped = (
        await changeSetup(clinic.token, {
          skipped_items_add: ['treatments', 'invite_team'],
          deferred: true,
          guide_hidden: true,
        })
      ).json() as SetupBody;
      expect([...skipped.data.skipped_items].sort()).toEqual(['invite_team', 'treatments']);
      expect(skipped.data.deferred_at).not.toBeNull();
      expect(skipped.data.guide_hidden_at).not.toBeNull();

      const reopened = (
        await changeSetup(clinic.token, {
          skipped_items_remove: ['treatments'],
          deferred: true,
          guide_hidden: false,
        })
      ).json() as SetupBody;
      expect(reopened.data.skipped_items).toEqual(['invite_team']);
      expect(reopened.data.deferred_at).toBe(skipped.data.deferred_at);
      expect(reopened.data.guide_hidden_at).toBeNull();
    });

    it('returns 409 record_changed for a stale expected_updated_at', async () => {
      const clinic = await newClinic();
      const first = (await getSetup(clinic.token)).json() as SetupBody;
      await changeSetup(clinic.token, { answered_steps_add: ['clinic_type'] });
      const response = await changeSetup(clinic.token, {
        answered_steps_add: ['you'],
        expected_updated_at: first.data.updated_at,
      });
      expect(response.statusCode).toBe(409);
      expect((response.json() as ErrorBody).error.reason).toBe('record_changed');
    });
  });

  describe('POST /app/onboarding-setup/complete', () => {
    it('refuses with 409 onboarding_setup_incomplete while a live check fails', async () => {
      const clinic = await newClinic();
      await createTestBranch({ organizationId: clinic.organization.id, isMain: true });
      const response = await goLive(clinic.token);
      expect(response.statusCode).toBe(409);
      const body = response.json() as ErrorBody;
      expect(body.error.reason).toBe('onboarding_setup_incomplete');
      expect(body.error.detail).toContain('clinic_type');
      expect(body.error.detail).toContain('services');
      expect(body.error.detail).not.toContain('main_branch');
    });

    it('goes live once, recording who, without needing someone to book', async () => {
      const clinic = await newClinic();
      await changeSetup(clinic.token, { answered_steps_add: ['clinic_type'] });
      await createTestBranch({ organizationId: clinic.organization.id, isMain: true });
      await addService(clinic, 'Consultation');

      const first = await goLive(clinic.token);
      expect(first.statusCode).toBe(200);
      const live = (first.json() as SetupBody).data;
      expect(live).toMatchObject({
        is_live: true,
        next_step: null,
        has_someone_to_book: false,
        completed_by_membership_id: clinic.membership.public_id,
      });

      const again = (await goLive(clinic.token)).json() as SetupBody;
      expect(again.data.completed_at).toBe(live.completed_at);
      expect(again.data.completed_by_membership_id).toBe(clinic.membership.public_id);
    });

    it('stores "all done" once, when the live clinic first has every guide item done or skipped', async () => {
      const clinic = await newClinic();
      await changeSetup(clinic.token, { answered_steps_add: ['clinic_type'] });
      const branch = await createTestBranch({
        organizationId: clinic.organization.id,
        isMain: true,
      });
      await addService(clinic, 'Consultation');
      await addService(clinic, 'Chemical peel');
      await goLive(clinic.token);
      await addMember(clinic, { status: MEMBERSHIP_STATUS.INVITED });

      const notYet = (await getSetup(clinic.token)).json() as SetupBody;
      expect(notYet.data.guide_done_count).toBe(2);
      expect(notYet.data.guide_done_at).toBeNull();

      await addAppointment(clinic, branch.id);
      const done = (await getSetup(clinic.token)).json() as SetupBody;
      expect(done.data.guide_done_count).toBe(3);
      expect(done.data.guide_done_at).not.toBeNull();

      const [row] = await getOperatorDatabase()
        .select({ guide_done_at: organization_settings.setup_guide_done_at })
        .from(organization_settings)
        .where(eq(organization_settings.organization_id, clinic.organization.id));
      expect(row?.guide_done_at?.toISOString()).toBe(done.data.guide_done_at);
    });
  });
});

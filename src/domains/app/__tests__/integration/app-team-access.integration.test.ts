import { afterAll, beforeAll, describe, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import {
  type AppFixture,
  type AppFixtureRole,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow, calendarDay } from '@/domains/app/__tests__/factories/app-flow.factory.js';

/**
 * The team's access end to end (tasks T1, T2, T3, PT3 —
 * docs/reviews/launch-confidence-plan-2026-10-09.md): extra roles add up and leave at once
 * (D5, WC-40); a role without the prescription code cannot approve one (P15); a branch taken away
 * leaves the member's preferences (D9, U2); the locked Admin and Owner roles and the Owner's own
 * powers stay put, with the reasons a client tells them apart by (D40, D8, T7, D81 (4)); the owner
 * is named and may hold extra roles, the Owner role first (D81 (4)).
 */
describe('Team access — integration (D5, D8, D40, P15, D81)', () => {
  const S = String(Date.now());
  const T = `t${S}`;
  const digits = `3${S.slice(-7)}`;
  const REASON = '.error.reason';
  const MEMBERSHIPS = '/tenancy/organization/memberships';
  const ROLES = '/tenancy/organization/roles';

  let app: FastifyInstance;
  let fixture: AppFixture;
  let owner: AppFlow;
  let patientFile = '';
  let medicine = '';

  /** A flow acting as one fixture member. */
  const as = (role: AppFixtureRole) => new AppFlow(app, fixture).as(role);

  /** A draft prescription by the doctor for the run's patient; answers its approve path. */
  async function draftPrescription(): Promise<string> {
    const doctor = as('doctor');
    const prescriptions = `/app/patients/${patientFile}/prescriptions`;
    await doctor.expect(200, 'a draft', 'POST', prescriptions, {
      doctor_membership_id: fixture.members.doctor.membershipPublicId,
      prescription_date: calendarDay(fixture, 0),
      items: [{ medicine_name: 'Tretinoin 0.025%', medicine_id: medicine, quantity: 1 }],
    });
    return `${prescriptions}/${doctor.last('.data.id')}/approve`;
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    owner = new AppFlow(app, fixture).as('owner');
    await owner.expect(200, 'a contact', 'POST', '/app/contacts', {
      first_name: 'Ira',
      last_name: T,
      phones: [{ phone: `+91${digits}01`, is_primary: true }],
    });
    await owner.expect(200, 'her file', 'POST', '/app/patients', {
      contact_id: owner.last('.data.id'),
      home_branch_id: fixture.branches.vesu,
    });
    patientFile = owner.last('.data.id');
    await owner.expect(200, 'a manufacturer', 'POST', '/app/manufacturers', {
      name: `Glenmark ${T}`,
    });
    await owner.expect(200, 'a medicine', 'POST', '/app/medicines', {
      name: `Tretinoin ${T}`,
      manufacturer_id: owner.last('.data.id'),
      mrp: 120,
    });
    medicine = owner.last('.data.id');
  });

  afterAll(async () => {
    await app.close();
  });

  it('T1, PT3: a second role adds its codes, and taking it away removes them at once', async () => {
    const pharmacist = fixture.members.pharmacist.membershipPublicId;
    const member = `${MEMBERSHIPS}/${pharmacist}`;

    await as('pharmacist').expect(
      403,
      'the pharmacist approves no prescription (P15)',
      'POST',
      await draftPrescription(),
    );

    await owner.expect(200, 'add the Doctor role to the pharmacist', 'PATCH', member, {
      role_ids: [fixture.roles.pharmacist, fixture.roles.doctor],
    });
    const both = as('pharmacist');
    await both.expect(200, 'now they approve one (the union)', 'POST', await draftPrescription());
    await both.expect(200, 'and keep their own section', 'GET', '/app/medicines');
    await owner.expect(200, 'their permissions', 'GET', `${member}/permissions`);
    owner.expectValue(
      'both roles add up',
      '[.data.permission_codes[] | select(. == "patient_prescription:update" or . == "medicine:create")] | sort | join(",")',
      'medicine:create,patient_prescription:update',
    );

    await owner.expect(200, 'take the Doctor role away', 'PATCH', member, {
      role_ids: [fixture.roles.pharmacist],
    });
    await as('pharmacist').expect(
      403,
      'refused at once (WC-40)',
      'POST',
      await draftPrescription(),
    );
  });

  it("T2: a branch taken away leaves the member's preferences", async () => {
    const frontDesk = as('front_desk');
    const preferences = '/app/memberships/me/preferences';
    await frontDesk.expect(200, 'keep Vesu in my preferences', 'PATCH', preferences, {
      branch_ids: [fixture.branches.vesu],
    });
    await owner.expect(
      200,
      'move the front desk to Adajan',
      'PATCH',
      `${MEMBERSHIPS}/${fixture.members.front_desk.membershipPublicId}`,
      { branch_ids: [fixture.branches.adajan] },
    );
    await frontDesk.expect(200, 'my preferences', 'GET', preferences);
    frontDesk.expectValue(
      'Vesu is no longer one of mine',
      `[.data.branch_ids[] | select(. == "${fixture.branches.vesu}")] | length`,
      0,
    );
  });

  it('T3: the locked Admin role and the Owner stay put', async () => {
    const adminRole = `${ROLES}/${fixture.roles.admin}`;
    await owner.expect(200, "Admin's codes", 'GET', `${adminRole}/permissions`);
    await owner.expect(
      403,
      "Admin's access cannot change (D40)",
      'PUT',
      `${adminRole}/permissions`,
      {
        permission_codes: ['organization:read'],
      },
    );
    owner.expectValue('locked: why', REASON, 'role_locked');
    await owner.expect(
      403,
      "the Owner role's access cannot change either (D81 (4))",
      'PUT',
      `${ROLES}/${fixture.roles.owner}/permissions`,
      { permission_codes: ['organization:read'] },
    );
    owner.expectValue('locked: why', REASON, 'role_locked');
    await owner.expect(200, 'the roles', 'GET', `${ROLES}?sort=created_at&limit=100`);
    owner.expectValue(
      'Owner and Admin read as locked',
      '[.data[] | select(.is_locked) | .name] | join(",")',
      'Owner,Admin',
    );
    await owner.expect(403, 'a system role keeps its name', 'PATCH', adminRole, { name: 'Boss' });
    owner.expectValue('fixed: why', REASON, 'system_role_fixed');
    await owner.expect(200, 'its tone still changes', 'PATCH', adminRole, { tone: 'sky' });
    await owner.expect(
      403,
      'a system role cannot be deleted',
      'DELETE',
      `${adminRole}?reason=not_needed`,
    );
    owner.expectValue('fixed: why', REASON, 'system_role_fixed');

    const admin = as('admin');
    const ownerMember = `${MEMBERSHIPS}/${fixture.members.owner.membershipPublicId}`;
    await admin.expect(403, "the Admin changes no Owner's main role", 'PATCH', ownerMember, {
      role_ids: [fixture.roles.admin],
    });
    admin.expectValue('fixed: why', REASON, 'owner_membership_fixed');
    await admin.expect(403, "nor the Owner's status", 'PATCH', ownerMember, {
      status: 'suspended',
    });
    admin.expectValue('fixed: why', REASON, 'owner_membership_fixed');
    await admin.expect(403, 'nor removes the Owner', 'DELETE', `${ownerMember}?reason=mistake`);
    admin.expectValue('fixed: why', REASON, 'owner_membership_fixed');
    await admin.expect(403, 'nor deletes the organization (D8)', 'DELETE', '/tenancy/organization');
    await owner.expect(403, 'the Owner cannot leave', 'POST', '/tenancy/organization/leave', {});
    owner.expectValue('why', REASON, 'owner_cannot_leave');
  });

  it('T4 (D81 (4)): the owner is named and may hold extra roles, the Owner role first', async () => {
    const ownerMember = `${MEMBERSHIPS}/${fixture.members.owner.membershipPublicId}`;
    await owner.expect(200, 'the organization', 'GET', '/tenancy/organization');
    owner.expectValue('names its owner', '.data.owner_user_id', fixture.members.owner.userPublicId);
    const frontDesk = as('front_desk');
    await frontDesk.expect(200, 'my context', 'GET', '/auth/me/context');
    frontDesk.expectValue(
      'the active organization names its owner to every member',
      '.data.active_organization.owner_user_id',
      fixture.members.owner.userPublicId,
    );
    await owner.expect(200, 'the team', 'GET', `${MEMBERSHIPS}?limit=100`);
    owner.expectValue(
      'only the owner reads is_owner',
      '[.data[] | select(.is_owner) | .id] | join(",")',
      fixture.members.owner.membershipPublicId,
    );

    await owner.expect(200, 'the owner also works as a doctor', 'PATCH', ownerMember, {
      role_ids: [fixture.roles.owner, fixture.roles.doctor],
    });
    owner.expectValue(
      'Owner first, then Doctor',
      '.data.role_ids | join(",")',
      `${fixture.roles.owner},${fixture.roles.doctor}`,
    );
    owner.expectValue('still the owner', '.data.is_owner', 'true');
    await owner.expect(403, 'but Owner stays first', 'PATCH', ownerMember, {
      role_ids: [fixture.roles.doctor, fixture.roles.owner],
    });
    owner.expectValue('fixed: why', REASON, 'owner_membership_fixed');
    await owner.expect(403, 'and never goes', 'PATCH', ownerMember, {
      role_ids: [fixture.roles.doctor],
    });
    owner.expectValue('fixed: why', REASON, 'owner_membership_fixed');
    await as('admin').expect(
      403,
      "the Admin adds no role to the owner's (they hold not every Owner code)",
      'PATCH',
      ownerMember,
      { role_ids: [fixture.roles.owner, fixture.roles.doctor, fixture.roles.therapist] },
    );
    await owner.expect(200, 'the owner drops the extra role', 'PATCH', ownerMember, {
      role_ids: [fixture.roles.owner],
    });
    owner.expectValue('Owner only', '.data.role_ids | join(",")', fixture.roles.owner);
  });
});

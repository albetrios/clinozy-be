import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { generateTestToken } from '@/tests/helpers/test-auth.js';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';
import { injectAuthenticated } from '@/tests/helpers/test-http-inject.helper.js';
import { operatorQuery } from '@/tests/helpers/operator-database.js';
import { seedAllPermissions } from '@/domains/tenancy/__tests__/factories/permission.factory.js';
import { provisionOrganizationWithOwner } from '@/domains/tenancy/sub-domains/organization/organization-provisioning.js';

type Setup = {
  answered_steps: string[];
  main_branch_id: string | null;
  next_step: string | null;
  live_checks: { clinic_type: boolean; main_branch: boolean; services: boolean };
  is_live: boolean;
  has_someone_to_book: boolean;
  guide_items: { key: string; is_done: boolean; is_skipped: boolean }[];
  guide_done_count: number;
  completed_at: string | null;
  completed_by_membership_id: string | null;
  guide_done_at: string | null;
};

/**
 * A new clinic goes live (feat-clinic-setup, routes-final §2): a clinic provisioned the way signup
 * does answers what kind it is, makes its first branch (which becomes the main branch), the owner
 * takes the Doctor role as an extra role, the Consultation is added, the clinic goes live once, and
 * the short guide ticks itself from the records — the first appointment, a second treatment, the
 * team skipped — until "all done" is stored.
 */
describe('Flow — a new clinic goes live', () => {
  const stamp = randomUUID().slice(0, 8);

  let app: FastifyInstance;
  let token = '';
  let ownerMembershipId = '';
  let ownerRoleId = '';
  let doctorRoleId = '';
  let branchId = '';
  let branchHours = { working_days: [] as string[], opens_at: '', closes_at: '' };
  let firstCompletedAt = '';

  /** One call as the owner; every POST carries a fresh idempotency key. */
  async function call(method: 'GET' | 'POST' | 'PATCH', path: string, payload?: object) {
    const response = await injectAuthenticated(app, {
      method,
      url: testApiPath(path),
      token,
      ...(method === 'POST' ? { headers: { 'x-idempotency-key': `flow-${randomUUID()}` } } : {}),
      ...(payload ? { payload } : {}),
    });
    return { status: response.statusCode, body: response.json() as Record<string, unknown> };
  }

  /** The clinic's setup, asserted 200. */
  async function setup(): Promise<Setup> {
    const response = await call('GET', '/app/onboarding-setup');
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    return response.body.data as Setup;
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    await seedAllPermissions();
    const owner = await createTestUser({
      email: `owner.${stamp}@setup-flow.example`,
      firstName: 'Asha',
      lastName: 'Mehta',
      isEmailVerified: true,
    });
    const { organization } = await provisionOrganizationWithOwner({
      name: `Glow clinic ${stamp}`,
      slug: `glow-${stamp}`,
      type: 'TEAM',
      ownerUserId: owner.id,
    });
    token = await generateTestToken({
      userId: owner.public_id,
      organizationPublicId: organization.public_id,
    });
    const [membership] = await operatorQuery<{ public_id: string }[]>`
      SELECT public_id FROM tenancy.memberships
      WHERE organization_id = ${organization.id} AND user_id = ${owner.id}
    `;
    ownerMembershipId = membership!.public_id;
    const roleRows = await operatorQuery<{ public_id: string; name: string }[]>`
      SELECT public_id, name FROM tenancy.roles WHERE organization_id = ${organization.id}
    `;
    ownerRoleId = roleRows.find((row) => row.name === 'Owner')!.public_id;
    doctorRoleId = roleRows.find((row) => row.name === 'Doctor')!.public_id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. a new clinic starts at "What kind of clinic", and cannot go live yet', async () => {
    const start = await setup();
    expect(start.next_step).toBe('clinic_type');
    expect(start.is_live).toBe(false);
    expect(start.live_checks).toEqual({ clinic_type: false, main_branch: false, services: false });
    expect(start.guide_items.map((item) => item.key)).toEqual([
      'treatments',
      'invite_team',
      'first_appointment',
    ]);

    const early = await call('POST', '/app/onboarding-setup/complete');
    expect(early.status).toBe(409);
    expect((early.body.error as { reason?: string }).reason).toBe('onboarding_setup_incomplete');
  });

  it('2. step 1 — the clinic type is answered; the drawer moves to "Where is it"', async () => {
    const response = await call('PATCH', '/app/onboarding-setup', {
      answered_steps_add: ['clinic_type'],
    });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect((response.body.data as Setup).next_step).toBe('location');
  });

  it('3. step 2 — the first branch is made, and it is the main branch', async () => {
    const response = await call('POST', '/app/branches', {
      name: 'Vesu',
      address_line_one: '12 Ring Road',
      area: 'Vesu',
      city: 'Surat',
      postal_code: '395007',
      phone: '+919876543210',
      email: `vesu.${stamp}@setup-flow.example`,
    });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const branch = response.body.data as {
      id: string;
      is_main: boolean;
      working_days: string[];
      opens_at: string;
      closes_at: string;
    };
    expect(branch.is_main).toBe(true);
    branchId = branch.id;
    branchHours = {
      working_days: branch.working_days,
      opens_at: branch.opens_at,
      closes_at: branch.closes_at,
    };

    const after = await setup();
    expect(after.main_branch_id).toBe(branchId);
    expect(after.next_step).toBe('you');
    expect(after.has_someone_to_book).toBe(false);
  });

  it("4. step 3 — the owner sees patients: Doctor as an extra role, the branch's days and hours", async () => {
    const roles = await call('PATCH', `/tenancy/organization/memberships/${ownerMembershipId}`, {
      role_ids: [ownerRoleId, doctorRoleId],
      working_days: branchHours.working_days,
      work_starts_at: branchHours.opens_at,
      work_ends_at: branchHours.closes_at,
    });
    expect(roles.status, JSON.stringify(roles.body)).toBe(200);
    const answered = await call('PATCH', '/app/onboarding-setup', {
      answered_steps_add: ['you'],
    });
    expect(answered.status, JSON.stringify(answered.body)).toBe(200);
    const after = answered.body.data as Setup;
    expect(after.next_step).toBe('go_live');
    expect(after.has_someone_to_book).toBe(true);
    expect(after.live_checks.services).toBe(false);
  });

  it('5. "Go live" — the Consultation is added first, then the clinic goes live once', async () => {
    const consultation = await call('POST', '/app/offerings', {
      name: 'Consultation',
      category: 'consultation',
      price: 500,
    });
    expect(consultation.status, JSON.stringify(consultation.body)).toBe(200);

    const live = await call('POST', '/app/onboarding-setup/complete');
    expect(live.status, JSON.stringify(live.body)).toBe(200);
    const done = live.body.data as Setup;
    expect(done.is_live).toBe(true);
    expect(done.next_step).toBeNull();
    expect(done.completed_by_membership_id).toBe(ownerMembershipId);
    firstCompletedAt = done.completed_at ?? '';
    expect(firstCompletedAt).not.toBe('');

    const again = await call('POST', '/app/onboarding-setup/complete');
    expect(again.status).toBe(200);
    expect((again.body.data as Setup).completed_at).toBe(firstCompletedAt);
  });

  it('6. the guide ticks itself from the records until "all done" is stored', async () => {
    const contact = await call('POST', '/app/contacts', {
      first_name: 'Riya',
      last_name: `Shah ${stamp}`,
      phones: [{ phone: '+919812345670', is_primary: true }],
    });
    expect(contact.status, JSON.stringify(contact.body)).toBe(200);
    const appointment = await call('POST', '/app/appointments', {
      contact_id: (contact.body.data as { id: string }).id,
      branch_id: branchId,
      doctor_membership_id: ownerMembershipId,
      service_label: 'Consultation',
      is_walk_in: true,
    });
    expect(appointment.status, JSON.stringify(appointment.body)).toBe(200);

    const booked = await setup();
    const doneOf = (status: Setup) =>
      Object.fromEntries(status.guide_items.map((item) => [item.key, item.is_done]));
    expect(doneOf(booked)).toEqual({
      treatments: false,
      invite_team: false,
      first_appointment: true,
    });
    expect(booked.guide_done_at).toBeNull();

    const peel = await call('POST', '/app/offerings', { name: 'Chemical peel', price: 1800 });
    expect(peel.status, JSON.stringify(peel.body)).toBe(200);
    const skipped = await call('PATCH', '/app/onboarding-setup', {
      skipped_items_add: ['invite_team'],
    });
    expect(skipped.status, JSON.stringify(skipped.body)).toBe(200);
    const finished = skipped.body.data as Setup;
    expect(doneOf(finished).treatments).toBe(true);
    expect(finished.guide_done_count).toBe(3);
    expect(finished.guide_done_at).not.toBeNull();

    const later = await setup();
    expect(later.guide_done_at).toBe(finished.guide_done_at);
    expect(later.completed_at).toBe(firstCompletedAt);
  });
});

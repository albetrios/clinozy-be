import { beforeEach, describe, expect, it } from 'vitest';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { getOperatorSql } from '@/tests/helpers/operator-database.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import {
  createMembership,
  createRoleWithPermissions,
} from '@/domains/tenancy/__tests__/factories/permission.factory.js';
import {
  BRANCH_DEFAULT_STATE,
  BRANCH_DEFAULT_TONE,
  BRANCH_DEFAULT_WORKING_DAYS,
} from '@/domains/app/sub-domains/branches/branches.constants.js';

/** Postgres `check_violation`. */
const CHECK_VIOLATION = '23514';
/** Postgres `unique_violation`. */
const UNIQUE_VIOLATION = '23505';

/**
 * `app.branches` (launch ROUTE #2, rebuilt in #125): the defaults, every CHECK, the one-main and
 * name unique indexes (a branch is never deleted, only made inactive — D3, D16), and the
 * default-staff foreign keys clearing on a membership delete. Runs on the operator
 * connection, so it holds in the RLS-role lane too.
 */
describe('Integration: app.branches schema', () => {
  let organizationId: number;

  /** Inserts a branch with the required fields plus `overrides`; returns its id. */
  async function insertBranch(overrides: Record<string, unknown> = {}): Promise<number> {
    const row = {
      public_id: generatePublicId('branch'),
      organization_id: organizationId,
      name: 'Adajan',
      address_line_one: '1 Main Road',
      area: 'Adajan',
      city: 'Surat',
      postal_code: '395009',
      phone: '+919800000000',
      email: 'adajan@example.com',
      ...overrides,
    };
    const [inserted] = await getOperatorSql()<{ id: number }[]>`
      INSERT INTO app.branches ${getOperatorSql()(row)} RETURNING id
    `;
    return Number(inserted!.id);
  }

  beforeEach(async () => {
    await cleanupDatabase();
    const owner = await createTestUser({ email: 'branch-owner@example.com' });
    const organization = await createTestOrganization({ ownerUserId: owner.id });
    organizationId = organization.id;
  });

  it('gives a new branch the launch defaults', async () => {
    const id = await insertBranch();
    const [row] = await getOperatorSql()<
      {
        tone: string;
        state: string;
        opens_at: string;
        closes_at: string;
        working_days: string[];
        is_main: boolean;
        is_active: boolean;
      }[]
    >`SELECT tone, state, opens_at, closes_at, working_days, is_main, is_active FROM app.branches WHERE id = ${id}`;

    expect(row).toEqual({
      tone: BRANCH_DEFAULT_TONE,
      state: BRANCH_DEFAULT_STATE,
      opens_at: '10:00:00',
      closes_at: '20:00:00',
      working_days: [...BRANCH_DEFAULT_WORKING_DAYS],
      is_main: false,
      is_active: true,
    });
  });

  it.each([
    ['an unknown tone', { tone: 'red' }],
    ['a five-digit postal code', { postal_code: '39500' }],
    ['a phone without +91', { phone: '9800000000' }],
    ['a malformed GSTIN', { gst_number: '24ABCDE1234F1Z' }],
    ['closing before opening', { opens_at: '20:00', closes_at: '10:00' }],
    ['an unknown weekday', { working_days: ['mon', 'funday'] }],
    ['no working day', { working_days: [] }],
    ['a non-https maps link', { maps_link: 'http://maps.example.com' }],
    ['a non-https review link', { review_link: 'http://reviews.example.com' }],
  ])('rejects %s', async (_case, overrides) => {
    await expect(insertBranch(overrides)).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });

  it('accepts a valid GSTIN', async () => {
    await expect(insertBranch({ gst_number: '24ABCDE1234F1Z5' })).resolves.toBeGreaterThan(0);
  });

  it('keeps names unique per organization, ignoring case — an inactive branch keeps its name (D3, D16)', async () => {
    await insertBranch({ name: 'Adajan', is_active: false });
    await expect(insertBranch({ name: 'ADAJAN' })).rejects.toMatchObject({
      code: UNIQUE_VIOLATION,
    });
    await expect(insertBranch({ name: 'Vesu' })).resolves.toBeGreaterThan(0);
  });

  it('allows one live main branch per organization', async () => {
    await insertBranch({ name: 'Adajan', is_main: true });
    await expect(insertBranch({ name: 'Vesu', is_main: true })).rejects.toMatchObject({
      code: UNIQUE_VIOLATION,
    });
    await expect(insertBranch({ name: 'Vesu', is_main: false })).resolves.toBeGreaterThan(0);
  });

  it('clears a default staff link when its membership is deleted', async () => {
    const staff = await createTestUser({ email: 'doctor@example.com' });
    const role = await createRoleWithPermissions({ organizationId, permissionCodes: [] });
    const membership = await createMembership({
      userId: staff.id,
      organizationId,
      roleId: role.id,
    });
    const id = await insertBranch({ default_doctor_membership_id: membership.id });

    await getOperatorSql()`DELETE FROM tenancy.memberships WHERE id = ${membership.id}`;

    const [row] = await getOperatorSql()<{ default_doctor_membership_id: number | null }[]>`
      SELECT default_doctor_membership_id FROM app.branches WHERE id = ${id}
    `;
    expect(row?.default_doctor_membership_id).toBeNull();
  });
});

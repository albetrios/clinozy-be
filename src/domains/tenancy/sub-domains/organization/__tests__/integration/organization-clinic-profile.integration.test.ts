import { beforeEach, describe, expect, it } from 'vitest';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { getOperatorSql } from '@/tests/helpers/operator-database.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import {
  ORGANIZATION_CURRENCY,
  ORGANIZATION_DEFAULT_SPECIALTIES,
  ORGANIZATION_DEFAULT_TIMEZONE,
  ORGANIZATION_SPECIALTIES,
} from '@/domains/tenancy/sub-domains/organization/organization.constants.js';
import {
  ORGANIZATION_SETTINGS_DEFAULT_DAY_FLOAT,
  ORGANIZATION_SETTINGS_DEFAULT_DELETED_RECORD_PURGE_DAYS,
  ORGANIZATION_SETTINGS_DEFAULT_LEAD_HOLD_DAYS,
  ORGANIZATION_SETTINGS_DEFAULT_REMINDER_HOUR,
  ORGANIZATION_SETTINGS_DEFAULT_RETARGET_AFTER_DAYS,
} from '@/domains/tenancy/sub-domains/organization/organization-settings/organization-settings.constants.js';

/** Postgres `check_violation`. */
const CHECK_VIOLATION = '23514';

/**
 * The clinic profile on `tenancy.organizations` and the clinic settings on
 * `tenancy.organization_settings` (launch ROUTE #1): the column defaults match the constants the
 * services read when no settings row exists, and every CHECK rejects what it should. Fixtures and
 * assertions run on the operator connection, so the suite holds in the RLS-role lane too.
 */
describe('Integration: organization clinic profile and settings', () => {
  let organizationId: number;

  beforeEach(async () => {
    await cleanupDatabase();
    const owner = await createTestUser({ email: 'clinic-owner@example.com' });
    const organization = await createTestOrganization({ ownerUserId: owner.id });
    organizationId = organization.id;
  });

  it('gives a new organization the launch clinic profile', async () => {
    const [row] = await getOperatorSql()<
      { specialties: string[]; timezone: string; currency: string }[]
    >`SELECT specialties, timezone, currency FROM tenancy.organizations WHERE id = ${organizationId}`;

    expect(row).toEqual({
      specialties: [...ORGANIZATION_DEFAULT_SPECIALTIES],
      timezone: ORGANIZATION_DEFAULT_TIMEZONE,
      currency: ORGANIZATION_CURRENCY,
    });
  });

  it('accepts every allowed specialty, up to six', async () => {
    const six = ORGANIZATION_SPECIALTIES.slice(0, 6);
    await getOperatorSql()`
      UPDATE tenancy.organizations SET specialties = ${six}::text[] WHERE id = ${organizationId}
    `;
    const [row] = await getOperatorSql()<{ specialties: string[] }[]>`
      SELECT specialties FROM tenancy.organizations WHERE id = ${organizationId}
    `;
    expect(row?.specialties).toEqual(six);
  });

  it.each([
    [
      'an unknown specialty',
      `UPDATE tenancy.organizations SET specialties = ARRAY['skin', 'ortho']::text[] WHERE id = $1`,
    ],
    [
      'no specialty',
      `UPDATE tenancy.organizations SET specialties = ARRAY[]::text[] WHERE id = $1`,
    ],
    [
      'more than six specialties',
      `UPDATE tenancy.organizations SET specialties = ARRAY['skin','hair','dental','gynac','physio','general','skin']::text[] WHERE id = $1`,
    ],
    [
      'a currency other than INR',
      `UPDATE tenancy.organizations SET currency = 'USD' WHERE id = $1`,
    ],
  ])('rejects %s on the organization', async (_case, statement) => {
    await expect(getOperatorSql().unsafe(statement, [organizationId])).rejects.toMatchObject({
      code: CHECK_VIOLATION,
    });
  });

  it('gives a new settings row the launch clinic settings', async () => {
    await getOperatorSql()`
      INSERT INTO tenancy.organization_settings (organization_id) VALUES (${organizationId})
      ON CONFLICT (organization_id) DO NOTHING
    `;
    const [row] = await getOperatorSql()<
      {
        default_day_float: string;
        lead_hold_days: number;
        reminder_hour: number;
        retarget_after_days: number;
        deleted_record_purge_days: number;
      }[]
    >`
      SELECT default_day_float, lead_hold_days, reminder_hour, retarget_after_days,
             deleted_record_purge_days
      FROM tenancy.organization_settings WHERE organization_id = ${organizationId}
    `;

    expect(row).toEqual({
      default_day_float: ORGANIZATION_SETTINGS_DEFAULT_DAY_FLOAT,
      lead_hold_days: ORGANIZATION_SETTINGS_DEFAULT_LEAD_HOLD_DAYS,
      reminder_hour: ORGANIZATION_SETTINGS_DEFAULT_REMINDER_HOUR,
      retarget_after_days: ORGANIZATION_SETTINGS_DEFAULT_RETARGET_AFTER_DAYS,
      deleted_record_purge_days: ORGANIZATION_SETTINGS_DEFAULT_DELETED_RECORD_PURGE_DAYS,
    });
  });

  it.each([
    ['a negative day float', 'default_day_float = -1'],
    ['zero lead hold days', 'lead_hold_days = 0'],
    ['a reminder hour of 24', 'reminder_hour = 24'],
    ['a negative reminder hour', 'reminder_hour = -1'],
    ['zero re-target days', 'retarget_after_days = 0'],
    ['zero purge days', 'deleted_record_purge_days = 0'],
  ])('rejects %s on the settings', async (_case, assignment) => {
    await getOperatorSql()`
      INSERT INTO tenancy.organization_settings (organization_id) VALUES (${organizationId})
      ON CONFLICT (organization_id) DO NOTHING
    `;
    await expect(
      getOperatorSql().unsafe(
        `UPDATE tenancy.organization_settings SET ${assignment} WHERE organization_id = $1`,
        [organizationId],
      ),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });
  });
});

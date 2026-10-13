import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { getOperatorDatabase } from '@/tests/helpers/operator-database.js';
import { createTestUser } from '@/tests/factories/user.factory.js';
import { createTestOrganization } from '@/tests/factories/organization.factory.js';
import { createTestBranch } from '@/tests/factories/branches.factory.js';
import {
  createMembership,
  createRoleWithPermissions,
} from '@/domains/tenancy/__tests__/factories/permission.factory.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { organization_settings } from '@/domains/tenancy/sub-domains/organization/organization-settings/organization-settings.schema.js';
import { offerings } from '@/domains/app/sub-domains/offerings/offerings.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { getPostgresConstraintName } from '@/shared/utils/infrastructure/postgres-error.util.js';

/** The migration that adds the setup progress and fills it for clinics already live (OS8, D7). */
const SETUP_PROGRESS_MIGRATION =
  'migrations/20261013112241_organization_settings_setup_progress.sql';

/** The migration's one-time fill statement, run here against fixtures (operator connection). */
function setupFillStatement(): string {
  const migration = readFileSync(resolve(process.cwd(), SETUP_PROGRESS_MIGRATION), 'utf-8');
  const statement = migration
    .split('--> statement-breakpoint')
    .map((segment) => segment.trim())
    .find((segment) => segment.includes('INSERT INTO tenancy.organization_settings'));
  if (!statement) throw new Error(`No fill statement in ${SETUP_PROGRESS_MIGRATION}`);
  return statement
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

/** A clinic with its owner's membership (operator connection). */
async function createClinic(options: { name: string }) {
  const owner = await createTestUser();
  const organization = await createTestOrganization({
    ownerUserId: owner.id,
    name: options.name,
    type: 'TEAM',
  });
  const role = await createRoleWithPermissions({
    organizationId: organization.id,
    permissionCodes: [],
  });
  const membership = await createMembership({
    userId: owner.id,
    organizationId: organization.id,
    roleId: role.id,
  });
  return { organization, membership };
}

/** One offering of a clinic (operator connection, bypassing RLS). */
async function createOffering(options: { organizationId: number; isActive?: boolean }) {
  await getOperatorDatabase()
    .insert(offerings)
    .values({
      public_id: generatePublicId('offering'),
      organization_id: options.organizationId,
      offering_number: 1,
      name: 'Consultation',
      category: 'consultation',
      price: '500.00',
      is_active: options.isActive ?? true,
    });
}

/** The clinic's settings row, or null when it has none. */
async function settingsOf(organizationId: number) {
  const [row] = await getOperatorDatabase()
    .select()
    .from(organization_settings)
    .where(eq(organization_settings.organization_id, organizationId));
  return row ?? null;
}

/** The settings write, for the constraint cases (operator connection). */
function writeSettings(values: typeof organization_settings.$inferInsert) {
  return getOperatorDatabase().insert(organization_settings).values(values);
}

/**
 * feat-clinic-setup-2026-10-13-sltd ROUTE #1 — the seven `setup_*` fields of
 * `tenancy.organization_settings` (routes-final §2.A.3) and the one-time fill that makes clinics
 * already live count as set up (OS8, A11).
 */
describe('Integration: organization settings — setup progress', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  describe('the one-time fill (A11)', () => {
    it('marks live only the clinics with an active main branch and an active service, with no completer', async () => {
      const live = await createClinic({ name: 'Live clinic' });
      await createTestBranch({ organizationId: live.organization.id, isMain: true });
      await createOffering({ organizationId: live.organization.id });

      const noService = await createClinic({ name: 'No service' });
      await createTestBranch({ organizationId: noService.organization.id, isMain: true });

      const noMainBranch = await createClinic({ name: 'No main branch' });
      await createTestBranch({ organizationId: noMainBranch.organization.id, isMain: false });
      await createOffering({ organizationId: noMainBranch.organization.id });

      const closedMainBranch = await createClinic({ name: 'Closed main branch' });
      await createTestBranch({
        organizationId: closedMainBranch.organization.id,
        isMain: true,
        isActive: false,
      });
      await createOffering({ organizationId: closedMainBranch.organization.id });

      const inactiveService = await createClinic({ name: 'Inactive service' });
      await createTestBranch({ organizationId: inactiveService.organization.id, isMain: true });
      await createOffering({ organizationId: inactiveService.organization.id, isActive: false });

      const deletedClinic = await createClinic({ name: 'Deleted clinic' });
      await createTestBranch({ organizationId: deletedClinic.organization.id, isMain: true });
      await createOffering({ organizationId: deletedClinic.organization.id });
      await getOperatorDatabase()
        .update(organizations)
        .set({ deleted_at: new Date() })
        .where(eq(organizations.id, deletedClinic.organization.id));

      const alreadyLive = await createClinic({ name: 'Already live' });
      await createTestBranch({ organizationId: alreadyLive.organization.id, isMain: true });
      await createOffering({ organizationId: alreadyLive.organization.id });
      const firstLive = new Date('2026-10-01T09:00:00.000Z');
      await writeSettings({
        organization_id: alreadyLive.organization.id,
        setup_completed_at: firstLive,
        setup_completed_by_membership_id: alreadyLive.membership.id,
      });

      await getOperatorDatabase().execute(sql.raw(setupFillStatement()));

      const liveRow = await settingsOf(live.organization.id);
      expect(liveRow?.setup_completed_at).toBeInstanceOf(Date);
      expect(liveRow?.setup_completed_by_membership_id).toBeNull();
      expect(liveRow?.setup_answered_steps).toEqual([]);
      expect(liveRow?.setup_skipped_items).toEqual([]);

      for (const clinic of [
        noService,
        noMainBranch,
        closedMainBranch,
        inactiveService,
        deletedClinic,
      ]) {
        expect((await settingsOf(clinic.organization.id))?.setup_completed_at ?? null).toBeNull();
      }

      const alreadyLiveRow = await settingsOf(alreadyLive.organization.id);
      expect(alreadyLiveRow?.setup_completed_at?.toISOString()).toBe(firstLive.toISOString());
      expect(alreadyLiveRow?.setup_completed_by_membership_id).toBe(alreadyLive.membership.id);
    });

    it('is safe to run twice', async () => {
      const live = await createClinic({ name: 'Live clinic' });
      await createTestBranch({ organizationId: live.organization.id, isMain: true });
      await createOffering({ organizationId: live.organization.id });

      await getOperatorDatabase().execute(sql.raw(setupFillStatement()));
      const first = (await settingsOf(live.organization.id))?.setup_completed_at;
      await getOperatorDatabase().execute(sql.raw(setupFillStatement()));

      expect((await settingsOf(live.organization.id))?.setup_completed_at?.toISOString()).toBe(
        first?.toISOString(),
      );
    });
  });

  describe('the fields', () => {
    it('defaults to no answers, no skips and no times', async () => {
      const clinic = await createClinic({ name: 'New clinic' });
      await writeSettings({ organization_id: clinic.organization.id });

      const row = await settingsOf(clinic.organization.id);
      expect(row).toMatchObject({
        setup_answered_steps: [],
        setup_skipped_items: [],
        setup_deferred_at: null,
        setup_completed_at: null,
        setup_completed_by_membership_id: null,
        setup_guide_hidden_at: null,
        setup_guide_done_at: null,
      });
    });

    it('takes only the answered steps and skippable items there are', async () => {
      const clinic = await createClinic({ name: 'New clinic' });

      await expect(
        writeSettings({
          organization_id: clinic.organization.id,
          setup_answered_steps: ['location'],
        }),
      ).rejects.toSatisfy(
        (error: unknown) =>
          getPostgresConstraintName(error) === 'chk_organization_settings_setup_answered_steps',
      );
      await expect(
        writeSettings({
          organization_id: clinic.organization.id,
          setup_answered_steps: ['clinic_type', 'you', 'you'],
        }),
      ).rejects.toSatisfy(
        (error: unknown) =>
          getPostgresConstraintName(error) === 'chk_organization_settings_setup_answered_steps',
      );
      await expect(
        writeSettings({
          organization_id: clinic.organization.id,
          setup_skipped_items: ['first_appointment'],
        }),
      ).rejects.toSatisfy(
        (error: unknown) =>
          getPostgresConstraintName(error) === 'chk_organization_settings_setup_skipped_items',
      );

      await writeSettings({
        organization_id: clinic.organization.id,
        setup_answered_steps: ['clinic_type', 'you'],
        setup_skipped_items: ['treatments', 'invite_team'],
      });
      expect((await settingsOf(clinic.organization.id))?.setup_answered_steps).toEqual([
        'clinic_type',
        'you',
      ]);
    });

    it('names who went live only with the time it went live', async () => {
      const clinic = await createClinic({ name: 'New clinic' });

      await expect(
        writeSettings({
          organization_id: clinic.organization.id,
          setup_completed_by_membership_id: clinic.membership.id,
        }),
      ).rejects.toSatisfy(
        (error: unknown) =>
          getPostgresConstraintName(error) === 'chk_organization_settings_setup_completed_by',
      );
    });

    it('takes a member of this clinic only, and keeps that member (K8, K2)', async () => {
      const clinic = await createClinic({ name: 'This clinic' });
      const otherClinic = await createClinic({ name: 'Another clinic' });

      await expect(
        writeSettings({
          organization_id: clinic.organization.id,
          setup_completed_at: new Date(),
          setup_completed_by_membership_id: otherClinic.membership.id,
        }),
      ).rejects.toSatisfy(
        (error: unknown) =>
          getPostgresConstraintName(error) ===
          'organization_settings_setup_completed_by_membership_fk',
      );

      await writeSettings({
        organization_id: clinic.organization.id,
        setup_completed_at: new Date(),
        setup_completed_by_membership_id: clinic.membership.id,
      });
      await expect(
        getOperatorDatabase().delete(memberships).where(eq(memberships.id, clinic.membership.id)),
      ).rejects.toSatisfy(
        (error: unknown) =>
          getPostgresConstraintName(error) ===
          'organization_settings_setup_completed_by_membership_fk',
      );
    });

    it('still lets a deleted clinic be purged with its members', async () => {
      const clinic = await createClinic({ name: 'Leaving clinic' });
      await writeSettings({
        organization_id: clinic.organization.id,
        setup_completed_at: new Date(),
        setup_completed_by_membership_id: clinic.membership.id,
      });

      await getOperatorDatabase()
        .delete(organizations)
        .where(eq(organizations.id, clinic.organization.id));

      expect(await settingsOf(clinic.organization.id)).toBeNull();
    });
  });
});

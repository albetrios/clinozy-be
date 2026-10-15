/**
 * Demo clinic seed integration — `runDemoClinicSeed` (`pnpm db:seed:demo-clinic`) writes the
 * clinic its plan describes against the real schema (every check, trigger and exclusion
 * constraint), leaves it alone on a re-run, and rebuilds it with `fresh`. Importing the module
 * must not run the seed (it auto-runs only as the CLI entry).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { and, count, eq, isNull } from 'drizzle-orm';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { runDemoClinicSeed } from '@/scripts/seed/demo-clinic.js';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { invoices } from '@/domains/app/sub-domains/billing/invoices/invoices.schema.js';
import { organization_settings } from '@/domains/tenancy/sub-domains/organization/organization-settings/organization-settings.schema.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { DEMO_REVIEW_LINK } from '@/scripts/seed/demo-clinic.catalog.js';

/** 15:30 in Kolkata — the afternoon every Today lane is planned around. */
const NOW = new Date('2026-10-13T10:00:00Z');

async function clinicOf(slug: string) {
  const [organization] = await getRequestDatabase()
    .select({ id: organizations.id, public_id: organizations.public_id })
    .from(organizations)
    .where(and(eq(organizations.slug, slug), isNull(organizations.deleted_at)));
  return organization;
}

async function countOf(
  table: typeof patients | typeof appointments | typeof invoices | typeof memberships,
  organizationId: number,
): Promise<number> {
  const [row] = await getRequestDatabase()
    .select({ value: count() })
    .from(table)
    .where(eq(table.organization_id, organizationId));
  return row?.value ?? 0;
}

// Skipped under `pnpm test:rls-role`, like the full seed's suite: seeding is an operator activity
// (`seed-runtime-url.ts`), so running it as the RLS-subject role would prove nothing about RLS.
const runAsApplicationBehaviour = !process.env.TEST_DATABASE_ROLE;

describe.runIf(runAsApplicationBehaviour)('Demo clinic seed — integration', () => {
  beforeEach(async () => {
    await cleanupDatabase();
  });

  it('writes the clinic: staff, patients, a full day and bills paid in every state', async () => {
    const result = await runDemoClinicSeed({ now: NOW });
    expect(result.created).toBe(true);
    const clinic = await clinicOf(result.slug);
    expect(clinic).toBeDefined();

    expect(await countOf(memberships, clinic!.id)).toBe(5);
    expect(await countOf(patients, clinic!.id)).toBe(24);
    expect(await countOf(appointments, clinic!.id)).toBeGreaterThan(60);

    const today = await getRequestDatabase()
      .select({ status: appointments.status, stage: appointments.visit_stage })
      .from(appointments)
      .where(
        and(
          eq(appointments.organization_id, clinic!.id),
          eq(appointments.appointment_date, '2026-10-13'),
        ),
      );
    const lanes = new Set(today.map((visit) => visit.stage ?? visit.status));
    for (const lane of [
      'completed',
      'checkout',
      'treatment',
      'with_doctor',
      'waiting',
      'confirmed',
    ]) {
      expect(lanes).toContain(lane);
    }

    const bills = await getRequestDatabase()
      .select({ status: invoices.payment_status })
      .from(invoices)
      .where(eq(invoices.organization_id, clinic!.id));
    expect(new Set(bills.map((bill) => bill.status))).toEqual(
      new Set(['paid', 'partial', 'unpaid']),
    );

    // The main branch has a Google review link, the second none (feat-payment-celebration BR5).
    const branchLinks = await getRequestDatabase()
      .select({ isMain: branches.is_main, reviewLink: branches.review_link })
      .from(branches)
      .where(eq(branches.organization_id, clinic!.id));
    expect(branchLinks).toHaveLength(2);
    expect(branchLinks.find((branch) => branch.isMain)?.reviewLink).toBe(DEMO_REVIEW_LINK);
    expect(branchLinks.find((branch) => !branch.isMain)?.reviewLink).toBeNull();

    // Its setup is complete (feat-clinic-setup OSC7): the staff never meet the setup drawer.
    const [setup] = await getRequestDatabase()
      .select({ completedAt: organization_settings.setup_completed_at })
      .from(organization_settings)
      .where(eq(organization_settings.organization_id, clinic!.id));
    expect(setup?.completedAt).toBeInstanceOf(Date);
  });

  it('keeps the clinic on a re-run and rebuilds it with fresh', async () => {
    const first = await runDemoClinicSeed({ now: NOW });
    const seeded = await clinicOf(first.slug);
    const patientCount = await countOf(patients, seeded!.id);

    const again = await runDemoClinicSeed({ now: NOW });
    expect(again).toEqual({ ...first, created: false });
    expect((await clinicOf(first.slug))?.public_id).toBe(seeded!.public_id);
    expect(await countOf(patients, seeded!.id)).toBe(patientCount);

    const rebuilt = await runDemoClinicSeed({ now: NOW, fresh: true });
    expect(rebuilt.created).toBe(true);
    const fresh = await clinicOf(first.slug);
    expect(fresh?.public_id).not.toBe(seeded!.public_id);
    expect(await countOf(patients, fresh!.id)).toBe(patientCount);
  });
});

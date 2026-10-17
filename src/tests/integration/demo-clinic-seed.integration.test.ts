/**
 * Demo clinic seed integration — `runDemoClinicSeed` (`pnpm db:seed:demo-clinic`) writes the
 * clinic its plan describes against the real schema (every check, trigger and exclusion
 * constraint) — its medical store and clinic stock reconciled — leaves it alone on a re-run, and
 * rebuilds it with `fresh`. Importing the module
 * must not run the seed (it auto-runs only as the CLI entry).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { and, count, eq, isNull, sql } from 'drizzle-orm';
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
import { users } from '@/domains/user/user.schema.js';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { generateTestToken } from '@/tests/helpers/test-auth.js';
import { injectAuthenticated } from '@/tests/helpers/test-http-inject.helper.js';
import { testApiPath } from '@/tests/helpers/test-api-prefix.helper.js';

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

  it('fills the medical store and the clinic stock, every balance and bill reconciled', async () => {
    const result = await runDemoClinicSeed({ now: NOW });
    const clinic = await clinicOf(result.slug);
    const organizationId = clinic!.id;
    const tables = [
      'manufacturers',
      'suppliers',
      'supplier_manufacturers',
      'supplier_credits',
      'medicines',
      'medicine_batches',
      'medicine_supplier_prices',
      'medical_purchase_orders',
      'medical_purchase_order_items',
      'medical_reps',
      'medical_rep_manufacturers',
      'medical_rep_visits',
      'medical_sales',
      'stock_vendors',
      'stock_items',
      'stock_purchases',
      'stock_purchase_items',
      'stock_item_movements',
      'stock_counts',
      'stock_count_lines',
    ];
    for (const table of tables) {
      const { rows } = await getRequestDatabase().execute<{ value: number }>(
        sql`select count(*)::int as value from ${sql.identifier('app')}.${sql.identifier(table)} where organization_id = ${organizationId}`,
      );
      expect(rows[0]?.value, table).toBeGreaterThan(0);
    }

    // Each check counts the rows that do not reconcile — all zero.
    const mismatches = await getRequestDatabase().execute<Record<string, number>>(sql`
      select
        (select count(*)::int from app.medicines m where m.organization_id = ${organizationId}
          and m.quantity <> (select coalesce(sum(b.quantity), 0) from app.medicine_batches b where b.medicine_id = m.id)) as medicine_quantity,
        (select count(*)::int from app.medicine_batches b join app.medical_purchase_order_items i on i.medicine_batch_id = b.id
          where b.organization_id = ${organizationId} and b.quantity <> i.quantity + i.free_quantity
            - (select coalesce(sum(ii.quantity), 0) from app.invoice_items ii where ii.medicine_batch_id = b.id)
            - (select coalesce(sum(c.quantity), 0) from app.supplier_credits c where c.medicine_batch_id = b.id)) as batch_quantity,
        (select count(*)::int from app.invoices v where v.organization_id = ${organizationId}
          and v.paid_amount <> (select coalesce(sum(p.amount), 0) from app.payments p where p.invoice_id = v.id)) as invoice_paid,
        (select count(*)::int from app.medical_purchase_orders o where o.organization_id = ${organizationId}
          and (o.total <> (select sum(i.amount) from app.medical_purchase_order_items i where i.medical_purchase_order_id = o.id)
            or o.paid_amount <> (select coalesce(sum(p.amount), 0) from app.payments p where p.medical_purchase_order_id = o.id))) as order_money,
        (select count(*)::int from app.suppliers s where s.organization_id = ${organizationId}
          and (select coalesce(sum(o.credited_amount), 0) from app.medical_purchase_orders o where o.supplier_id = s.id)
            <> (select coalesce(sum(c.applied_amount), 0) from app.supplier_credits c where c.supplier_id = s.id)) as supplier_credited,
        (select count(*)::int from app.stock_items s where s.organization_id = ${organizationId}
          and s.quantity <> (select coalesce(sum(m.quantity_change), 0) from app.stock_item_movements m where m.stock_item_id = s.id)) as stock_quantity,
        (select count(*)::int from app.stock_purchases p where p.organization_id = ${organizationId}
          and (p.bill_amount <> (select sum(i.amount) from app.stock_purchase_items i where i.stock_purchase_id = p.id)
            or p.paid_amount <> (select coalesce(sum(x.amount), 0) from app.payments x where x.stock_purchase_id = p.id))) as purchase_money
    `);
    expect(mismatches.rows[0]).toEqual({
      medicine_quantity: 0,
      batch_quantity: 0,
      invoice_paid: 0,
      order_money: 0,
      supplier_credited: 0,
      stock_quantity: 0,
      purchase_money: 0,
    });

    // The store's bills are `medical` invoices in every payment state; one MR is due today, so
    // the app's MR rule opened their task.
    const sales = await getRequestDatabase()
      .select({ status: invoices.payment_status })
      .from(invoices)
      .where(and(eq(invoices.organization_id, organizationId), eq(invoices.type, 'medical')));
    expect(new Set(sales.map((bill) => bill.status))).toEqual(
      new Set(['paid', 'partial', 'unpaid']),
    );
    const { rows: repTasks } = await getRequestDatabase().execute<{ value: number }>(
      sql`select count(*)::int as value from app.tasks where organization_id = ${organizationId} and medical_rep_id is not null`,
    );
    expect(repTasks[0]?.value).toBeGreaterThan(0);
  });

  it('opens every Medical and Clinic stock tab on rows, and its filters on some', async () => {
    // Around today, so the routes' own "today" (expiry, low stock) reads the plan as it was made.
    const result = await runDemoClinicSeed();
    const [owner] = await getRequestDatabase()
      .select({ userPublicId: users.public_id, organizationPublicId: organizations.public_id })
      .from(organizations)
      .innerJoin(users, eq(users.id, organizations.owner_user_id))
      .where(and(eq(organizations.slug, result.slug), isNull(organizations.deleted_at)));
    const { app } = await createTestApp();
    try {
      const token = await generateTestToken({
        userId: owner!.userPublicId,
        organizationPublicId: owner!.organizationPublicId,
      });
      const rowsOf = async (path: string): Promise<{ id: string }[]> => {
        const response = await injectAuthenticated(app, { url: testApiPath(path), token });
        expect(response.statusCode, `${path}: ${response.body}`).toBe(200);
        const { data } = response.json() as { data: { id: string }[] };
        expect(data.length, path).toBeGreaterThan(0);
        return data;
      };
      for (const path of [
        '/app/manufacturers',
        '/app/suppliers',
        '/app/supplier-credits',
        '/app/medicines',
        '/app/medicines?stock_level=low',
        '/app/medicines?stock_level=out',
        '/app/medicines?expiring_within_days=90',
        '/app/medical-purchase-orders',
        '/app/medical-sales',
        '/app/medical-sales/dues',
        '/app/medical-payments',
        '/app/stock-vendors',
        '/app/stock-items',
        '/app/stock-items?stock_level=low',
        '/app/stock-items?stock_level=out',
        '/app/stock-item-movements',
        '/app/stock-counts',
        '/app/stock-purchases',
      ]) {
        await rowsOf(path);
      }
      const [rep] = await rowsOf('/app/medical-reps');
      await rowsOf(`/app/medical-reps/${rep!.id}/visits`);
    } finally {
      await app.close();
    }
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

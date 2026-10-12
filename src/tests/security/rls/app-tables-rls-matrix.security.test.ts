import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { sql as drizzleSql } from 'drizzle-orm';
import { database } from '@/infrastructure/database/connection.js';
import { EXPECTED_FORCE_RLS_TABLES } from '@/infrastructure/database/utils/force-rls-tables.constants.js';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import {
  executeAsClinozyBeAppTenant,
  grantClinozyBeAppRoleForTests,
} from '@/tests/helpers/rls-matrix.helper.js';
import { appRouteBody } from '@/tests/helpers/app-route-requests.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow, type AppFlowMethod } from '@/domains/app/__tests__/factories/app-flow.factory.js';
import {
  appRouteReferencesOf,
  seedAppRecordOfEveryKind,
} from '@/domains/app/__tests__/factories/app-records.factory.js';
import {
  APP_COLLECTION_WRITES,
  findBookableDay,
} from '@/domains/app/__tests__/factories/app-route-references.factory.js';

/** The rows of an `execute` result, whichever shape the driver answers. */
function rowsOf<Row>(result: unknown): Row[] {
  return Array.isArray(result) ? (result as Row[]) : ((result as { rows?: Row[] }).rows ?? []);
}

/** Whether `app.<table>` keys its rows by organization (every tenant table of the app does). */
async function hasOrganizationColumn(tableName: string): Promise<boolean> {
  const result = await database.execute(
    drizzleSql`SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = ${tableName} AND column_name = 'organization_id'`,
  );
  return rowsOf(result).length > 0;
}

/** `app.<table>`'s primary key columns (a join table's is composite, with no `id`). */
async function primaryKeyColumns(tableName: string): Promise<string[]> {
  const result = await database.execute(
    drizzleSql`SELECT a.attname AS name FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) WHERE i.indrelid = ${`app.${tableName}`}::regclass AND i.indisprimary ORDER BY a.attnum`,
  );
  return rowsOf<{ name: string }>(result).map((row) => row.name);
}

/**
 * A `WHERE` naming one row of `organizationId` in `app.<table>` by its primary key, read on the
 * harness's own connection (no RLS); undefined when the organization has none.
 */
async function oneRowWhere(tableName: string, organizationId: number): Promise<string | undefined> {
  const columns = await primaryKeyColumns(tableName);
  const selected = columns.map((column) => `"${column}"::text AS "${column}"`).join(', ');
  const result = await database.execute(
    drizzleSql.raw(
      `SELECT ${selected} FROM "app"."${tableName}" WHERE organization_id = ${organizationId} LIMIT 1`,
    ),
  );
  const row = rowsOf<Record<string, string>>(result)[0];
  if (!row) return undefined;
  return columns
    .map((column) => `"${column}" = '${String(row[column]).replaceAll("'", "''")}'`)
    .join(' AND ');
}

/** How many rows `statement` touched as the application role in `organizationPublicId`'s context. */
async function touchedAs(options: {
  statement: string;
  organizationPublicId: string;
}): Promise<number> {
  return executeAsClinozyBeAppTenant(
    options.organizationPublicId,
    async (transaction) =>
      rowsOf(await transaction.execute(drizzleSql.raw(options.statement))).length,
  );
}

/**
 * The CRUD half of the RLS matrix for the app's own tables (schema `app`), which the generic
 * matrix (`rls-matrix.security.test.ts`) leaves out by name because it seeds none of them.
 *
 * @remarks
 * - **Algorithm:** a victim organization fills its tables through the API — one record of every
 *   kind a route names (the path matrix's seeding), a payment change, then every collection write. For each `app` FORCE RLS table holding one of
 *   its rows (named by its primary key), the least-privilege application role (`clinozy_be_app`)
 *   in the victim's context reads the row (the probe is real), and in another organization's
 *   context reads none of it, updates none and deletes none.
 * - **Notes:** every app table must hold one of the victim's rows — a table the writes leave
 *   empty (a new one, or a lost write) fails the test by name instead of passing unprobed.
 */
describe('Security: the app tables’ rows stay inside their organization (application role)', () => {
  let app: FastifyInstance;
  let victim: AppFixture;
  let attacker: AppFixture;
  const appTables = EXPECTED_FORCE_RLS_TABLES.filter((table) => table.schemaName === 'app');

  beforeAll(async () => {
    await grantClinozyBeAppRoleForTests();
    ({ app } = await createTestApp());
    await cleanupDatabase();
    victim = await createAppFixture(app);
    attacker = await createAppFixture(app);
    const ids = await seedAppRecordOfEveryKind({ app, fixture: victim });
    // Moving the receipt to UPI records its edit (B20), and the collection writes fill the rest.
    const flow = new AppFlow(app, victim).as('owner');
    await flow.expect(200, 'the receipt moves to UPI', 'PATCH', `/app/payments/${ids.payment_id}`, {
      splits: [{ mode: 'upi', amount: 450 }],
    });
    const references = appRouteReferencesOf({ fixture: victim, ids });
    // A sale's return needs the sale paid.
    await flow.expect(200, 'victim: the sale', 'GET', `/app/medical-sales/${ids.medical_sale_id}`);
    const saleInvoice = flow.last('.data.invoice.id');
    const saleTotal = Number(flow.last('.data.invoice.total'));
    await flow.expect(200, 'victim: the sale paid', 'POST', '/app/payments', {
      kind: 'receipt',
      branch_id: victim.branches.vesu,
      contact_id: ids.contact_id,
      invoice_id: saleInvoice,
      splits: [{ mode: 'cash', amount: saleTotal }],
    });
    // The link tables and the records only a change or an action writes.
    const doctor = victim.members.doctor.membershipPublicId;
    const changes: [AppFlowMethod, string, unknown][] = [
      ['PATCH', '/app/memberships/me/preferences', { branch_ids: [victim.branches.vesu] }],
      ['PUT', '/app/task-rule-settings', { rules: [{ rule_key: 'reply', is_on: true }] }],
      [
        'POST',
        `/app/patients/${ids.patient_id}/check-ins/${ids.patient_check_in_id}/actions`,
        { action: 'doctor_called' },
      ],
      [
        'POST',
        `/app/medical-sales/${ids.medical_sale_id}/returns`,
        {
          items: [{ invoice_item_id: ids.invoice_item_id, quantity: 1 }],
          reason: 'unused',
          refund_mode: 'cash',
        },
      ],
      [
        'POST',
        `/app/tasks/${ids.task_id}/reassign`,
        { owner_membership_id: victim.members.front_desk.membershipPublicId },
      ],
      ['PATCH', `/app/offerings/${ids.offering_id}`, { branch_ids: [victim.branches.vesu] }],
      ['PATCH', `/app/offers/${ids.offer_id}`, { branch_ids: [victim.branches.vesu] }],
      [
        'PATCH',
        `/app/medical-reps/${ids.medical_rep_id}`,
        { manufacturer_ids: [ids.manufacturer_id] },
      ],
      [
        'PATCH',
        `/app/medicines/${ids.medicine_id}`,
        { supplier_prices: [{ supplier_id: ids.supplier_id, rate: 200 }] },
      ],
      ['PATCH', `/app/invoices/${ids.invoice_id}`, { member_ids: [doctor] }],
    ];
    for (const [method, path, body] of changes) {
      await flow.expect(200, `victim: ${method} ${path}`, method, path, body);
    }
    references.laterDay = await findBookableDay({ flow, fixture: victim, references });
    for (const route of APP_COLLECTION_WRITES) {
      const [, path = ''] = route.split(' ');
      await flow.call('POST', path, appRouteBody({ method: 'POST', path, references }));
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('every app table is FORCE RLS and keyed by organization', async () => {
    expect(appTables.length).toBeGreaterThan(60);
    const unkeyed: string[] = [];
    for (const { tableName } of appTables) {
      if (!(await hasOrganizationColumn(tableName))) unkeyed.push(tableName);
    }
    expect(unkeyed).toEqual([]);
  });

  it('another organization reads, changes and deletes none of the victim’s rows', async () => {
    const covered: string[] = [];
    const empty: string[] = [];
    const attackerPublicId = attacker.organization.publicId;
    for (const { tableName } of appTables) {
      const where = await oneRowWhere(tableName, victim.organization.id);
      if (where === undefined) {
        empty.push(tableName);
        continue;
      }
      covered.push(tableName);
      const table = `"app"."${tableName}"`;
      const read = `SELECT 1 FROM ${table} WHERE ${where}`;
      expect
        .soft(
          await touchedAs({ statement: read, organizationPublicId: victim.organization.publicId }),
          `app.${tableName}: the victim reads its own row (the probe is real)`,
        )
        .toBe(1);
      expect
        .soft(
          await touchedAs({ statement: read, organizationPublicId: attackerPublicId }),
          `app.${tableName}: another organization reads it`,
        )
        .toBe(0);
      expect
        .soft(
          await touchedAs({
            statement: `UPDATE ${table} SET organization_id = organization_id WHERE ${where} RETURNING 1`,
            organizationPublicId: attackerPublicId,
          }),
          `app.${tableName}: another organization updates it`,
        )
        .toBe(0);
      expect
        .soft(
          await touchedAs({
            statement: `DELETE FROM ${table} WHERE ${where} RETURNING 1`,
            organizationPublicId: attackerPublicId,
          }),
          `app.${tableName}: another organization deletes it`,
        )
        .toBe(0);
    }
    // Every app table holds one of the victim's rows: a new table the writes above do not fill
    // fails here until they do.
    expect(empty, 'app tables the victim’s writes leave empty').toEqual([]);
    expect(covered.length).toBe(appTables.length);
  });
});

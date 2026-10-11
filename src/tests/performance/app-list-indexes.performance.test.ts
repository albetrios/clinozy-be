import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { withOperatorTransaction } from '@/tests/helpers/operator-database.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';

/** The kernel's default list orders, each with the index that should serve it backwards. */
const LISTS = [
  {
    table: 'app.leads',
    index: 'idx_leads_organization_created',
    order: 'created_at DESC, id DESC',
    live: true,
  },
  {
    table: 'app.invoices',
    index: 'idx_invoices_organization_invoice_date',
    order: 'invoice_date DESC, id DESC',
    live: true,
  },
  {
    table: 'app.patients',
    index: 'idx_patients_organization_created',
    order: 'created_at DESC, id DESC',
    live: true,
  },
] as const;

/**
 * The app's list indexes, all ascending (task X5, docs/reviews/launch-confidence-plan-2026-10-09.md;
 * the launch AS-BUILT's index follow-ups): the kernel lists newest first (`ORDER BY <sort> DESC,
 * id DESC`, nulls first), which an ascending `(organization_id, <sort>, id)` index serves by a
 * backward scan — no sort step, and the keyset bounds the scan. A `DESC NULLS LAST` column could
 * not: its null order differs, so Postgres sorted on top.
 */
describe('Performance: the app lists read their indexes backwards', () => {
  let app: FastifyInstance;
  let fixture: AppFixture;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(LISTS.map((list) => [list.table, list]))(
    '%s: a backward index scan, no sort',
    async (_table, list) => {
      const plan = await withOperatorTransaction(async (transaction) => {
        // A fixture's few rows leave the planner on default estimates (the table is not analysed
        // after its truncate), where a sequential or bitmap scan plus a sort can cost the same as
        // the index — the question here is whether the index serves the order backwards.
        await transaction`SET LOCAL enable_seqscan = off`;
        await transaction`SET LOCAL enable_bitmapscan = off`;
        return transaction.unsafe<{ 'QUERY PLAN': string }[]>(
          `EXPLAIN (FORMAT TEXT) SELECT id FROM ${list.table}
           WHERE organization_id = $1 ${list.live ? 'AND deleted_at IS NULL' : ''}
           ORDER BY ${list.order} LIMIT 50`,
          [fixture.organization.id],
        );
      });
      const text = plan.map((row) => row['QUERY PLAN']).join('\n');
      expect(text, text).toContain(`Backward using ${list.index}`);
      expect(text, text).not.toMatch(/Sort/);
    },
  );
});

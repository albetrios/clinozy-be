import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from '@/tests/helpers/test-app.js';
import { cleanupDatabase } from '@/tests/helpers/test-database.js';
import { operatorQuery, withOperatorTransaction } from '@/tests/helpers/operator-database.js';
import {
  type AppFixture,
  createAppFixture,
} from '@/domains/app/__tests__/factories/app-fixture.factory.js';
import { AppFlow } from '@/domains/app/__tests__/factories/app-flow.factory.js';

/** Entries on the one contact — a long-standing patient's years of messages, calls and notes. */
const ENTRY_COUNT = 5_000;
/** One page of the stream, as the drawer reads it. */
const PAGE_LIMIT = 50;
/** A tripwire, not an SLO: a page that sorts or scans all 5,000 rows lands well past it. */
const PAGE_BUDGET_MS = 750;

/**
 * The contact's activity stream at volume (task C2, docs/reviews/launch-confidence-plan-2026-10-09.md;
 * routes-final 4.C, M3): 5,000 entries on one contact. The newest page and a page deep in the
 * cursor both come back as one page of 50, each under its budget — the keyset reads
 * `idx_contact_activities_contact_id_occurred_at` instead of sorting the stream.
 */
describe('Performance: a contact activity stream of 5,000 entries', () => {
  const S = String(Date.now());
  let app: FastifyInstance;
  let fixture: AppFixture;
  let flow: AppFlow;
  let contact = '';

  /** One timed page of the stream. */
  async function timedPage(query: string): Promise<{ elapsedMs: number; count: number }> {
    const started = performance.now();
    await flow.expect(
      200,
      `a page (${query})`,
      'GET',
      `/app/contacts/${contact}/activities?${query}`,
    );
    const elapsedMs = performance.now() - started;
    return { elapsedMs, count: Number(flow.last('.data | length')) };
  }

  beforeAll(async () => {
    ({ app } = await createTestApp());
    await cleanupDatabase();
    fixture = await createAppFixture(app);
    flow = new AppFlow(app, fixture).as('owner');
    await flow.expect(200, 'the contact', 'POST', '/app/contacts', {
      first_name: 'Varsha',
      last_name: `v${S}`,
      phones: [{ phone: `+919${S.slice(-7)}71`, is_primary: true }],
    });
    contact = flow.last('.data.id');
    await operatorQuery`
      INSERT INTO app.contact_activities (public_id, organization_id, contact_id, type, direction, body,
        delivery_status, occurred_at)
      SELECT 'cact_' || substr(md5(${S} || series::text), 1, 21), person.organization_id, person.id,
        CASE WHEN series % 3 = 0 THEN 'note' ELSE 'whatsapp' END,
        CASE WHEN series % 3 = 0 THEN NULL WHEN series % 3 = 1 THEN 'sent' ELSE 'received' END,
        'Entry ' || series,
        CASE WHEN series % 3 = 1 THEN 'read' END,
        now() - make_interval(mins => series)
      FROM app.contacts person, generate_series(1, ${ENTRY_COUNT}) AS series
      WHERE person.public_id = ${contact}
    `;
    await operatorQuery`ANALYZE app.contact_activities`;
    // Warm the app, the pool and the plan cache before measuring.
    await flow.call('GET', `/app/contacts/${contact}/activities?limit=${PAGE_LIMIT}`);
  });

  afterAll(async () => {
    await app.close();
  });

  it('the newest page: one page of 50, under budget', async () => {
    const page = await timedPage(`limit=${PAGE_LIMIT}&order=desc`);
    expect(page.count).toBe(PAGE_LIMIT);
    expect(flow.last('.data[0].body'), 'the newest first').toBe('Entry 1');
    expect(page.elapsedMs).toBeLessThan(PAGE_BUDGET_MS);
  });

  it('a page deep in the cursor: still one page of 50, under budget', async () => {
    let after = '';
    for (let page = 0; page < 40; page += 1) {
      await flow.expect(
        200,
        `page ${page}`,
        'GET',
        `/app/contacts/${contact}/activities?limit=${PAGE_LIMIT}&order=desc${after === '' ? '' : `&after=${after}`}`,
      );
      after = flow.last('.meta.pagination.next // empty');
      expect(after, `page ${page} has a next cursor`).not.toBe('');
    }
    const deep = await timedPage(`limit=${PAGE_LIMIT}&order=desc&after=${after}`);
    expect(deep.count).toBe(PAGE_LIMIT);
    expect(flow.last('.data[0].body'), 'page 41 starts where page 40 ended').toBe(
      `Entry ${40 * PAGE_LIMIT + 1}`,
    );
    expect(deep.elapsedMs).toBeLessThan(PAGE_BUDGET_MS);
  });

  it("the stream's keyset reads the contact's occurred_at index, backwards", async () => {
    const [person] = await operatorQuery<{ id: string }[]>`
      SELECT id::text AS id FROM app.contacts WHERE public_id = ${contact}
    `;
    const plan = await withOperatorTransaction(async (transaction) => {
      await transaction`SET LOCAL enable_seqscan = off`;
      // The repository resolves the contact first, then reads its stream by its id
      return transaction<{ 'QUERY PLAN': string }[]>`
        EXPLAIN (FORMAT TEXT)
        SELECT id FROM app.contact_activities
        WHERE contact_id = ${Number(person?.id)}
        ORDER BY occurred_at DESC, id DESC
        LIMIT ${PAGE_LIMIT}
      `;
    });
    const text = plan.map((row) => row['QUERY PLAN']).join('\n');
    expect(text).toContain(
      'Index Only Scan Backward using idx_contact_activities_contact_id_occurred_at',
    );
    expect(text).not.toContain('Sort');
  });
});

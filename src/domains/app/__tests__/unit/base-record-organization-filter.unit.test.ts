import { drizzle } from 'drizzle-orm/node-postgres';
import { describe, expect, it, vi } from 'vitest';
import {
  BaseRecordRepository,
  findBranchBookingHours,
  findMembershipIdOfUser,
  findMembershipWorkingHours,
  listVisibleBranchIds,
  resolveRecordIds,
} from '@/domains/app/base-record.repository.js';
import { tasks } from '@/domains/app/sub-domains/tasks/tasks.schema.js';

const ORGANIZATION_ID = 41;

/** Every statement the repository sends, as Postgres would receive it. */
const sent = vi.hoisted(() => [] as { text: string; params: unknown[] }[]);

vi.mock('@/infrastructure/database/contexts/database-context-runtime.js', () => ({
  getRequestDatabase: () =>
    drizzle({
      client: {
        query: async (config: string | { text: string }, params: unknown[] = []) => {
          sent.push({ text: typeof config === 'string' ? config : config.text, params });
          return { rows: [], rowCount: 0, fields: [] };
        },
      } as never,
    }),
}));

/** The statements `run` sends. */
async function statementsOf(run: () => Promise<unknown>) {
  sent.length = 0;
  await run();
  return [...sent];
}

/** Whether `statement` keeps to the organization: `"organization_id" = $n` bound to it. */
function keepsToOrganization(statement: { text: string; params: unknown[] }): boolean {
  return [...statement.text.matchAll(/"organization_id" = \$(\d+)/g)].some(
    (match) => statement.params[Number(match[1]) - 1] === ORGANIZATION_ID,
  );
}

const repository = new BaseRecordRepository({
  table: tasks,
  entity: 'task',
  searchColumns: [],
  sortColumns: { created_at: 'created_at' },
  defaultSort: 'created_at',
  defaultOrder: 'desc',
});

/**
 * Locks in the app repository's own tenant filter. Every app request runs as the RLS-subject role,
 * so RLS returns the same rows with or without the `organization_id` predicate, and no database test
 * can see it go: the planted-bug drill (A3-2, 20 Oct 2026) dropped it from liveInOrganization() and
 * 699 integration, 11 e2e and 3 cross-organization security tests passed. This test reads the SQL
 * itself, so the second layer of the tenant boundary cannot leave silently.
 */
describe('BaseRecordRepository keeps every organization-scoped statement to the organization', () => {
  const scoped: [string, () => Promise<unknown>][] = [
    ['list (live rows)', () => repository.list(ORGANIZATION_ID, { limit: 10 })],
    [
      'list (deleted rows too)',
      () => repository.list(ORGANIZATION_ID, { limit: 10, deletedRows: 'include' }),
    ],
    [
      'list (deleted rows only)',
      () => repository.list(ORGANIZATION_ID, { limit: 10, deletedRows: 'only' }),
    ],
    [
      'sumOver',
      () =>
        repository.sumOver({ organizationId: ORGANIZATION_ID, query: { limit: 10 }, column: 'id' }),
    ],
    [
      'updateMany',
      () =>
        repository.updateMany({
          organizationId: ORGANIZATION_ID,
          equals: {},
          values: { title: 'x' },
          userId: 1,
        }),
    ],
    [
      'aggregatePerGroup',
      () =>
        repository.aggregatePerGroup({
          organizationId: ORGANIZATION_ID,
          groupColumn: 'id',
          groupIds: [1],
          valueColumn: 'id',
          aggregate: 'count',
        }),
    ],
    [
      'groupCounts',
      () => repository.groupCounts({ organizationId: ORGANIZATION_ID, columns: ['status'] }),
    ],
    ['findByPublicId', () => repository.findByPublicId('task_x', ORGANIZATION_ID)],
    [
      'findByPublicId (deleted)',
      () => repository.findByPublicId('task_x', ORGANIZATION_ID, { deleted: true }),
    ],
    // The references a body names resolve only inside the organization (a cross-organization id is a 400).
    [
      'resolveRecordIds',
      () =>
        resolveRecordIds({ table: tasks, organizationId: ORGANIZATION_ID, publicIds: ['task_x'] }),
    ],
    [
      'listVisibleBranchIds',
      () => listVisibleBranchIds({ organizationId: ORGANIZATION_ID, userId: 5 }),
    ],
    [
      'findMembershipIdOfUser',
      () => findMembershipIdOfUser({ organizationId: ORGANIZATION_ID, userId: 5 }),
    ],
    [
      'findBranchBookingHours',
      () => findBranchBookingHours({ organizationId: ORGANIZATION_ID, branchId: 3 }),
    ],
    [
      'findMembershipWorkingHours',
      () => findMembershipWorkingHours({ organizationId: ORGANIZATION_ID, membershipId: 7 }),
    ],
  ];

  it.each(scoped)(
    '%s filters on the organization in every statement it sends',
    async (_name, run) => {
      const statements = await statementsOf(run);
      expect(statements.length).toBeGreaterThan(0);
      for (const statement of statements)
        expect(keepsToOrganization(statement), statement.text).toBe(true);
    },
  );

  it('a live list leaves deleted rows out; a deleted-only list keeps only them', async () => {
    const [live] = await statementsOf(() => repository.list(ORGANIZATION_ID, { limit: 10 }));
    expect(live?.text).toMatch(/"deleted_at" is null/);
    const [only] = await statementsOf(() =>
      repository.list(ORGANIZATION_ID, { limit: 10, deletedRows: 'only' }),
    );
    expect(only?.text).toMatch(/"deleted_at" is not null/);
    expect(only?.text).not.toMatch(/"deleted_at" is null/);
  });
});

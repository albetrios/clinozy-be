import { createHash } from 'node:crypto';
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import { BaseRepository } from '@/infrastructure/database/base-repository.js';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { branch_user_accesses } from '@/domains/app/sub-domains/branches/branch-user-accesses/branch-user-accesses.schema.js';
import { countWithCap } from '@/infrastructure/database/utils/capped-count.util.js';
import { buildSearchCondition } from '@/shared/utils/http/list-query.util.js';
import { createOpaqueCursorFromRow, parseListCursor } from '@/shared/utils/http/pagination.util.js';
import { generatePublicId, type PublicIdEntity } from '@/shared/utils/identity/public-id.util.js';
import { runInsertWithPublicIdentifierRetry } from '@/shared/utils/infrastructure/postgres-error.util.js';

/**
 * A row of an app record table: the standard columns every `app.*` record carries (internal and
 * public id, organization, timestamps, attribution, soft delete with its reason) plus the
 * table's own columns.
 */
export type BaseRecordRow = Record<string, unknown> & {
  id: number;
  public_id: string;
  organization_id: number;
  created_at: Date;
  updated_at: Date;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  deleted_at: Date | null;
  delete_reason: string | null;
  delete_note: string | null;
};

/** How a list reads: paging, search, sort and the filters a list query parsed. */
export interface BaseRecordListQuery {
  after?: string | undefined;
  limit: number;
  q?: string | undefined;
  sort?: string | undefined;
  order?: 'asc' | 'desc' | undefined;
  /** Column → value (`=`) or values (`IN`); `undefined` entries are ignored. */
  equals?: Record<string, unknown>;
  /** Column → `{ from, to }`: `from` inclusive, `to` exclusive (dates and timestamps). */
  ranges?: Record<string, { from?: unknown; to?: unknown }>;
  /** Rows of these branches or of no branch (the branch picker and D9 visibility). */
  branchScope?: { column: string; ids: readonly number[] } | undefined;
  /** `false` skips the COUNT (internal readers that never show a total). */
  withTotal?: boolean | undefined;
}

/** One page of a list, with the total (capped) count every list returns (P38). */
export interface BaseRecordPage {
  items: BaseRecordRow[];
  /** The capped total on the first page; null on later pages and when skipped. */
  total: number | null;
  limit: number;
  has_more: boolean;
  next_cursor: string | null;
}

/** What an app record table is: the Drizzle table, its public-id entity and how it lists. */
export interface BaseRecordTableConfig {
  table: PgTable;
  entity: PublicIdEntity;
  /** Columns `q` searches (`ILIKE '%q%'`, OR-combined). */
  searchColumns: readonly string[];
  /** The running-number column a numeric `q` (`2841`, `#2841`, `PT-0412`) also matches. */
  numberColumn?: string;
  /** Sortable fields → `text` or `created_at` keyset (a `created_at` entry is always present). */
  sortColumns: Readonly<Record<string, 'text' | 'created_at'>>;
  defaultSort: string;
  defaultOrder: 'asc' | 'desc';
}

/** A link table that holds a record's list of references to another table (e.g. `branch_ids`). */
export interface BaseRecordLinkTable {
  table: PgTable;
  /** The column naming the owning record (e.g. `offering_id`). */
  ownerColumn: string;
  /** The column naming the referenced record (e.g. `branch_id`). */
  targetColumn: string;
  /** The referenced table (has `id`, `public_id`, `deleted_at`). */
  targetTable: PgTable;
}

/** A named column of `table` (throws on a typo — the generator names them). */
export function columnOf(table: PgTable, name: string): AnyPgColumn {
  const column = (getTableColumns(table) as Record<string, AnyPgColumn>)[name];
  if (!column) throw new Error(`Column ${name} is not on this table`);
  return column;
}

/**
 * Internal ids of the live rows of `table` in the organization among `publicIds`, keyed by
 * public id.
 *
 * @remarks
 * - **Algorithm:** one `public_id IN (...)` read on the request's handle (RLS scopes it to the
 *   organization; the `organization_id` filter repeats that boundary).
 * - **Failure modes:** none beyond the query; an unknown id is simply absent from the map.
 */
export async function resolveRecordIds(options: {
  table: PgTable;
  organizationId: number;
  publicIds: readonly string[];
}): Promise<Map<string, number>> {
  const unique = [...new Set(options.publicIds)];
  if (unique.length === 0) return new Map();
  const idColumn = columnOf(options.table, 'id');
  const publicIdColumn = columnOf(options.table, 'public_id');
  const rows = (await getRequestDatabase()
    .select({ id: idColumn, public_id: publicIdColumn })
    .from(options.table)
    .where(
      and(
        inArray(publicIdColumn, unique),
        eq(columnOf(options.table, 'organization_id'), options.organizationId),
        isNull(columnOf(options.table, 'deleted_at')),
      ),
    )) as { id: number; public_id: string }[];
  return new Map(rows.map((row) => [row.public_id, row.id]));
}

/**
 * Public ids of rows of `table` by internal id (deleted rows included — a record keeps naming
 * what it pointed at).
 *
 * @remarks
 * - **Algorithm:** one `id IN (...)` read on the request's handle.
 * - **Failure modes:** none; an id RLS hides is absent from the map.
 */
export async function resolveRecordPublicIds(options: {
  table: PgTable;
  ids: readonly number[];
}): Promise<Map<number, string>> {
  const unique = [...new Set(options.ids)];
  if (unique.length === 0) return new Map();
  const idColumn = columnOf(options.table, 'id');
  const rows = (await getRequestDatabase()
    .select({ id: idColumn, public_id: columnOf(options.table, 'public_id') })
    .from(options.table)
    .where(inArray(idColumn, unique))) as { id: number; public_id: string }[];
  return new Map(rows.map((row) => [row.id, row.public_id]));
}

/**
 * The live referenced public ids of each owner through a link table, in link order.
 *
 * @remarks
 * - **Algorithm:** one join of the link table to the referenced table for every owner on the page.
 * - **Failure modes:** none; an owner with no links is absent from the map.
 */
export async function listLinkedPublicIds(options: {
  link: BaseRecordLinkTable;
  ownerIds: readonly number[];
}): Promise<Map<number, string[]>> {
  const byOwner = new Map<number, string[]>();
  if (options.ownerIds.length === 0) return byOwner;
  const { link } = options;
  const owner = columnOf(link.table, link.ownerColumn);
  const target = columnOf(link.table, link.targetColumn);
  const rows = (await getRequestDatabase()
    .select({ owner_id: owner, public_id: columnOf(link.targetTable, 'public_id') })
    .from(link.table)
    .innerJoin(link.targetTable, eq(columnOf(link.targetTable, 'id'), target))
    .where(
      and(inArray(owner, [...options.ownerIds]), isNull(columnOf(link.targetTable, 'deleted_at'))),
    )
    .orderBy(columnOf(link.table, 'created_at'))) as { owner_id: number; public_id: string }[];
  for (const row of rows) {
    const list = byOwner.get(row.owner_id) ?? [];
    list.push(row.public_id);
    byOwner.set(row.owner_id, list);
  }
  return byOwner;
}

/**
 * Makes `targetIds` an owner's exact list in a link table: removes the others, adds the missing.
 *
 * @remarks
 * - **Algorithm:** delete the owner's rows not in the list, then insert the list with
 *   `ON CONFLICT DO NOTHING` (kept rows keep their `created_at`).
 * - **Failure modes:** an FK violation for an id outside the organization — the service resolves
 *   ids first.
 */
export async function replaceLinkedIds(options: {
  link: BaseRecordLinkTable;
  ownerId: number;
  organizationId: number;
  targetIds: readonly number[];
  createdByUserId: number | null;
}): Promise<void> {
  const { link } = options;
  const database = getRequestDatabase();
  const owner = columnOf(link.table, link.ownerColumn);
  const target = columnOf(link.table, link.targetColumn);
  const ofOwner = eq(owner, options.ownerId);
  await database
    .delete(link.table)
    .where(
      options.targetIds.length === 0
        ? ofOwner
        : and(ofOwner, sql`${target} NOT IN ${[...options.targetIds]}`),
    );
  if (options.targetIds.length === 0) return;
  await database
    .insert(link.table)
    .values(
      options.targetIds.map((targetId) => ({
        [link.ownerColumn]: options.ownerId,
        [link.targetColumn]: targetId,
        organization_id: options.organizationId,
        created_by_user_id: options.createdByUserId,
      })) as never,
    )
    .onConflictDoNothing();
}

/**
 * The live, active branches the user is given in the organization, as ids (D9).
 *
 * @remarks
 * - **Algorithm:** `app.branch_user_accesses` joined to the user's live membership — the same
 *   rows `GET /app/branches/my` lists.
 */
export async function listVisibleBranchIds(options: {
  organizationId: number;
  userId: number;
}): Promise<number[]> {
  const rows = await getRequestDatabase()
    .select({ id: branches.id })
    .from(branches)
    .innerJoin(branch_user_accesses, eq(branch_user_accesses.branch_id, branches.id))
    .innerJoin(memberships, eq(memberships.id, branch_user_accesses.membership_id))
    .where(
      and(
        eq(branches.organization_id, options.organizationId),
        isNull(branches.deleted_at),
        eq(branches.is_active, true),
        eq(memberships.user_id, options.userId),
        isNull(memberships.deleted_at),
      ),
    );
  return rows.map((row) => row.id);
}

/**
 * The caller's live membership id in the organization, or null (an API key, or not a member).
 *
 * @remarks
 * - **Algorithm:** one read of `tenancy.memberships` by organization and user — the id every
 *   `*_membership_id` column holds.
 */
export async function findMembershipIdOfUser(options: {
  organizationId: number;
  userId: number | null;
}): Promise<number | null> {
  if (options.userId === null) return null;
  const rows = await getRequestDatabase()
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.organization_id, options.organizationId),
        eq(memberships.user_id, options.userId),
        isNull(memberships.deleted_at),
      ),
    )
    .limit(1);
  return rows[0]?.id ?? null;
}

/** A branch's booking hours: opening and closing time, working days, whether it is active. */
export interface BranchBookingHours {
  opens_at: string;
  closes_at: string;
  working_days: string[];
  is_active: boolean;
}

/**
 * The booking hours of a live branch of the organization, or null.
 *
 * @remarks
 * - **Algorithm:** one primary-key read of `app.branches` (the slot rules of appointments).
 */
export async function findBranchBookingHours(options: {
  organizationId: number;
  branchId: number;
}): Promise<BranchBookingHours | null> {
  const rows = await getRequestDatabase()
    .select({
      opens_at: branches.opens_at,
      closes_at: branches.closes_at,
      working_days: branches.working_days,
      is_active: branches.is_active,
    })
    .from(branches)
    .where(
      and(
        eq(branches.id, options.branchId),
        eq(branches.organization_id, options.organizationId),
        isNull(branches.deleted_at),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * The working days of a live membership of the organization, or null when it has none.
 *
 * @remarks
 * - **Algorithm:** one primary-key read of `tenancy.memberships` — a doctor is bookable only on
 *   the days they work.
 */
export async function findMembershipWorkingDays(options: {
  organizationId: number;
  membershipId: number;
}): Promise<string[] | null> {
  const rows = await getRequestDatabase()
    .select({ working_days: memberships.working_days })
    .from(memberships)
    .where(
      and(
        eq(memberships.id, options.membershipId),
        eq(memberships.organization_id, options.organizationId),
        isNull(memberships.deleted_at),
      ),
    )
    .limit(1);
  return rows[0]?.working_days ?? null;
}

/**
 * The base repository of every app record table (extends the infrastructure `BaseRepository`) —
 * the list, read, write, soft-delete and restore every `app.*` record shares. Each table's
 * repository extends it with its table and list settings.
 *
 * @remarks
 * - **Algorithm:** every statement runs on the request's database handle, so RLS scopes it to
 *   the active organization; the `organization_id` filters repeat that boundary. Lists are keyset
 *   pages (`created_at` or a text column, then id) with a capped total count.
 * - **Failure modes:** a unique violation on insert or update propagates (the service maps it).
 * - **Side effects:** writes stamp `updated_at` (never before `created_at`) and the actor.
 */
export class BaseRecordRepository extends BaseRepository {
  constructor(protected readonly config: BaseRecordTableConfig) {
    super();
  }

  /** The named column of this table. */
  protected column(name: string): AnyPgColumn {
    return columnOf(this.config.table, name);
  }

  /** Live rows of one organization. */
  protected liveInOrganization(organization_id: number): SQL {
    return and(
      eq(this.column('organization_id'), organization_id),
      isNull(this.column('deleted_at')),
    ) as SQL;
  }

  /** `q` over the search columns, or the running number when `q` reads as one. */
  private searchCondition(q: string | undefined): SQL | undefined {
    const text = buildSearchCondition(
      this.config.searchColumns.map((name) => this.column(name)),
      q,
    );
    const digits = q?.match(/^\s*(?:#|[a-z]{1,4}-)?0*(\d{1,9})\s*$/i)?.[1];
    if (!this.config.numberColumn || digits === undefined) return text;
    const number = eq(this.column(this.config.numberColumn), Number(digits));
    return text ? (or(text, number) as SQL) : number;
  }

  /** The filter conditions of a list query (equality and ranges). */
  private filterConditions(query: BaseRecordListQuery): SQL[] {
    const conditions: SQL[] = [];
    for (const [name, value] of Object.entries(query.equals ?? {})) {
      if (value === undefined) continue;
      conditions.push(
        Array.isArray(value)
          ? inArray(this.column(name), value)
          : value === null
            ? isNull(this.column(name))
            : eq(this.column(name), value),
      );
    }
    for (const [name, range] of Object.entries(query.ranges ?? {})) {
      if (range.from !== undefined) conditions.push(gte(this.column(name), range.from));
      if (range.to !== undefined) conditions.push(lt(this.column(name), range.to));
    }
    if (query.branchScope) {
      const column = this.column(query.branchScope.column);
      const ids = [...query.branchScope.ids];
      if (column.notNull) {
        // A NOT NULL branch column: a plain IN, so each branch is one index range (H4).
        conditions.push(ids.length === 0 ? sql`false` : inArray(column, ids));
      } else {
        conditions.push(
          ids.length === 0 ? isNull(column) : (or(inArray(column, ids), isNull(column)) as SQL),
        );
      }
    }
    return conditions;
  }

  /**
   * One keyset page of the organization's live rows, with the capped total on the first page.
   *
   * The cursor carries the sort column's exact value (as text, cast back with the column's own
   * SQL type) and the id, and pages with a row-value comparison whose id tie-break follows the
   * sort — so any column sorts correctly, timestamps included. Sorting by a nullable column lists
   * the rows that have a value. A cursor minted under other filters starts over at page one.
   */
  async list(organization_id: number, query: BaseRecordListQuery): Promise<BaseRecordPage> {
    const sortField =
      query.sort !== undefined && query.sort in this.config.sortColumns
        ? query.sort
        : this.config.defaultSort;
    const order = query.order ?? this.config.defaultOrder;
    const sortColumn = this.column(sortField);
    const idColumn = this.column('id');
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          q: query.q ?? '',
          sort: sortField,
          order,
          equals: query.equals ?? {},
          ranges: query.ranges ?? {},
          branch: query.branchScope?.ids ?? null,
        }),
      )
      .digest('hex');
    const cursor = parseListCursor(query.after);
    const resume =
      cursor && cursor.filter_fingerprint === fingerprint && cursor.sort_value !== undefined
        ? cursor
        : null;
    const where = and(
      this.liveInOrganization(organization_id),
      this.searchCondition(query.q),
      ...this.filterConditions(query),
      sortColumn.notNull ? undefined : isNotNull(sortColumn),
    );
    const sqlType = sql.raw(sortColumn.getSQLType());
    const keyset = resume
      ? order === 'desc'
        ? sql`(${sortColumn}, ${idColumn}) < (${resume.sort_value}::${sqlType}, ${resume.id})`
        : sql`(${sortColumn}, ${idColumn}) > (${resume.sort_value}::${sqlType}, ${resume.id})`
      : undefined;
    const sortText =
      sortColumn.columnType === 'PgTimestamp'
        ? sql<string>`to_char(${sortColumn} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
        : sql<string>`${sortColumn}::text`;
    const database = getRequestDatabase();
    const fetched = (await database
      .select({ ...getTableColumns(this.config.table), page_sort_value: sortText })
      .from(this.config.table)
      .where(and(where, keyset))
      .orderBy(
        ...(order === 'desc'
          ? [desc(sortColumn), desc(idColumn)]
          : [asc(sortColumn), asc(idColumn)]),
      )
      .limit(query.limit + 1)) as (BaseRecordRow & { page_sort_value: string })[];
    const has_more = fetched.length > query.limit;
    const page = has_more ? fetched.slice(0, query.limit) : fetched;
    const last = page.at(-1);
    const next_cursor =
      has_more && last
        ? createOpaqueCursorFromRow({
            created_at: last.created_at,
            id: last.id,
            sort_value: last.page_sort_value,
            filter_fingerprint: fingerprint,
          })
        : null;
    const items = page.map(({ page_sort_value: _sortValue, ...row }) => row as BaseRecordRow);
    // The total is the first page's: later pages and internal readers skip the count (M1).
    const total =
      query.after === undefined && query.withTotal !== false
        ? await countWithCap({ database, table: this.config.table, where })
        : null;
    return { items, total, limit: query.limit, has_more, next_cursor };
  }

  /**
   * Changes every live row of the organization matching `equals` — a rule's bulk move (a lead's
   * conversation to its new patient). Returns how many rows changed.
   */
  async updateMany(options: {
    organizationId: number;
    equals: Record<string, unknown>;
    values: Record<string, unknown>;
    userId: number | null;
  }): Promise<number> {
    const rows = await getRequestDatabase()
      .update(this.config.table)
      .set({ ...options.values, updated_at: new Date(), updated_by_user_id: options.userId })
      .where(
        and(
          this.liveInOrganization(options.organizationId),
          ...this.filterConditions({ limit: 0, equals: options.equals }),
        ),
      )
      .returning({ id: this.column('id') });
    return rows.length;
  }

  /**
   * One figure per group — `max`, `min`, `sum` or `count` of a column over the live rows of each
   * `groupColumn` value (`last visit per patient`) — in a single GROUP BY.
   */
  async aggregatePerGroup(options: {
    organizationId: number;
    groupColumn: string;
    groupIds: readonly number[];
    valueColumn: string;
    aggregate: 'max' | 'min' | 'sum' | 'count';
    equals?: Record<string, unknown>;
    ranges?: Record<string, { from?: unknown; to?: unknown }>;
  }): Promise<Map<number, unknown>> {
    if (options.groupIds.length === 0) return new Map();
    const group = this.column(options.groupColumn);
    const value = this.column(options.valueColumn);
    const figure = {
      max: sql`max(${value})`,
      min: sql`min(${value})`,
      sum: sql`coalesce(sum(${value}), 0)`,
      count: sql`count(${value})::int`,
    }[options.aggregate];
    const rows = (await getRequestDatabase()
      .select({ group_id: group, figure })
      .from(this.config.table)
      .where(
        and(
          this.liveInOrganization(options.organizationId),
          inArray(group, [...options.groupIds]),
          ...this.filterConditions({
            limit: 0,
            equals: options.equals ?? {},
            ranges: options.ranges ?? {},
          }),
        ),
      )
      .groupBy(group)) as { group_id: number; figure: unknown }[];
    return new Map(rows.map((row) => [row.group_id, row.figure]));
  }

  /**
   * Row counts per combination of `columns` over the live rows a filter keeps (`per date and
   * status`) — one GROUP BY, for calendar counts and dashboards.
   */
  async groupCounts(options: {
    organizationId: number;
    columns: readonly string[];
    equals?: Record<string, unknown>;
    ranges?: Record<string, { from?: unknown; to?: unknown }>;
    branchScope?: { column: string; ids: readonly number[] } | undefined;
  }): Promise<Record<string, unknown>[]> {
    const selection: Record<string, AnyPgColumn | SQL> = {};
    for (const name of options.columns) selection[name] = this.column(name);
    selection.count = sql<number>`count(*)::int`;
    return (await getRequestDatabase()
      .select(selection)
      .from(this.config.table)
      .where(
        and(
          this.liveInOrganization(options.organizationId),
          ...this.filterConditions({
            limit: 0,
            equals: options.equals ?? {},
            ranges: options.ranges ?? {},
            branchScope: options.branchScope,
          }),
        ),
      )
      .groupBy(...options.columns.map((name) => this.column(name)))) as Record<string, unknown>[];
  }

  /** A live row by its internal id (a reference column's value), or null. */
  async findById(id: number): Promise<BaseRecordRow | null> {
    const rows = (await getRequestDatabase()
      .select()
      .from(this.config.table)
      .where(and(eq(this.column('id'), id), isNull(this.column('deleted_at'))))
      .limit(1)) as BaseRecordRow[];
    return rows[0] ?? null;
  }

  /** A row of the organization by public id — live, or only a deleted one when asked. */
  async findByPublicId(
    public_id: string,
    organization_id: number,
    options: { deleted?: boolean } = {},
  ): Promise<BaseRecordRow | null> {
    const rows = (await getRequestDatabase()
      .select()
      .from(this.config.table)
      .where(
        and(
          eq(this.column('public_id'), public_id),
          eq(this.column('organization_id'), organization_id),
          options.deleted
            ? isNotNull(this.column('deleted_at'))
            : isNull(this.column('deleted_at')),
        ),
      )
      .limit(1)) as BaseRecordRow[];
    return rows[0] ?? null;
  }

  /** Inserts a row with a fresh public id; returns it. */
  async insert(values: Record<string, unknown>): Promise<BaseRecordRow> {
    return runInsertWithPublicIdentifierRetry(async () => {
      const rows = (await getRequestDatabase()
        .insert(this.config.table)
        .values({ ...values, public_id: generatePublicId(this.config.entity) } as never)
        .returning()) as BaseRecordRow[];
      return rows[0]!;
    });
  }

  /** Updates a live row; returns it, or null when it no longer exists. */
  async update(
    id: number,
    values: Record<string, unknown>,
    updated_by_user_id: number | null,
  ): Promise<BaseRecordRow | null> {
    const rows = (await getRequestDatabase()
      .update(this.config.table)
      .set({
        ...values,
        updated_at: sql`greatest(${this.column('created_at')}, now())`,
        updated_by_user_id,
      } as never)
      .where(and(eq(this.column('id'), id), isNull(this.column('deleted_at'))))
      .returning()) as BaseRecordRow[];
    return rows[0] ?? null;
  }

  /**
   * Moves a live row's counter by `delta` in one guarded statement (a package's sessions used, a
   * batch's quantity) — never below zero, never above `ceilingColumn` when named.
   *
   * @remarks
   * - **Algorithm:** `UPDATE … SET column = column + delta WHERE … AND column + delta >= 0 [AND
   *   column + delta <= ceilingColumn] RETURNING *` — the guard and the write are one statement,
   *   so concurrent moves can never overshoot.
   * - **Failure modes:** none; a move the guard refuses (or a gone row) answers null.
   */
  async adjust(options: {
    id: number;
    column: string;
    delta: number;
    ceilingColumn?: string;
    userId: number | null;
  }): Promise<BaseRecordRow | null> {
    const column = this.column(options.column);
    const moved = sql`${column} + ${options.delta}`;
    const rows = (await getRequestDatabase()
      .update(this.config.table)
      .set({
        [options.column]: moved,
        updated_at: sql`greatest(${this.column('created_at')}, now())`,
        updated_by_user_id: options.userId,
      } as never)
      .where(
        and(
          eq(this.column('id'), options.id),
          isNull(this.column('deleted_at')),
          sql`${moved} >= 0`,
          options.ceilingColumn
            ? sql`${moved} <= ${this.column(options.ceilingColumn)}`
            : undefined,
        ),
      )
      .returning()) as BaseRecordRow[];
    return rows[0] ?? null;
  }

  /** Soft-deletes a live row with its reason; returns it, or null when it is gone. */
  async softDelete(
    id: number,
    removal: { delete_reason: string; delete_note: string | null },
    updated_by_user_id: number | null,
  ): Promise<BaseRecordRow | null> {
    const rows = (await getRequestDatabase()
      .update(this.config.table)
      .set({
        ...removal,
        deleted_at: sql`now()`,
        updated_at: sql`greatest(${this.column('created_at')}, now())`,
        updated_by_user_id,
      } as never)
      .where(and(eq(this.column('id'), id), isNull(this.column('deleted_at'))))
      .returning()) as BaseRecordRow[];
    return rows[0] ?? null;
  }

  /** Undoes a soft delete; returns the row, or null when it is not deleted. */
  async restore(id: number, updated_by_user_id: number | null): Promise<BaseRecordRow | null> {
    const rows = (await getRequestDatabase()
      .update(this.config.table)
      .set({
        deleted_at: null,
        delete_reason: null,
        delete_note: null,
        updated_at: sql`greatest(${this.column('created_at')}, now())`,
        updated_by_user_id,
      } as never)
      .where(and(eq(this.column('id'), id), isNotNull(this.column('deleted_at'))))
      .returning()) as BaseRecordRow[];
    return rows[0] ?? null;
  }
}

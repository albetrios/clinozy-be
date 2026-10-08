import { createHash } from 'node:crypto';
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gt,
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
import { branch_members } from '@/domains/app/sub-domains/branches/branch-members/branch-members.schema.js';
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
  /** Rows linked to a record through a link table (`branch_id` over an offering's `branch_ids`). */
  linked?: readonly BaseRecordLinkFilter[] | undefined;
  /** Filters the table works out itself, by name → value (an offer's derived `status`). */
  derived?: Record<string, unknown> | undefined;
  /** `false` skips the COUNT (internal readers that never show a total). */
  withTotal?: boolean | undefined;
}

/** A list filter through a link table: the rows linked to one record. */
export interface BaseRecordLinkFilter {
  link: BaseRecordLinkTable;
  /** The linked record's internal id. */
  targetId: number;
  /** Also keep the rows with no links at all — where none means every one (no branches = every branch, O5). */
  orUnlinked: boolean;
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

/** One key of a {@link BaseRecordSortSpec}. */
export interface BaseRecordSortKey {
  /**
   * A column of the table, or an SQL expression of the row built for the organization and the
   * query (a derived status; the best match for `q`).
   */
  value: string | ((organizationId: number, query: BaseRecordListQuery) => SQL);
  /** The SQL type the cursor's text value casts back to — required for an expression; a column's own otherwise. */
  sqlType?: string;
  /** `true` = this key runs against the list's order (status first, then newest first inside each). */
  reversed?: boolean;
}

/** A sort of several keys, or of an expression, then `id` — with its own order when the query names none. */
export interface BaseRecordSortSpec {
  /** Most significant first; an expression key must never be null. */
  keys: readonly BaseRecordSortKey[];
  defaultOrder: 'asc' | 'desc';
}

/** What an app record table is: the Drizzle table, its public-id entity and how it lists. */
export interface BaseRecordTableConfig {
  table: PgTable;
  entity: PublicIdEntity;
  /** Columns `q` searches (`ILIKE '%q%'`, OR-combined); a text array is searched as one string of its entries. */
  searchColumns: readonly string[];
  /** The running-number column a numeric `q` (`2841`, `#2841`, `PT-0412`) also matches. */
  numberColumn?: string;
  /** Sortable fields → `text` or `created_at` keyset (a `created_at` entry is always present). */
  sortColumns: Readonly<Record<string, 'text' | 'created_at'>>;
  /**
   * Sorts made of several keys or an expression, by sort name — checked before `sortColumns` (a
   * menu's `sort_order` then name; an offer's derived status then newest first).
   */
  sortKeys?: Readonly<Record<string, BaseRecordSortSpec>>;
  /** Filters the table works out itself (`BaseRecordListQuery.derived`), by name → the condition for a value. */
  derivedFilters?: Readonly<Record<string, (value: unknown, organizationId: number) => SQL>>;
  defaultSort: string;
  defaultOrder: 'asc' | 'desc';
}

/** A list's sort resolved for one query: its name, order and keys (then `id`). */
interface ResolvedSort {
  name: string;
  order: 'asc' | 'desc';
  keys: readonly ResolvedSortKey[];
  /** `IS NOT NULL` on each nullable sort column — a nullable column lists the rows that have a value. */
  notNull: readonly SQL[];
}

/** One key of a {@link ResolvedSort}. */
interface ResolvedSortKey {
  expression: SQL | AnyPgColumn;
  /** The SQL type the cursor's text value casts back to. */
  castType: string;
  /** A timestamp's cursor text keeps microseconds, in UTC. */
  isTimestamp: boolean;
  direction: 'asc' | 'desc';
}

/**
 * The keyset condition after a cursor: rows past `values` (then `id`) in each key's direction — one
 * row comparison when every key runs the same way, else the expanded OR of comparisons.
 */
function keysetCondition(options: {
  keys: readonly ResolvedSortKey[];
  idColumn: AnyPgColumn;
  values: readonly string[];
  id: number;
}): SQL {
  const { keys, idColumn, id } = options;
  const idDirection = keys.at(-1)?.direction ?? 'asc';
  const typedValues = keys.map(
    (key, index) => sql`${options.values[index]}::${sql.raw(key.castType)}`,
  );
  if (keys.every((key) => key.direction === idDirection)) {
    const left = sql.join([...keys.map((key) => key.expression), idColumn], sql`, `);
    const right = sql.join([...typedValues, sql`${id}`], sql`, `);
    return idDirection === 'desc' ? sql`(${left}) < (${right})` : sql`(${left}) > (${right})`;
  }
  const branches: SQL[] = [];
  const equalSoFar: SQL[] = [];
  keys.forEach((key, index) => {
    const value = typedValues[index]!;
    const past =
      key.direction === 'desc'
        ? sql`${key.expression} < ${value}`
        : sql`${key.expression} > ${value}`;
    branches.push(and(...equalSoFar, past) as SQL);
    equalSoFar.push(sql`${key.expression} = ${value}`);
  });
  branches.push(
    and(...equalSoFar, idDirection === 'desc' ? lt(idColumn, id) : gt(idColumn, id)) as SQL,
  );
  return or(...branches) as SQL;
}

/** A cursor's sort values: the plain text of a one-key sort, a JSON list for several keys; null when unreadable. */
function readCursorSortValues(sortValue: string, keyCount: number): string[] | null {
  if (keyCount === 1) return [sortValue];
  try {
    const values: unknown = JSON.parse(sortValue);
    return Array.isArray(values) &&
      values.length === keyCount &&
      values.every((value) => typeof value === 'string')
      ? (values as string[])
      : null;
  } catch {
    return null;
  }
}

/** A link table that holds a record's list of references to another table (e.g. `branch_ids`). */
export interface BaseRecordLinkTable {
  table: PgTable;
  /** The column naming the owning record (e.g. `offering_id`). */
  ownerColumn: string;
  /** The column naming the referenced record (e.g. `branch_id`). */
  targetColumn: string;
  /** The referenced table (has `id`, `public_id`, and `deleted_at` when it is soft-deleted). */
  targetTable: PgTable;
}

/**
 * The two keys of a sort on a value that can be empty, keeping the rows without one — last, in
 * either order (L7): first whether the value is there, then the value (`empty` stands in for a
 * missing one, so neither key is ever null).
 *
 * @remarks
 * - **Algorithm:** the presence flag runs with the list's order — `(v IS NULL)::int` when it is
 *   ascending, `(v IS NOT NULL)::int` when descending — so the empty rows always come after.
 */
export function nullsLastSortKeys(options: {
  /** The value, for the organization and the query (a column or a subselect). */
  value: (organizationId: number, query: BaseRecordListQuery) => SQL;
  /** Its SQL type (the cursor casts back to it). */
  sqlType: string;
  /** What a missing value sorts as, inside the empty rows (any value of the type). */
  empty: SQL;
  /** The sort's order when the query names none. */
  defaultOrder: 'asc' | 'desc';
}): readonly BaseRecordSortKey[] {
  return [
    {
      value: (organizationId, query) => {
        const value = options.value(organizationId, query);
        return (query.order ?? options.defaultOrder) === 'desc'
          ? sql`(${value} IS NOT NULL)::int`
          : sql`(${value} IS NULL)::int`;
      },
      sqlType: 'integer',
    },
    {
      value: (organizationId, query) =>
        sql`coalesce(${options.value(organizationId, query)}, ${options.empty})`,
      sqlType: options.sqlType,
    },
  ];
}

/** A named column of `table` (throws on a typo — the generator names them). */
export function columnOf(table: PgTable, name: string): AnyPgColumn {
  const column = (getTableColumns(table) as Record<string, AnyPgColumn>)[name];
  if (!column) throw new Error(`Column ${name} is not on this table`);
  return column;
}

/**
 * The live-row filter of `table`: `deleted_at IS NULL`, or none for a table that is never
 * soft-deleted (`app.branches` retires with `is_active` instead).
 */
function liveRowFilter(table: PgTable): SQL | undefined {
  const deletedAt = (getTableColumns(table) as Record<string, AnyPgColumn>).deleted_at;
  return deletedAt ? isNull(deletedAt) : undefined;
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
  /** Column values each row must also have (`{ is_active: true }`). */
  equals?: Readonly<Record<string, unknown>> | undefined;
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
        liveRowFilter(options.table),
        ...Object.entries(options.equals ?? {}).map(([name, value]) =>
          eq(columnOf(options.table, name), value),
        ),
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
    .where(and(inArray(owner, [...options.ownerIds]), liveRowFilter(link.targetTable)))
    .orderBy(columnOf(link.table, 'created_at'))) as { owner_id: number; public_id: string }[];
  for (const row of rows) {
    const list = byOwner.get(row.owner_id) ?? [];
    list.push(row.public_id);
    byOwner.set(row.owner_id, list);
  }
  return byOwner;
}

/** A child table a record keeps a set of rows in, without public ids (`app.contact_phones`). */
export interface BaseRecordChildTable {
  table: PgTable;
  /** The column naming the owning record (`contact_id`). */
  ownerColumn: string;
  /** The columns each child is written with and read back as (`phone`, `is_primary`, …). */
  columns: readonly string[];
  /** Child column → owner column, copied from the owner onto every child (`household_contact_id`). */
  copiedFromOwner?: Readonly<Record<string, string>>;
  /** Read order: column names, `-` first for descending (`['-is_primary', 'phone']`). */
  order?: readonly string[];
}

/**
 * Each owner's child rows (only the child list's `columns`), in the list's order.
 *
 * @remarks
 * - **Algorithm:** one `owner IN (...)` read of the child table on the request's handle.
 * - **Failure modes:** none; an owner with no children is absent from the map.
 */
export async function listChildRows(options: {
  child: BaseRecordChildTable;
  ownerIds: readonly number[];
}): Promise<Map<number, Record<string, unknown>[]>> {
  const byOwner = new Map<number, Record<string, unknown>[]>();
  if (options.ownerIds.length === 0) return byOwner;
  const { child } = options;
  const owner = columnOf(child.table, child.ownerColumn);
  const selection: Record<string, AnyPgColumn> = { owner_id: owner };
  for (const name of child.columns) selection[name] = columnOf(child.table, name);
  const rows = (await getRequestDatabase()
    .select(selection)
    .from(child.table)
    .where(inArray(owner, [...options.ownerIds]))
    .orderBy(
      owner,
      ...(child.order ?? []).map((name) =>
        name.startsWith('-')
          ? desc(columnOf(child.table, name.slice(1)))
          : asc(columnOf(child.table, name)),
      ),
    )) as ({ owner_id: number } & Record<string, unknown>)[];
  for (const { owner_id, ...row } of rows) {
    const list = byOwner.get(owner_id) ?? [];
    list.push(row);
    byOwner.set(owner_id, list);
  }
  return byOwner;
}

/**
 * Makes `rows` an owner's exact set of child rows: deletes the old set, inserts the new one with
 * the owner, the organization and the columns copied from the owner.
 *
 * @remarks
 * - **Failure modes:** a unique or exclusion violation propagates (the service maps it).
 */
export async function replaceChildRows(options: {
  child: BaseRecordChildTable;
  owner: BaseRecordRow;
  rows: readonly Record<string, unknown>[];
}): Promise<void> {
  const { child, owner } = options;
  const database = getRequestDatabase();
  await database.delete(child.table).where(eq(columnOf(child.table, child.ownerColumn), owner.id));
  if (options.rows.length === 0) return;
  const copied = Object.fromEntries(
    Object.entries(child.copiedFromOwner ?? {}).map(([childColumn, ownerColumn]) => [
      childColumn,
      owner[ownerColumn],
    ]),
  );
  await database.insert(child.table).values(
    options.rows.map((row) => ({
      ...Object.fromEntries(
        child.columns.filter((name) => name in row).map((name) => [name, row[name]]),
      ),
      ...copied,
      [child.ownerColumn]: owner.id,
      organization_id: owner.organization_id,
    })) as never,
  );
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
 * - **Algorithm:** `app.branch_members` joined to the user's live membership — the same
 *   rows `GET /app/branches/my` lists.
 */
export async function listVisibleBranchIds(options: {
  organizationId: number;
  userId: number;
}): Promise<number[]> {
  const rows = await getRequestDatabase()
    .select({ id: branches.id })
    .from(branches)
    .innerJoin(branch_members, eq(branch_members.branch_id, branches.id))
    .innerJoin(memberships, eq(memberships.id, branch_members.membership_id))
    .where(
      and(
        eq(branches.organization_id, options.organizationId),
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
      and(eq(branches.id, options.branchId), eq(branches.organization_id, options.organizationId)),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * The working days and hours of a live membership of the organization, or null when it has none.
 *
 * @remarks
 * - **Algorithm:** one primary-key read of `tenancy.memberships` — a doctor is bookable only on
 *   the days they work, inside their hours (A4).
 */
export async function findMembershipWorkingHours(options: {
  organizationId: number;
  membershipId: number;
}): Promise<{ working_days: string[]; work_starts_at: string; work_ends_at: string } | null> {
  const rows = await getRequestDatabase()
    .select({
      working_days: memberships.working_days,
      work_starts_at: memberships.work_starts_at,
      work_ends_at: memberships.work_ends_at,
    })
    .from(memberships)
    .where(
      and(
        eq(memberships.id, options.membershipId),
        eq(memberships.organization_id, options.organizationId),
        isNull(memberships.deleted_at),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
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

  /** Live rows of one organization (every row of an append-only table — no `deleted_at`). */
  protected liveInOrganization(organization_id: number): SQL {
    return and(
      eq(this.column('organization_id'), organization_id),
      liveRowFilter(this.config.table),
    ) as SQL;
  }

  /** Whether the table soft-deletes (has `deleted_at`) — an append-only log does not. */
  protected get softDeletes(): boolean {
    return liveRowFilter(this.config.table) !== undefined;
  }

  /** `q` over the search columns, or the running number when `q` reads as one. */
  private searchCondition(q: string | undefined): SQL | undefined {
    const text = buildSearchCondition(
      this.config.searchColumns.map((name) => {
        const column = this.column(name);
        // A text array (an offering's search terms, O9) is searched as one string of its entries.
        return column.columnType === 'PgArray' ? sql`array_to_string(${column}, ' ')` : column;
      }),
      q,
    );
    const digits = q?.match(/^\s*(?:#|[a-z]{1,4}-)?0*(\d{1,9})\s*$/i)?.[1];
    if (!this.config.numberColumn || digits === undefined) return text;
    const number = eq(this.column(this.config.numberColumn), Number(digits));
    return text ? (or(text, number) as SQL) : number;
  }

  /** The filter conditions of a list query (equality, ranges, branches, links and derived filters). */
  private filterConditions(query: BaseRecordListQuery, organizationId: number): SQL[] {
    const conditions: SQL[] = [];
    for (const [name, value] of Object.entries(query.equals ?? {})) {
      if (value === undefined) continue;
      conditions.push(this.equalsCondition(name, value));
    }
    for (const [name, range] of Object.entries(query.ranges ?? {})) {
      if (range.from !== undefined) conditions.push(gte(this.column(name), range.from));
      if (range.to !== undefined) conditions.push(lt(this.column(name), range.to));
    }
    if (query.branchScope) conditions.push(this.branchCondition(query.branchScope));
    for (const filter of query.linked ?? []) conditions.push(this.linkedCondition(filter));
    conditions.push(...this.derivedConditions(query.derived, organizationId));
    return conditions;
  }

  /**
   * `column = value`, `IN (values)` or `IS NULL` — a list holding `null` also keeps the rows without
   * a value (a read scope that allows only unlinked rows is `[null]`).
   */
  private equalsCondition(name: string, value: unknown): SQL {
    const column = this.column(name);
    if (value === null) return isNull(column);
    if (!Array.isArray(value)) return eq(column, value);
    const present = value.filter((entry) => entry !== null);
    const values = present.length === 0 ? undefined : inArray(column, present);
    if (present.length === value.length) return values ?? sql`false`;
    return values ? (or(values, isNull(column)) as SQL) : isNull(column);
  }

  /** Rows of the scope's branches — or of no branch, on a nullable branch column (D9). */
  private branchCondition(branchScope: { column: string; ids: readonly number[] }): SQL {
    const column = this.column(branchScope.column);
    const ids = [...branchScope.ids];
    // A NOT NULL branch column: a plain IN, so each branch is one index range (H4).
    if (column.notNull) return ids.length === 0 ? sql`false` : inArray(column, ids);
    return ids.length === 0 ? isNull(column) : (or(inArray(column, ids), isNull(column)) as SQL);
  }

  /** The conditions of the table's own derived filters ({@link BaseRecordTableConfig.derivedFilters}). */
  private derivedConditions(
    derived: Record<string, unknown> | undefined,
    organizationId: number,
  ): SQL[] {
    const conditions: SQL[] = [];
    for (const [name, value] of Object.entries(derived ?? {})) {
      if (value === undefined) continue;
      const build = this.config.derivedFilters?.[name];
      if (!build) throw new Error(`No derived filter named ${name}`);
      conditions.push(build(value, organizationId));
    }
    return conditions;
  }

  /** The rows linked to the filter's record — or, where none means every one, with no links at all. */
  private linkedCondition(filter: BaseRecordLinkFilter): SQL {
    const { link } = filter;
    const owner = columnOf(link.table, link.ownerColumn);
    const ownerIsRow = sql`${owner} = ${this.column('id')}`;
    const linked = sql`exists (select 1 from ${link.table} where ${ownerIsRow} and ${columnOf(link.table, link.targetColumn)} = ${filter.targetId})`;
    if (!filter.orUnlinked) return linked;
    return or(linked, sql`not exists (select 1 from ${link.table} where ${ownerIsRow})`) as SQL;
  }

  /** The query's sort: a named multi-key sort, a sortable column, or the default — with its order and keys. */
  private resolveSort(query: BaseRecordListQuery, organizationId: number): ResolvedSort {
    const { sortKeys = {}, sortColumns } = this.config;
    const name =
      query.sort !== undefined && (query.sort in sortKeys || query.sort in sortColumns)
        ? query.sort
        : this.config.defaultSort;
    const spec = sortKeys[name];
    const order = query.order ?? spec?.defaultOrder ?? this.config.defaultOrder;
    const against = order === 'asc' ? 'desc' : 'asc';
    const keys: ResolvedSortKey[] = [];
    const notNull: SQL[] = [];
    for (const key of spec?.keys ?? [{ value: name }]) {
      const direction = key.reversed ? against : order;
      if (typeof key.value === 'string') {
        const column = this.column(key.value);
        if (!column.notNull) notNull.push(isNotNull(column));
        keys.push({
          expression: column,
          castType: key.sqlType ?? column.getSQLType(),
          isTimestamp: column.columnType === 'PgTimestamp',
          direction,
        });
      } else {
        if (!key.sqlType) throw new Error(`Sort ${name}: an expression key names its SQL type`);
        keys.push({
          expression: key.value(organizationId, query),
          castType: key.sqlType,
          isTimestamp: false,
          direction,
        });
      }
    }
    return { name, order, keys, notNull };
  }

  /**
   * One keyset page of the organization's live rows, with the capped total on the first page.
   *
   * The cursor carries each sort key's exact value (as text, cast back with the key's own SQL type
   * — a several-key sort carries them as a JSON list) and the id, and pages with a keyset comparison
   * whose id tie-break follows the last key — so any column or expression sorts correctly,
   * timestamps included. Sorting by a nullable column lists the rows that have a value. A cursor
   * minted under other filters starts over at page one.
   */
  async list(organization_id: number, query: BaseRecordListQuery): Promise<BaseRecordPage> {
    const sort = this.resolveSort(query, organization_id);
    const idColumn = this.column('id');
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          q: query.q ?? '',
          sort: sort.name,
          order: sort.order,
          equals: query.equals ?? {},
          ranges: query.ranges ?? {},
          branch: query.branchScope?.ids ?? null,
          ...(query.linked?.length
            ? {
                linked: query.linked.map((filter) => [
                  filter.link.ownerColumn,
                  filter.link.targetColumn,
                  filter.targetId,
                  filter.orUnlinked,
                ]),
              }
            : {}),
          ...(query.derived ? { derived: query.derived } : {}),
        }),
      )
      .digest('hex');
    const cursor = parseListCursor(query.after);
    const resumeValues =
      cursor && cursor.filter_fingerprint === fingerprint && cursor.sort_value !== undefined
        ? readCursorSortValues(cursor.sort_value, sort.keys.length)
        : null;
    const where = and(
      this.liveInOrganization(organization_id),
      this.searchCondition(query.q),
      ...this.filterConditions(query, organization_id),
      ...sort.notNull,
    );
    const keyset =
      resumeValues && cursor?.id !== undefined
        ? keysetCondition({ keys: sort.keys, idColumn, values: resumeValues, id: cursor.id })
        : undefined;
    const sortTexts = Object.fromEntries(
      sort.keys.map((key, index) => [
        `page_sort_${index}`,
        key.isTimestamp
          ? sql<string>`to_char(${key.expression} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
          : sql<string>`${key.expression}::text`,
      ]),
    );
    const idDirection = sort.keys.at(-1)?.direction ?? sort.order;
    const database = getRequestDatabase();
    const fetched = (await database
      .select({ ...getTableColumns(this.config.table), ...sortTexts })
      .from(this.config.table)
      .where(and(where, keyset))
      .orderBy(
        ...sort.keys.map((key) =>
          key.direction === 'desc' ? desc(key.expression) : asc(key.expression),
        ),
        idDirection === 'desc' ? desc(idColumn) : asc(idColumn),
      )
      .limit(query.limit + 1)) as (BaseRecordRow & Record<string, unknown>)[];
    const has_more = fetched.length > query.limit;
    const page = has_more ? fetched.slice(0, query.limit) : fetched;
    const last = page.at(-1);
    const sortValues = last
      ? sort.keys.map((_key, index) => String(last[`page_sort_${index}`]))
      : [];
    const next_cursor =
      has_more && last
        ? createOpaqueCursorFromRow({
            created_at: last.created_at,
            id: last.id,
            sort_value: sortValues.length === 1 ? sortValues[0]! : JSON.stringify(sortValues),
            filter_fingerprint: fingerprint,
          })
        : null;
    const items = page.map((row) => {
      const item = { ...row };
      for (const name of Object.keys(sortTexts)) delete item[name];
      return item as BaseRecordRow;
    });
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
          ...this.filterConditions({ limit: 0, equals: options.equals }, options.organizationId),
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
          ...this.filterConditions(
            { limit: 0, equals: options.equals ?? {}, ranges: options.ranges ?? {} },
            options.organizationId,
          ),
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
          ...this.filterConditions(
            {
              limit: 0,
              equals: options.equals ?? {},
              ranges: options.ranges ?? {},
              branchScope: options.branchScope,
            },
            options.organizationId,
          ),
        ),
      )
      .groupBy(...options.columns.map((name) => this.column(name)))) as Record<string, unknown>[];
  }

  /** A live row by its internal id (a reference column's value), or null. */
  async findById(id: number): Promise<BaseRecordRow | null> {
    const rows = (await getRequestDatabase()
      .select()
      .from(this.config.table)
      .where(and(eq(this.column('id'), id), liveRowFilter(this.config.table)))
      .limit(1)) as BaseRecordRow[];
    return rows[0] ?? null;
  }

  /** A row of the organization by public id — live, or only a deleted one when asked. */
  async findByPublicId(
    public_id: string,
    organization_id: number,
    options: { deleted?: boolean } = {},
  ): Promise<BaseRecordRow | null> {
    if (options.deleted && !this.softDeletes) return null;
    const rows = (await getRequestDatabase()
      .select()
      .from(this.config.table)
      .where(
        and(
          eq(this.column('public_id'), public_id),
          eq(this.column('organization_id'), organization_id),
          options.deleted ? isNotNull(this.column('deleted_at')) : liveRowFilter(this.config.table),
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
      .where(and(eq(this.column('id'), id), liveRowFilter(this.config.table)))
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
          liveRowFilter(this.config.table),
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

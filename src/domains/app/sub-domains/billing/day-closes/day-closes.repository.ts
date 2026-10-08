import { and, asc, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { PostgresDatabaseHandle } from '@/infrastructure/database/utils/database-handle.types.js';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { PAYMENT_DIRECTION } from '@/domains/app/sub-domains/billing/payments/payments.constants.js';
import { paymentDay } from '@/domains/app/sub-domains/billing/payments/payments.repository.js';
import { payments } from '@/domains/app/sub-domains/billing/payments/payments.schema.js';
import { DAY_CLOSE_STATUS } from './day-closes.constants.js';
import { day_close_events, day_closes } from './day-closes.schema.js';

/** A day's live money (B25, B27): cash in and out, the net by mode, how many entries. */
export interface DayCloseFigures {
  cash_in: number;
  cash_out: number;
  net: { cash: number; upi: number; card: number; credit: number };
  entry_count: number;
}

/** One member's entries of a day (who recorded them). */
export interface DayCloseMemberTotal {
  membership_id: string | null;
  count: number;
  amount: number;
}

/** A day-close event as a page reads it (B27). */
export interface DayCloseEventRow {
  day_close_id: number;
  id: string;
  kind: string;
  text: string | null;
  membership_id: string | null;
  occurred_at: Date;
}

/** No money moved that day. */
export const EMPTY_DAY_CLOSE_FIGURES: DayCloseFigures = {
  cash_in: 0,
  cash_out: 0,
  net: { cash: 0, upi: 0, card: 0, credit: 0 },
  entry_count: 0,
};

/** `+amount` received, `−amount` paid — a split column as the day's net. */
function signed(column: AnyPgColumn) {
  return sql`case when ${payments.direction} = ${PAYMENT_DIRECTION.RECEIVED} then ${column} else -${column} end`;
}

/** A numeric aggregate read back as a number. */
function numberOf(value: unknown): number {
  return Number(value ?? 0);
}

/** What a step records of a day (B27). */
export interface DayCloseEventInsert {
  organizationId: number;
  dayCloseId: number;
  kind: string;
  text: string | null;
  membershipId: number | null;
  userId: number | null;
}

/** B25: the counted cash of a branch's last closed day before `before` — the carried opening. */
export async function selectLastCountedCash(
  database: PostgresDatabaseHandle,
  options: { branchId: number; before: string },
): Promise<number | null> {
  const rows = await database
    .select({ counted: day_closes.counted_cash })
    .from(day_closes)
    .where(
      and(
        eq(day_closes.branch_id, options.branchId),
        eq(day_closes.status, DAY_CLOSE_STATUS.CLOSED),
        lt(day_closes.close_date, options.before),
      ),
    )
    .orderBy(desc(day_closes.close_date))
    .limit(1);
  return rows[0] ? numberOf(rows[0].counted) : null;
}

/**
 * The live money of each day close (B25, B27): its branch's live payments whose organization date
 * of `paid_at` is the day — cash in and out, the net by mode, the entries.
 */
export async function selectDayCloseFigures(
  database: PostgresDatabaseHandle,
  options: { dayCloseIds: readonly number[]; organizationId: number },
): Promise<Map<number, DayCloseFigures>> {
  if (options.dayCloseIds.length === 0) return new Map();
  const received = sql`${payments.direction} = ${PAYMENT_DIRECTION.RECEIVED}`;
  const rows = await database
    .select({
      id: day_closes.id,
      cash_in: sql<string>`coalesce(sum(case when ${received} then ${payments.cash_amount} else 0 end), 0)`,
      cash_out: sql<string>`coalesce(sum(case when ${received} then 0 else ${payments.cash_amount} end), 0)`,
      cash: sql<string>`coalesce(sum(${signed(payments.cash_amount)}), 0)`,
      upi: sql<string>`coalesce(sum(${signed(payments.upi_amount)}), 0)`,
      card: sql<string>`coalesce(sum(${signed(payments.card_amount)}), 0)`,
      credit: sql<string>`coalesce(sum(${signed(payments.credit_amount)}), 0)`,
      entry_count: sql<number>`count(*)::int`,
    })
    .from(day_closes)
    .innerJoin(
      payments,
      and(
        eq(payments.branch_id, day_closes.branch_id),
        isNull(payments.deleted_at),
        sql`${paymentDay(options.organizationId)} = ${day_closes.close_date}`,
      ),
    )
    .where(inArray(day_closes.id, [...options.dayCloseIds]))
    .groupBy(day_closes.id);
  return new Map(
    rows.map((row) => [
      row.id,
      {
        cash_in: numberOf(row.cash_in),
        cash_out: numberOf(row.cash_out),
        net: {
          cash: numberOf(row.cash),
          upi: numberOf(row.upi),
          card: numberOf(row.card),
          credit: numberOf(row.credit),
        },
        entry_count: row.entry_count,
      },
    ]),
  );
}

/** B27: records one thing that happened to a day. */
export async function insertDayCloseEvent(
  database: PostgresDatabaseHandle,
  options: DayCloseEventInsert,
): Promise<void> {
  await database.insert(day_close_events).values({
    public_id: generatePublicId('dayCloseEvent'),
    organization_id: options.organizationId,
    day_close_id: options.dayCloseId,
    kind: options.kind,
    text: options.text,
    membership_id: options.membershipId,
    created_by_user_id: options.userId,
  });
}

/**
 * Persistence for `app.day_closes` and `app.day_close_events` (launch ROUTE #136, routes-final
 * 8.E) — the shared app record reads and writes, plus the day's live money, the close's lock and
 * what happened.
 *
 * @remarks
 * - **Algorithm:** sorts `close_date` (newest first) and `created_at`. A day's payments are its
 *   branch's live payments whose organization date of `paid_at` is the day (B6) — one grouped read
 *   per page. Closing reads the day close `FOR UPDATE`, so a payment write (which reads it
 *   `FOR SHARE`) and a close never interleave.
 */
export class DayClosesRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: day_closes,
      entity: 'dayClose',
      searchColumns: [],
      sortColumns: { created_at: 'created_at', close_date: 'text' },
      defaultSort: 'close_date',
      defaultOrder: 'desc',
    });
  }

  /** B6: takes a day close `FOR UPDATE` — payment writes on that day wait for the close. */
  async lockForClose(id: number): Promise<void> {
    await getRequestDatabase()
      .select({ id: day_closes.id })
      .from(day_closes)
      .where(eq(day_closes.id, id))
      .for('update');
  }

  /** B25: the counted cash of a branch's last closed day before `date` — the carried opening. */
  async findLastCountedCash(options: { branchId: number; before: string }): Promise<number | null> {
    return selectLastCountedCash(getRequestDatabase(), options);
  }

  /** The live money of each day close on a page (B25, B27). */
  async findFigures(
    dayCloseIds: readonly number[],
    organizationId: number,
  ): Promise<Map<number, DayCloseFigures>> {
    return selectDayCloseFigures(getRequestDatabase(), { dayCloseIds, organizationId });
  }

  /** Each day's entries by who recorded them — the member's live membership, newest first by amount. */
  async findMemberTotals(
    dayCloseIds: readonly number[],
    organizationId: number,
  ): Promise<Map<number, DayCloseMemberTotal[]>> {
    if (dayCloseIds.length === 0) return new Map();
    const membership = sql<
      string | null
    >`(select ${memberships.public_id} from ${memberships} where ${memberships.organization_id} = ${organizationId} and ${memberships.user_id} = ${payments.created_by_user_id} order by ${memberships.deleted_at} desc nulls first limit 1)`;
    const rows = await getRequestDatabase()
      .select({
        id: day_closes.id,
        membership_id: membership,
        count: sql<number>`count(*)::int`,
        amount: sql<string>`sum(case when ${payments.direction} = ${PAYMENT_DIRECTION.RECEIVED} then ${payments.amount} else -${payments.amount} end)`,
      })
      .from(day_closes)
      .innerJoin(
        payments,
        and(
          eq(payments.branch_id, day_closes.branch_id),
          isNull(payments.deleted_at),
          sql`${paymentDay(organizationId)} = ${day_closes.close_date}`,
        ),
      )
      .where(inArray(day_closes.id, [...dayCloseIds]))
      .groupBy(day_closes.id, payments.created_by_user_id)
      .orderBy(asc(day_closes.id), desc(sql`count(*)`));
    const totals = new Map<number, DayCloseMemberTotal[]>();
    for (const row of rows) {
      totals.set(row.id, [
        ...(totals.get(row.id) ?? []),
        { membership_id: row.membership_id, count: row.count, amount: numberOf(row.amount) },
      ]);
    }
    return totals;
  }

  /** B27: records one thing that happened to a day. */
  async insertEvent(options: DayCloseEventInsert): Promise<void> {
    await insertDayCloseEvent(getRequestDatabase(), options);
  }

  /** What happened to each day on a page, oldest first (B27). */
  async findEvents(dayCloseIds: readonly number[]): Promise<Map<number, DayCloseEventRow[]>> {
    if (dayCloseIds.length === 0) return new Map();
    const rows = await getRequestDatabase()
      .select({
        day_close_id: day_close_events.day_close_id,
        id: day_close_events.public_id,
        kind: day_close_events.kind,
        text: day_close_events.text,
        membership_id: memberships.public_id,
        occurred_at: day_close_events.occurred_at,
      })
      .from(day_close_events)
      .leftJoin(memberships, eq(memberships.id, day_close_events.membership_id))
      .where(inArray(day_close_events.day_close_id, [...dayCloseIds]))
      .orderBy(asc(day_close_events.occurred_at), asc(day_close_events.id));
    const events = new Map<number, DayCloseEventRow[]>();
    for (const row of rows) {
      events.set(row.day_close_id, [...(events.get(row.day_close_id) ?? []), row]);
    }
    return events;
  }
}

import { and, eq, sql } from 'drizzle-orm';
import { assertWorkerDatabaseContext } from '@/infrastructure/database/contexts/database-context-runtime.js';
import type { WorkerDatabaseHandle } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { payments } from '@/domains/app/sub-domains/billing/payments/payments.schema.js';
import {
  DAY_CLOSE_BACKDATE_DAYS_MAX,
  DAY_CLOSE_EVENT_KIND,
  DAY_CLOSE_KIND,
  DAY_CLOSE_OPENING_SOURCE,
  DAY_CLOSE_STATUS,
} from './day-closes.constants.js';
import { day_closes } from './day-closes.schema.js';
import {
  type DayCloseFigures,
  EMPTY_DAY_CLOSE_FIGURES,
  insertDayCloseEvent,
  selectDayCloseFigures,
  selectLastCountedCash,
} from './day-closes.repository.js';
import {
  DAY_CLOSE_AUTO_CLOSE_AFTER_DAYS,
  DAY_CLOSE_AUTO_CLOSE_DAYS_PER_JOB,
  DAY_CLOSE_AUTO_CLOSE_SWEEP_BATCH,
} from './workers/day-close-auto-close.constants.js';

/** A branch-day the worker closes: its open day close, or none yet (money moved, nobody opened it). */
export interface DayToAutoClose {
  dayCloseId: number | null;
  branchId: number;
  closeDate: string;
}

/** An organization's local date of `paid_at` (its time zone) — the day a payment belongs to (B6). */
const PAYMENT_LOCAL_DAY = sql`(${payments.paid_at} at time zone ${organizations.timezone})::date`;

/** The last day that closes itself: the organization's today less two days (B26). */
const LAST_DUE_DAY = sql`(now() at time zone ${organizations.timezone})::date - ${DAY_CLOSE_AUTO_CLOSE_AFTER_DAYS}::int`;

/** How far back unopened money is looked for — as far as a day can be opened (8.E.8 #29). */
const LOOKBACK = sql`now() - make_interval(days => ${DAY_CLOSE_BACKDATE_DAYS_MAX + 1})`;

/** Live payments of an organization on a day with no day close row at all. */
const UNOPENED_PAYMENT_DAYS = sql`${payments.organization_id} = ${organizations.id}
  and ${payments.deleted_at} is null
  and ${payments.paid_at} >= ${LOOKBACK}
  and ${PAYMENT_LOCAL_DAY} <= ${LAST_DUE_DAY}
  and not exists (select 1 from ${day_closes} where ${day_closes.branch_id} = ${payments.branch_id} and ${day_closes.close_date} = ${PAYMENT_LOCAL_DAY})`;

/**
 * The sweep's read (WC-39, B26): the organizations with a past day to close — an open day close
 * up to two days before their today, or live money on such a day nobody opened — oldest first,
 * one batch.
 *
 * @remarks
 * - **Algorithm:** one read of `tenancy.organizations` with two `exists` probes, under the
 *   global retention cleanup context (the `app.payments` and `app.day_closes` policies' read arm).
 * - **Failure modes:** `WorkerDatabaseContextError` outside that context.
 */
export async function findOrganizationsWithDaysToClose(
  databaseHandle: WorkerDatabaseHandle,
): Promise<string[]> {
  assertWorkerDatabaseContext(['global_retention_cleanup']);
  const rows = await databaseHandle
    .select({ id: organizations.public_id })
    .from(organizations)
    .where(
      sql`exists (select 1 from ${day_closes} where ${day_closes.organization_id} = ${organizations.id} and ${day_closes.status} = ${DAY_CLOSE_STATUS.OPEN} and ${day_closes.close_date} <= ${LAST_DUE_DAY})
        or exists (select 1 from ${payments} where ${UNOPENED_PAYMENT_DAYS})`,
    )
    .orderBy(organizations.id)
    .limit(DAY_CLOSE_AUTO_CLOSE_SWEEP_BATCH);
  return rows.map((row) => row.id);
}

/**
 * The auto-close job's reads and writes (WC-39, B26) on an explicit handle pinned to one
 * organization's context.
 *
 * @remarks
 * - **Algorithm:** the due days are the organization's open day closes up to two days before its
 *   today and the unopened days its live money fell on, in branch and date order (so a carried
 *   opening follows the close before it). Closing one locks it `FOR UPDATE` (B6), sums its live
 *   payments' cash and stores the count as expected (`close_kind = auto`).
 */
export class DayCloseAutoCloseRepository {
  constructor(private readonly databaseHandle: WorkerDatabaseHandle) {}

  /** The organization's internal id. */
  async findOrganizationId(organizationPublicId: string): Promise<number | null> {
    const rows = await this.databaseHandle
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.public_id, organizationPublicId))
      .limit(1);
    return rows[0]?.id ?? null;
  }

  /** The organization's days to close, in branch and date order (one job's worth). */
  async findDueDays(organizationId: number): Promise<DayToAutoClose[]> {
    const rows = (await this.databaseHandle.execute(sql`
      select ${day_closes.id} as day_close_id, ${day_closes.branch_id} as branch_id, ${day_closes.close_date}::text as close_date
        from ${day_closes} join ${organizations} on ${organizations.id} = ${day_closes.organization_id}
        where ${day_closes.organization_id} = ${organizationId}
          and ${day_closes.status} = ${DAY_CLOSE_STATUS.OPEN}
          and ${day_closes.close_date} <= ${LAST_DUE_DAY}
      union
      select distinct null::bigint, ${payments.branch_id}, ${PAYMENT_LOCAL_DAY}::text
        from ${payments} join ${organizations} on ${organizations.id} = ${payments.organization_id}
        where ${payments.organization_id} = ${organizationId} and ${UNOPENED_PAYMENT_DAYS}
      order by 2, 3
      limit ${DAY_CLOSE_AUTO_CLOSE_DAYS_PER_JOB}
    `)) as unknown as { day_close_id: string | null; branch_id: string; close_date: string }[];
    return rows.map((row) => ({
      dayCloseId: row.day_close_id === null ? null : Number(row.day_close_id),
      branchId: Number(row.branch_id),
      closeDate: row.close_date,
    }));
  }

  /**
   * Opens a day nobody opened, with the branch's last counted cash (`carried`, B25) — null when
   * someone opened it meanwhile (the next run sees it).
   */
  async openUnopenedDay(options: {
    organizationId: number;
    branchId: number;
    closeDate: string;
  }): Promise<number | null> {
    const carried =
      (await selectLastCountedCash(this.databaseHandle, {
        branchId: options.branchId,
        before: options.closeDate,
      })) ?? 0;
    const rows = await this.databaseHandle
      .insert(day_closes)
      .values({
        public_id: generatePublicId('dayClose'),
        organization_id: options.organizationId,
        branch_id: options.branchId,
        close_date: options.closeDate,
        status: DAY_CLOSE_STATUS.OPEN,
        opening_cash: String(carried),
        opening_source: DAY_CLOSE_OPENING_SOURCE.CARRIED,
      })
      .onConflictDoNothing()
      .returning({ id: day_closes.id });
    return rows[0]?.id ?? null;
  }

  /**
   * B26: closes an open day with the count taken as expected; false when it is no longer open.
   * Takes it `FOR UPDATE` first, so a payment write on that day waits (B6).
   */
  async closeAsExpected(options: { organizationId: number; dayCloseId: number }): Promise<boolean> {
    const locked = await this.databaseHandle
      .select({ opening: day_closes.opening_cash, status: day_closes.status })
      .from(day_closes)
      .where(eq(day_closes.id, options.dayCloseId))
      .for('update');
    if (locked[0]?.status !== DAY_CLOSE_STATUS.OPEN) return false;
    const figures: DayCloseFigures =
      (
        await selectDayCloseFigures(this.databaseHandle, {
          dayCloseIds: [options.dayCloseId],
          organizationId: options.organizationId,
        })
      ).get(options.dayCloseId) ?? EMPTY_DAY_CLOSE_FIGURES;
    const opening = Math.round(Number(locked[0].opening) * 100);
    const expected =
      (opening + Math.round(figures.cash_in * 100) - Math.round(figures.cash_out * 100)) / 100;
    await this.databaseHandle
      .update(day_closes)
      .set({
        status: DAY_CLOSE_STATUS.CLOSED,
        expected_cash: String(expected),
        counted_cash: String(expected),
        difference_reason: null,
        close_kind: DAY_CLOSE_KIND.AUTO,
        closed_at: sql`now()`,
        updated_at: sql`greatest(${day_closes.created_at}, now())`,
      } as never)
      .where(
        and(eq(day_closes.id, options.dayCloseId), eq(day_closes.status, DAY_CLOSE_STATUS.OPEN)),
      );
    await insertDayCloseEvent(this.databaseHandle, {
      organizationId: options.organizationId,
      dayCloseId: options.dayCloseId,
      kind: DAY_CLOSE_EVENT_KIND.AUTO_CLOSED,
      text: `Auto-closed: counted as expected ₹${expected.toFixed(2)}`,
      membershipId: null,
      userId: null,
    });
    return true;
  }
}

/** Worker-only factory — a handle pinned to one organization's context (WC-39). */
export function createWorkerDayCloseAutoCloseRepository(
  databaseHandle: WorkerDatabaseHandle,
): DayCloseAutoCloseRepository {
  assertWorkerDatabaseContext(['organization']);
  return new DayCloseAutoCloseRepository(databaseHandle);
}

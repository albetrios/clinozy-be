import { and, asc, eq, gte, isNull, sql } from 'drizzle-orm';
import { assertWorkerDatabaseContext } from '@/infrastructure/database/contexts/database-context-runtime.js';
import type { WorkerDatabaseHandle } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import { TENANCY_PERMISSIONS } from '@/domains/tenancy/tenancy.permissions.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { MEMBERSHIP_STATUS } from '@/domains/tenancy/sub-domains/membership/membership.constants.js';
import { membershipHoldsRole } from '@/domains/tenancy/sub-domains/membership/membership-additional-roles/membership-additional-roles.schema.js';
import { roles } from '@/domains/tenancy/sub-domains/member-roles/member-role.schema.js';
import { role_permissions } from '@/domains/tenancy/sub-domains/member-roles/member-role-permission/member-role-permission.schema.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { organization_settings } from '@/domains/tenancy/sub-domains/organization/organization-settings/organization-settings.schema.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { toAmount } from '@/shared/utils/validation/record-fields.util.js';
import { DAY_CLOSE_KIND, DAY_CLOSE_STATUS } from './day-closes.constants.js';
import {
  type DayCloseFigures,
  EMPTY_DAY_CLOSE_FIGURES,
  selectDayCloseFigures,
} from './day-closes.repository.js';
import { day_closes } from './day-closes.schema.js';

/** How long a closed day waits for its summary — older ones are not sent (D78). */
const DAY_CLOSE_SUMMARY_WINDOW_HOURS = 24;

/** How many closed days one delivery job summarises — the rest go with the next. */
const DAY_CLOSE_SUMMARIES_PER_JOB = 20;

/** A closed day whose summary goes to the admins (WC-10). */
export interface PendingDayCloseSummary {
  id: number;
  branchName: string;
  /** `12 Oct`. */
  closeDate: string;
  expectedCash: number;
  countedCash: number;
  /** Who closed it, or `null` for the midnight auto-close. */
  closedByName: string | null;
  figures: DayCloseFigures;
}

/**
 * The day-close summary's reads and writes (launch D78, WC-10) on a handle pinned to one
 * organization's context: the closed days of the last 24 hours not summarised yet, who gets the
 * summary, and its stamp.
 *
 * @remarks
 * - **Algorithm:** pending = `closed`, `summary_sent_at` null, closed within the window (the
 *   pending index); the figures are the day page's ({@link selectDayCloseFigures}); the recipients
 *   are the active members holding `organization:update` (Owner and Admin by default) with a
 *   phone, one per number. A reopen clears the stamp, so the next close sends again.
 * - **Failure modes:** database errors propagate to the delivery job.
 */
export class DayCloseSummaryRepository {
  constructor(private readonly databaseHandle: WorkerDatabaseHandle) {}

  /** The closed days waiting for their summary, oldest first, with their figures. */
  async findPending(organizationId: number): Promise<PendingDayCloseSummary[]> {
    const rows = await this.databaseHandle
      .select({
        id: day_closes.id,
        branchName: branches.name,
        closeDate: sql<string>`to_char(${day_closes.close_date}, 'DD Mon')`,
        expectedCash: day_closes.expected_cash,
        countedCash: day_closes.counted_cash,
        closeKind: day_closes.close_kind,
        closedByName: memberships.display_name,
      })
      .from(day_closes)
      .innerJoin(branches, eq(branches.id, day_closes.branch_id))
      .leftJoin(memberships, eq(memberships.id, day_closes.closed_by_membership_id))
      .where(
        and(
          eq(day_closes.organization_id, organizationId),
          eq(day_closes.status, DAY_CLOSE_STATUS.CLOSED),
          isNull(day_closes.summary_sent_at),
          gte(
            day_closes.closed_at,
            sql`now() - make_interval(hours => ${DAY_CLOSE_SUMMARY_WINDOW_HOURS})`,
          ),
        ),
      )
      .orderBy(asc(day_closes.closed_at), asc(day_closes.id))
      .limit(DAY_CLOSE_SUMMARIES_PER_JOB);
    if (rows.length === 0) return [];
    const figures = await selectDayCloseFigures(this.databaseHandle, {
      dayCloseIds: rows.map((row) => row.id),
      organizationId,
    });
    return rows.map((row) => ({
      id: row.id,
      branchName: row.branchName,
      closeDate: row.closeDate,
      expectedCash: toAmount(row.expectedCash) ?? 0,
      countedCash: toAmount(row.countedCash) ?? 0,
      closedByName: row.closeKind === DAY_CLOSE_KIND.AUTO ? null : (row.closedByName ?? null),
      figures: figures.get(row.id) ?? EMPTY_DAY_CLOSE_FIGURES,
    }));
  }

  /** The admins' WhatsApp numbers: active members holding `organization:update`, each once. */
  async findRecipientPhones(organizationId: number): Promise<string[]> {
    const rows = await this.databaseHandle
      .selectDistinct({ phone: memberships.phone })
      .from(memberships)
      .innerJoin(roles, membershipHoldsRole(roles.id))
      .innerJoin(role_permissions, eq(role_permissions.role_id, roles.id))
      .where(
        and(
          eq(memberships.organization_id, organizationId),
          eq(memberships.status, MEMBERSHIP_STATUS.ACTIVE),
          isNull(memberships.deleted_at),
          isNull(roles.deleted_at),
          eq(role_permissions.permission_code, TENANCY_PERMISSIONS.ORGANIZATION_UPDATE),
          sql`${memberships.phone} is not null and btrim(${memberships.phone}) <> ''`,
        ),
      );
    return rows.flatMap((row) => (row.phone ? [row.phone] : []));
  }

  /** The summary went (or had nobody to go to): stamped, while the day is still closed. */
  async markSent(dayCloseId: number): Promise<void> {
    await this.databaseHandle
      .update(day_closes)
      .set({ summary_sent_at: sql`now()` } as never)
      .where(and(eq(day_closes.id, dayCloseId), eq(day_closes.status, DAY_CLOSE_STATUS.CLOSED)));
  }
}

/** Worker-only factory — a handle pinned to one organization's context (D78). */
export function createWorkerDayCloseSummaryRepository(
  databaseHandle: WorkerDatabaseHandle,
): DayCloseSummaryRepository {
  assertWorkerDatabaseContext(['organization']);
  return new DayCloseSummaryRepository(databaseHandle);
}

/**
 * The organizations with a closed day waiting for its summary and their WhatsApp connected — the
 * messaging sweep's read (launch D78, WC-10), across organizations, in id order after `afterId`.
 *
 * @remarks
 * - **Failure modes:** a database error propagates to the sweep (BullMQ retries it).
 */
export async function findOrganizationsWithPendingDayCloseSummaries(
  databaseHandle: WorkerDatabaseHandle,
  options: { afterId: number; limit: number },
): Promise<{ id: number; publicId: string }[]> {
  assertWorkerDatabaseContext(['global_retention_cleanup']);
  return databaseHandle
    .selectDistinct({ id: organizations.id, publicId: organizations.public_id })
    .from(day_closes)
    .innerJoin(organizations, eq(organizations.id, day_closes.organization_id))
    .where(
      and(
        eq(day_closes.status, DAY_CLOSE_STATUS.CLOSED),
        isNull(day_closes.summary_sent_at),
        gte(
          day_closes.closed_at,
          sql`now() - make_interval(hours => ${DAY_CLOSE_SUMMARY_WINDOW_HOURS})`,
        ),
        sql`${day_closes.organization_id} > ${options.afterId}`,
        isNull(organizations.deleted_at),
        sql`exists (select 1 from ${organization_settings}
          where ${organization_settings.organization_id} = ${organizations.id}
            and ${organization_settings.whatsapp_phone_number_id} is not null)`,
      ),
    )
    .orderBy(asc(organizations.id))
    .limit(options.limit);
}

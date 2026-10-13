import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNull,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { DEFAULT_REPOSITORY_LIST_LIMIT } from '@/shared/constants/limits.constants.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { runInsertWithPublicIdentifierRetry } from '@/shared/utils/infrastructure/postgres-error.util.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { branch_members } from '@/domains/app/sub-domains/branches/branch-members/branch-members.schema.js';
import type { BranchCreateData, BranchUpdateData } from './branches.types.js';

/** A raw `app.branches` row. */
export type BranchRow = typeof branches.$inferSelect;

const defaultDoctor = alias(memberships, 'default_doctor_membership');
const defaultFrontDesk = alias(memberships, 'default_front_desk_membership');
const defaultTherapist = alias(memberships, 'default_therapist_membership');
const defaultPharmacist = alias(memberships, 'default_pharmacist_membership');

/** The rows of one organization (a branch is never deleted, D16). */
function inOrganization(organization_id: number): SQL {
  return eq(branches.organization_id, organization_id);
}

/** Main branch first, then by name. */
const BRANCH_ORDER = [desc(branches.is_main), asc(branches.name)] as const;

/** What `GET /app/branches/my` reads — a picker's, the booking rules' and a printed bill's header (D81). */
const branchSummaryColumns = {
  public_id: branches.public_id,
  name: branches.name,
  tone: branches.tone,
  is_main: branches.is_main,
  address_line_one: branches.address_line_one,
  address_line_two: branches.address_line_two,
  area: branches.area,
  city: branches.city,
  state: branches.state,
  postal_code: branches.postal_code,
  phone: branches.phone,
  gst_number: branches.gst_number,
  opens_at: branches.opens_at,
  closes_at: branches.closes_at,
  working_days: branches.working_days,
};

/**
 * Persistence for `app.branches`. Every query runs on the request's database handle, so RLS
 * scopes it to the active organization; the `organization_id` filters repeat that boundary in SQL.
 */
export class BranchesRepository {
  /** Branch rows with the default staff resolved to membership public ids (joins only). */
  private selectRecords() {
    return getRequestDatabase()
      .select({
        ...getTableColumns(branches),
        default_doctor_membership_public_id: defaultDoctor.public_id,
        default_front_desk_membership_public_id: defaultFrontDesk.public_id,
        default_therapist_membership_public_id: defaultTherapist.public_id,
        default_pharmacist_membership_public_id: defaultPharmacist.public_id,
      })
      .from(branches)
      .leftJoin(defaultDoctor, eq(defaultDoctor.id, branches.default_doctor_membership_id))
      .leftJoin(
        defaultFrontDesk,
        eq(defaultFrontDesk.id, branches.default_front_desk_membership_id),
      )
      .leftJoin(defaultTherapist, eq(defaultTherapist.id, branches.default_therapist_membership_id))
      .leftJoin(
        defaultPharmacist,
        eq(defaultPharmacist.id, branches.default_pharmacist_membership_id),
      );
  }

  /** Every live branch of the organization (inactive ones only when asked). */
  async listByOrganization(organization_id: number, options: { include_inactive: boolean }) {
    const conditions: SQL[] = [inOrganization(organization_id)];
    if (!options.include_inactive) conditions.push(eq(branches.is_active, true));
    return this.selectRecords()
      .where(and(...conditions))
      .orderBy(...BRANCH_ORDER)
      .limit(DEFAULT_REPOSITORY_LIST_LIMIT);
  }

  /** Every live, active branch of the organization, as summaries. */
  async listActiveSummaries(organization_id: number) {
    return getRequestDatabase()
      .select(branchSummaryColumns)
      .from(branches)
      .where(and(inOrganization(organization_id), eq(branches.is_active, true)))
      .orderBy(...BRANCH_ORDER)
      .limit(DEFAULT_REPOSITORY_LIST_LIMIT);
  }

  /** The live, active branches the user is given access to in the organization, as summaries. */
  async listActiveSummariesForUser(organization_id: number, user_id: number) {
    return getRequestDatabase()
      .select(branchSummaryColumns)
      .from(branches)
      .innerJoin(branch_members, eq(branch_members.branch_id, branches.id))
      .innerJoin(memberships, eq(memberships.id, branch_members.membership_id))
      .where(
        and(
          inOrganization(organization_id),
          eq(branches.is_active, true),
          eq(memberships.user_id, user_id),
          isNull(memberships.deleted_at),
        ),
      )
      .orderBy(...BRANCH_ORDER)
      .limit(DEFAULT_REPOSITORY_LIST_LIMIT);
  }

  /** One live branch of the organization, or null. */
  async findByPublicId(public_id: string, organization_id: number) {
    const rows = await this.selectRecords()
      .where(and(inOrganization(organization_id), eq(branches.public_id, public_id)))
      .limit(1);
    return rows[0] ?? null;
  }

  /** The live branches of the organization among `public_ids`, as `public_id → id`. */
  async findIdsByPublicIds(
    organization_id: number,
    public_ids: readonly string[],
  ): Promise<Map<string, number>> {
    if (public_ids.length === 0) return new Map();
    const rows = await getRequestDatabase()
      .select({ id: branches.id, public_id: branches.public_id })
      .from(branches)
      .where(and(inOrganization(organization_id), inArray(branches.public_id, [...public_ids])));
    return new Map(rows.map((row) => [row.public_id, row.id]));
  }

  /**
   * Whether the organization has a main branch — active or not, as the one-main index counts it
   * (feat-clinic-setup BR1: a clinic's first branch becomes main).
   */
  async hasMainBranch(organization_id: number): Promise<boolean> {
    const rows = await getRequestDatabase()
      .select({ id: branches.id })
      .from(branches)
      .where(and(inOrganization(organization_id), eq(branches.is_main, true)))
      .limit(1);
    return rows.length > 0;
  }

  /** The organization's active main branch's public id, or null (feat-clinic-setup: setup step 2 and going live). */
  async findActiveMainPublicId(organization_id: number): Promise<string | null> {
    const rows = await getRequestDatabase()
      .select({ public_id: branches.public_id })
      .from(branches)
      .where(
        and(
          inOrganization(organization_id),
          eq(branches.is_main, true),
          eq(branches.is_active, true),
        ),
      )
      .limit(1);
    return rows[0]?.public_id ?? null;
  }

  /** Inserts a branch; returns its internal and public ids. */
  async create(data: BranchCreateData): Promise<{ id: number; public_id: string }> {
    return runInsertWithPublicIdentifierRetry({
      insert: async () => {
        const rows = await getRequestDatabase()
          .insert(branches)
          .values({ ...data, public_id: generatePublicId('branch') })
          .returning({ id: branches.id, public_id: branches.public_id });
        return rows[0]!;
      },
    });
  }

  /** Updates a live branch; returns false when it no longer exists. */
  /**
   * Clears every default-staff field that names someone who no longer works at that branch (C15 /
   * D14) — after a branch's member list or a membership's branches change. `branch_id` limits it to
   * one branch, `membership_id` to the branches that name that member.
   */
  async clearDefaultStaffNotWorkingThere(options: {
    organization_id: number;
    branch_id?: number;
    membership_id?: number;
  }): Promise<void> {
    const columns = [
      branches.default_doctor_membership_id,
      branches.default_front_desk_membership_id,
      branches.default_therapist_membership_id,
      branches.default_pharmacist_membership_id,
    ] as const;
    const notWorkingThere = (column: (typeof columns)[number]) =>
      sql`${column} IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM ${branch_members}
        WHERE ${branch_members.branch_id} = ${branches.id}
          AND ${branch_members.membership_id} = ${column}
      )`;
    const clearedWhenGone = (column: (typeof columns)[number]) =>
      sql`CASE WHEN ${notWorkingThere(column)} THEN NULL ELSE ${column} END`;
    await getRequestDatabase()
      .update(branches)
      .set({
        default_doctor_membership_id: clearedWhenGone(branches.default_doctor_membership_id),
        default_front_desk_membership_id: clearedWhenGone(
          branches.default_front_desk_membership_id,
        ),
        default_therapist_membership_id: clearedWhenGone(branches.default_therapist_membership_id),
        default_pharmacist_membership_id: clearedWhenGone(
          branches.default_pharmacist_membership_id,
        ),
        updated_at: sql`greatest(${branches.created_at}, now())`,
      })
      .where(
        and(
          eq(branches.organization_id, options.organization_id),
          options.branch_id === undefined ? undefined : eq(branches.id, options.branch_id),
          options.membership_id === undefined
            ? undefined
            : or(...columns.map((column) => eq(column, options.membership_id!))),
          or(...columns.map((column) => notWorkingThere(column))),
        ),
      );
  }

  /**
   * Clears a member from every branch's default staff (C15) — the leave step when their membership
   * ends (launch K4). Touches only the branches that named them.
   */
  async clearDefaultStaffForMembership(options: {
    organization_id: number;
    membership_id: number;
  }): Promise<void> {
    const columns = [
      branches.default_doctor_membership_id,
      branches.default_front_desk_membership_id,
      branches.default_therapist_membership_id,
      branches.default_pharmacist_membership_id,
    ] as const;
    const clearedWhenNamed = (column: (typeof columns)[number]) =>
      sql`CASE WHEN ${column} = ${options.membership_id} THEN NULL ELSE ${column} END`;
    await getRequestDatabase()
      .update(branches)
      .set({
        default_doctor_membership_id: clearedWhenNamed(branches.default_doctor_membership_id),
        default_front_desk_membership_id: clearedWhenNamed(
          branches.default_front_desk_membership_id,
        ),
        default_therapist_membership_id: clearedWhenNamed(branches.default_therapist_membership_id),
        default_pharmacist_membership_id: clearedWhenNamed(
          branches.default_pharmacist_membership_id,
        ),
        updated_at: sql`greatest(${branches.created_at}, now())`,
      })
      .where(
        and(
          eq(branches.organization_id, options.organization_id),
          or(...columns.map((column) => eq(column, options.membership_id))),
        ),
      );
  }

  async update(
    id: number,
    data: BranchUpdateData,
    updated_by_user_id: number | undefined,
  ): Promise<boolean> {
    const rows = await getRequestDatabase()
      .update(branches)
      .set({
        ...data,
        updated_at: sql`greatest(${branches.created_at}, now())`,
        updated_by_user_id,
      })
      .where(eq(branches.id, id))
      .returning({ id: branches.id });
    return rows.length > 0;
  }
}

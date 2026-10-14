import { and, desc, eq, isNull } from 'drizzle-orm';
import {
  type RequestScopedPostgresDatabase,
  resolveRepositoryDatabaseHandle,
} from '@/infrastructure/database/contexts/database-context-runtime.js';
import { user_bug_reports } from '@/domains/user/sub-domains/user-bug-report/user-bug-report.schema.js';
import { users } from '@/domains/user/user.schema.js';
import type { UserBugReportInputMethod } from '@/domains/user/sub-domains/user-bug-report/user-bug-report.constants.js';
import type { UserBugReportRow } from '@/domains/user/sub-domains/user-bug-report/user-bug-report.types.js';

/** Row payload accepted by {@link UserBugReportRepository.create}. */
export type UserBugReportInsert = {
  public_id: string;
  user_id: number;
  reporter_name: string | null;
  reporter_email: string;
  organization_public_id: string | null;
  description: string;
  input_method: UserBugReportInputMethod;
  page_path: string | null;
  app_version: string | null;
  user_agent: string | null;
};

/** The account fields a report is stamped with (feat-bug-report BR4, BR5). */
export type UserBugReportReporter = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string;
};

/**
 * Drizzle data-access for `auth.user_bug_reports`.
 *
 * @remarks
 * - **Algorithm:** the reporter's own account row, an insert, and the data export's newest-first
 *   read, all by the owner; `auth.users` and this table's owner policies (`app.current_user_public_id`) bounds every statement to the
 *   person whose context is open.
 * - **Failure modes:** a statement outside the owner's context matches nothing (RLS); constraint
 *   violations propagate.
 * - **Side effects:** writes `auth.user_bug_reports` only.
 * - **Notes:** dual-mode handle — the request's context (HTTP) or an explicit handle; reports are
 *   append-only, so there is no update or delete.
 */
export class UserBugReportRepository {
  constructor(private readonly databaseHandle?: RequestScopedPostgresDatabase) {}

  private db(): RequestScopedPostgresDatabase {
    return resolveRepositoryDatabaseHandle(this.databaseHandle);
  }

  /**
   * The live account the session names — read under the person's own context, where the
   * `auth.users` owner policy returns exactly their row; `null` when it is gone or deleted.
   */
  async findReporterByPublicId(public_id: string): Promise<UserBugReportReporter | null> {
    const rows = await this.db()
      .select({
        id: users.id,
        first_name: users.first_name,
        last_name: users.last_name,
        email: users.email,
      })
      .from(users)
      .where(and(eq(users.public_id, public_id), isNull(users.deleted_at)))
      .limit(1);
    return rows[0] ?? null;
  }

  async create(row: UserBugReportInsert): Promise<UserBugReportRow> {
    const [created] = await this.db().insert(user_bug_reports).values(row).returning();
    return created!;
  }

  /** The person's reports, newest first, at most `limit` (the export fetches cap + 1). */
  async listForUserDataExport(user_id: number, limit: number): Promise<UserBugReportRow[]> {
    return this.db()
      .select()
      .from(user_bug_reports)
      .where(eq(user_bug_reports.user_id, user_id))
      .orderBy(desc(user_bug_reports.id))
      .limit(limit);
  }
}

import { NotFoundError } from '@/shared/errors/index.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import {
  type UserPrincipalDatabaseScope,
  withAppDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import type { UserBugReportRepository } from '@/domains/user/sub-domains/user-bug-report/user-bug-report.repository.js';
import { validateCreateUserBugReport } from '@/domains/user/sub-domains/user-bug-report/user-bug-report.validator.js';
import {
  buildReporterName,
  serializeUserBugReport,
} from '@/domains/user/sub-domains/user-bug-report/user-bug-report.serializer.js';
import type { UserBugReportOutput } from '@/domains/user/sub-domains/user-bug-report/user-bug-report.types.js';

/**
 * Files bug reports for the signed-in person (feat-bug-report-2026-10-13-dgnx).
 *
 * @remarks
 * - **Algorithm:** validate the body; then, in ONE user-scoped unit of work, read the person's
 *   own account row (the session's public id, under the `auth.users` owner policy), stamp their internal id, name and email onto
 *   the row (BR4, BR5) together with the workspace from the token's `org` claim and the request's
 *   `User-Agent`, and insert it.
 * - **Failure modes:** an invalid body → `ValidationError` (400); an account that no longer exists
 *   or is deleted → `NotFoundError` (404); database errors propagate.
 * - **Side effects:** one insert into `auth.user_bug_reports`; an info log with the report's
 *   public id (never its text). No audit row, event, notification or job (BR9).
 * - **Notes:** the reporter is never read from the body — the DTO is strict and refuses
 *   `user_id`, `name` and `email`, so nobody can file under someone else's name.
 */
export class UserBugReportService {
  constructor(private readonly bugReportRepository: UserBugReportRepository) {}

  /**
   * File one bug report for the person the scope names.
   *
   * @remarks
   * - **Algorithm:** see the class remarks; the account read and the insert share one pooled
   *   checkout.
   * - **Failure modes:** `ValidationError` for the body; `NotFoundError` for a missing or deleted
   *   account.
   * - **Side effects:** inserts one `auth.user_bug_reports` row.
   * - **Notes:** `userAgent` is already truncated by the caller (`getUserAgent`).
   */
  async create({
    scope,
    body,
    userAgent,
  }: {
    scope: UserPrincipalDatabaseScope;
    body: unknown;
    userAgent: string | null;
  }): Promise<UserBugReportOutput> {
    const input = validateCreateUserBugReport(body);
    const row = await withAppDatabaseContext({
      scope,
      callback: async () => {
        const account = await this.bugReportRepository.findReporterByPublicId(scope.userPublicId);
        if (!account) throw new NotFoundError('User');
        return this.bugReportRepository.create({
          public_id: generatePublicId('userBugReport'),
          user_id: account.id,
          reporter_name: buildReporterName({
            firstName: account.first_name,
            lastName: account.last_name,
          }),
          reporter_email: account.email,
          organization_public_id: scope.organizationPublicId ?? null,
          description: input.description,
          input_method: input.input_method,
          page_path: input.page_path ?? null,
          app_version: input.app_version ?? null,
          user_agent: userAgent,
        });
      },
    });
    logger.info(
      { userPublicId: scope.userPublicId, bugReportPublicId: row.public_id },
      'user-bug-report.created',
    );
    return serializeUserBugReport({ row, userPublicId: scope.userPublicId });
  }
}

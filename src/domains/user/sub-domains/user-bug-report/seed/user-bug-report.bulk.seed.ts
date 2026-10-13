/**
 * User-bug-report bulk seeder — inserts `auth.user_bug_reports` rows for a subset of registry
 * users so triage queries and the data export have realistic data. The reporter's name and email
 * are read from the user row, as the service stamps them from the session.
 *
 * Idempotency: count-and-resume — only users that have no seeded report receive one, so a re-run
 * with the same registry is a no-op.
 */
import { inArray } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { user_bug_reports } from '@/domains/user/sub-domains/user-bug-report/user-bug-report.schema.js';
import { buildReporterName } from '@/domains/user/sub-domains/user-bug-report/user-bug-report.serializer.js';
import { users as usersTable } from '@/domains/user/user.schema.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import type { SeedContext } from '@/scripts/seed/seed-contract.js';
import { generateBulkBugReport } from './user-bug-report.faker.js';

/** Seed a report for roughly one in every `REPORT_USER_RATIO` users. */
const REPORT_USER_RATIO = 5;

/**
 * Seeds one bug report for a deterministic subset of registry users.
 *
 * @remarks
 * Algorithm: read the reporters (id, name, email) of every fifth registry user, skip those that
 * already own a report, insert one generated report each. Side effects: inserts into
 * `auth.user_bug_reports`. Failure modes: warns and returns early when the user pool is empty;
 * otherwise propagates DB errors.
 */
export async function seedUserBugReportsBulk(context: SeedContext): Promise<void> {
  const candidates = context.registry.users.filter(
    (_user, index) => index % REPORT_USER_RATIO === 0,
  );
  if (candidates.length === 0) {
    context.logger.warn('seed.bulk.user-bug-report: empty user pool; run the user seeder first');
    return;
  }

  const database = getRequestDatabase();
  const candidateIds = candidates.map((user) => user.id);
  const existing = await database
    .select({ user_id: user_bug_reports.user_id })
    .from(user_bug_reports)
    .where(inArray(user_bug_reports.user_id, candidateIds));
  const seededUserIds = new Set(existing.map((row) => row.user_id));
  const reporters = await database
    .select({
      id: usersTable.id,
      first_name: usersTable.first_name,
      last_name: usersTable.last_name,
      email: usersTable.email,
    })
    .from(usersTable)
    .where(inArray(usersTable.id, candidateIds));

  let inserted = 0;
  for (const reporter of reporters) {
    if (seededUserIds.has(reporter.id)) continue;
    const profile = generateBulkBugReport(context.faker);
    await database
      .insert(user_bug_reports)
      .values({
        public_id: generatePublicId('userBugReport'),
        user_id: reporter.id,
        reporter_name: buildReporterName(reporter),
        reporter_email: reporter.email,
        description: profile.description,
        input_method: profile.input_method,
        page_path: profile.page_path,
        app_version: profile.app_version,
        created_at: profile.created_at,
      })
      .onConflictDoNothing();
    inserted += 1;
  }

  context.logger.info(
    { users: candidates.length, inserted },
    'seed.bulk.user-bug-report: reports seeded',
  );
}

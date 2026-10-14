/**
 * Faker generators for the user-bug-report bulk seeder. Callers pass the orchestrator's seeded
 * `faker` so output is reproducible for a given `SEED`.
 */
import type { Faker } from '@faker-js/faker';
import {
  USER_BUG_REPORT_INPUT_METHODS,
  type UserBugReportInputMethod,
} from '@/domains/user/sub-domains/user-bug-report/user-bug-report.constants.js';

/** Generated row content for `auth.user_bug_reports` (the reporter is stamped by the seeder). */
export interface BulkBugReportProfile {
  description: string;
  input_method: UserBugReportInputMethod;
  page_path: string;
  app_version: string;
  created_at: Date;
}

const SAMPLE_PROBLEMS = [
  'The invoice total does not update after I remove a line.',
  'The appointment I moved still shows at the old time until I refresh.',
  'The patient search finds nothing when the name has an accent.',
  'The prescription print cuts off the last medicine.',
  'The stock count screen freezes when I scan two items quickly.',
] as const;

const SAMPLE_PATHS = ['/today', '/patients', '/appointments', '/billing', '/stock'] as const;

/** Builds one realistic report: a known kind of problem, a path, a release and a recent time. */
export function generateBulkBugReport(faker: Faker): BulkBugReportProfile {
  return {
    description: `${faker.helpers.arrayElement(SAMPLE_PROBLEMS)} ${faker.lorem.sentence()}`,
    input_method: faker.helpers.arrayElement(USER_BUG_REPORT_INPUT_METHODS),
    page_path: faker.helpers.arrayElement(SAMPLE_PATHS),
    app_version: `1.${faker.number.int({ min: 10, max: 13 })}.${faker.number.int({ min: 0, max: 5 })}`,
    created_at: faker.date.recent({ days: 30 }),
  };
}

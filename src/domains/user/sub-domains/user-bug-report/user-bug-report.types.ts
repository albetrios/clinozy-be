import type { user_bug_reports } from './user-bug-report.schema.js';
import type { UserBugReportInputMethod } from './user-bug-report.constants.js';

/** A selected `auth.user_bug_reports` row. */
export type UserBugReportRow = typeof user_bug_reports.$inferSelect;

/**
 * API response shape for `POST /api/v1/users/me/bug-reports`. `reporter_email` and `user_agent`
 * are stored for triage and not echoed back.
 */
export interface UserBugReportOutput {
  /** The report's public id (`bug_…`). */
  id: string;
  description: string;
  input_method: UserBugReportInputMethod;
  page_path: string | null;
  app_version: string | null;
  /** The reporter's public user id, stamped from the session. */
  user_id: string;
  /** The reporter's name when the report was filed; `null` when the account had none yet. */
  reporter_name: string | null;
  /** The workspace the report was filed from (the token's `org` claim); `null` in none. */
  organization_id: string | null;
  /** ISO 8601. */
  created_at: string;
}

/** One report as it appears in the person's data export (feat-bug-report BR11). */
export interface UserBugReportExportEntry {
  description: string;
  input_method: UserBugReportInputMethod;
  page_path: string | null;
  app_version: string | null;
  created_at: string;
}

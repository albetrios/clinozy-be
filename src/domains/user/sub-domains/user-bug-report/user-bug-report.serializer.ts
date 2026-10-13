import type { UserBugReportInputMethod } from './user-bug-report.constants.js';
import type {
  UserBugReportExportEntry,
  UserBugReportOutput,
  UserBugReportRow,
} from './user-bug-report.types.js';

/**
 * Project an `auth.user_bug_reports` row into {@link UserBugReportOutput}. The reporter's public
 * id is supplied by the caller (the row keeps the internal foreign key); timestamps are ISO 8601.
 */
export function serializeUserBugReport({
  row,
  userPublicId,
}: {
  row: UserBugReportRow;
  userPublicId: string;
}): UserBugReportOutput {
  return {
    id: row.public_id,
    description: row.description,
    input_method: row.input_method as UserBugReportInputMethod,
    page_path: row.page_path,
    app_version: row.app_version,
    user_id: userPublicId,
    reporter_name: row.reporter_name,
    organization_id: row.organization_public_id,
    created_at: row.created_at.toISOString(),
  };
}

/** Project a row into the data export's `bug_reports` entry (feat-bug-report BR11). */
export function serializeUserBugReportForExport(row: UserBugReportRow): UserBugReportExportEntry {
  return {
    description: row.description,
    input_method: row.input_method as UserBugReportInputMethod,
    page_path: row.page_path,
    app_version: row.app_version,
    created_at: row.created_at.toISOString(),
  };
}

/**
 * The reporter's display name from their account: first and last name joined, `null` when both
 * are empty (feat-bug-report BR5) — the same rule the data export uses for `full_name`.
 */
export function buildReporterName({
  firstName,
  lastName,
}: {
  firstName: string | null;
  lastName: string | null;
}): string | null {
  const name = [firstName, lastName]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part.length > 0)
    .join(' ');
  return name.length > 0 ? name : null;
}

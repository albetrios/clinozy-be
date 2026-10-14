/**
 * How the person wrote the report (feat-bug-report BR6): `typed`, `voice` (dictated through the
 * browser's speech recognition, untouched) or `mixed` (dictated, then edited by hand).
 */
export const USER_BUG_REPORT_INPUT_METHODS = ['typed', 'voice', 'mixed'] as const;

/** One of {@link USER_BUG_REPORT_INPUT_METHODS}. */
export type UserBugReportInputMethod = (typeof USER_BUG_REPORT_INPUT_METHODS)[number];

/** Longest description accepted, in characters after trimming — the `chk_user_bug_reports_description` bound. */
export const USER_BUG_REPORT_DESCRIPTION_MAX_LENGTH = 5000;

/** Longest in-app path accepted — the `page_path` column width. */
export const USER_BUG_REPORT_PAGE_PATH_MAX_LENGTH = 2048;

/** Longest frontend release label accepted — the `app_version` column width. */
export const USER_BUG_REPORT_APP_VERSION_MAX_LENGTH = 64;

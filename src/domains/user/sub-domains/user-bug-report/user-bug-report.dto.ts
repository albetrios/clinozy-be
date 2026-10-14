import { z } from 'zod';
import { trimmedString } from '@/shared/utils/validation/validation.util.js';
import {
  USER_BUG_REPORT_APP_VERSION_MAX_LENGTH,
  USER_BUG_REPORT_DESCRIPTION_MAX_LENGTH,
  USER_BUG_REPORT_INPUT_METHODS,
  USER_BUG_REPORT_PAGE_PATH_MAX_LENGTH,
} from './user-bug-report.constants.js';

/**
 * Zod schema for the `POST /api/v1/users/me/bug-reports` body. Strict: the reporter's id, name and
 * email come from the session (feat-bug-report BR4), so a body carrying `user_id`, `name` or
 * `email` — or anything else — is a 400. `page_path` is the in-app path only (it must start with
 * `/`); the frontend leaves out the query and fragment.
 */
export const CreateUserBugReportDto = z
  .object({
    description: trimmedString().min(1).max(USER_BUG_REPORT_DESCRIPTION_MAX_LENGTH),
    input_method: z.enum(USER_BUG_REPORT_INPUT_METHODS),
    page_path: trimmedString()
      .min(1)
      .max(USER_BUG_REPORT_PAGE_PATH_MAX_LENGTH)
      .startsWith('/')
      .nullish(),
    app_version: trimmedString().min(1).max(USER_BUG_REPORT_APP_VERSION_MAX_LENGTH).nullish(),
  })
  .strict();

/** Inferred body type from {@link CreateUserBugReportDto}. */
export type CreateUserBugReportInput = z.infer<typeof CreateUserBugReportDto>;

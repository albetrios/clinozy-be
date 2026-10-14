import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { CreateUserBugReportDto, type CreateUserBugReportInput } from './user-bug-report.dto.js';

/**
 * Validate the `POST /api/v1/users/me/bug-reports` body against {@link CreateUserBugReportDto}.
 * Throws `ValidationError` (`errors:invalidInput`) with one field error per offending field — a
 * blank description, an unknown input method, a path that does not start with `/`, or an extra
 * field such as `user_id`.
 */
export function validateCreateUserBugReport(body: unknown): CreateUserBugReportInput {
  return parseWithSchema({ schema: CreateUserBugReportDto, data: body });
}

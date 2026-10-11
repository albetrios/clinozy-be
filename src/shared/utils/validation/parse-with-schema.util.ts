import type { ZodType, z } from 'zod';
import { ValidationError, type ValidationErrorItem } from '@/shared/errors/index.js';
import {
  type LocalizedMessages,
  renderZodIssueMessages,
} from '@/shared/utils/validation/zod-issue-messages.util.js';

/**
 * Default i18n key raised by {@link parseWithSchema} when a request payload
 * fails schema validation. Override per call for domain-specific copy
 * (for example `'errors:validation.invalidPagination'`).
 */
export const DEFAULT_INVALID_INPUT_ERROR_KEY = 'errors:invalidInput';

/**
 * Parse `data` with a Zod `schema`, returning the typed value on success or
 * throwing a {@link ValidationError} carrying flattened per-field errors on
 * failure.
 *
 * @remarks
 * Consolidates the `safeParse → throw ValidationError` block that was duplicated across every
 * domain `*.validator.ts`. The thrown error carries `messageKey` = `errorKey` and one `errors[]`
 * entry per top-level field (the grouping `z.flattenError` used), each message rendered in every
 * response language so the error handler can answer in the caller's (`renderZodIssueMessages`).
 * The parse reports the input so Zod's catalogs can name the received type; the input itself is
 * never kept on the error.
 */
export function parseWithSchema<T>({
  schema,
  data,
  errorKey = DEFAULT_INVALID_INPUT_ERROR_KEY,
}: {
  schema: ZodType<T>;
  data: unknown;
  errorKey?: string | undefined;
}): T {
  const result = schema.safeParse(data, { reportInput: true });
  if (!result.success) {
    throw new ValidationError(errorKey, undefined, undefined, toFieldErrors(result.error.issues));
  }
  return result.data;
}

/**
 * One `errors[]` entry per top-level field, its issues joined per language. A form-level issue (no
 * path) has no field to name and stays out, as it did with `z.flattenError`.
 */
function toFieldErrors(issues: readonly z.core.$ZodIssue[]): ValidationErrorItem[] {
  const messagesByField = new Map<string, LocalizedMessages[]>();
  for (const issue of issues) {
    if (issue.path.length === 0) continue;
    const field = String(issue.path[0]);
    messagesByField.set(field, [
      ...(messagesByField.get(field) ?? []),
      renderZodIssueMessages(issue),
    ]);
  }
  return [...messagesByField].map(([field, messages]) => {
    const localizedMessages = Object.fromEntries(
      Object.keys(messages[0]!).map((language) => [
        language,
        messages.map((message) => message[language as keyof LocalizedMessages]).join(', '),
      ]),
    ) as LocalizedMessages;
    return { field, message: localizedMessages.en, localizedMessages };
  });
}

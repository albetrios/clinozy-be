import { ValidationError } from '@/shared/errors/index.js';
import { PUBLIC_ID_REGEX } from '@/shared/utils/identity/public-id.util.js';

/** Asserts that `value` is a valid public id; throws a {@link ValidationError} naming `fieldName` on failure. */
export function validatePublicIdParam({
  value,
  fieldName,
}: {
  value: string;
  fieldName: string;
}): string {
  if (!PUBLIC_ID_REGEX.test(value)) {
    throw new ValidationError('errors:invalidInput', undefined, undefined, [
      { field: fieldName, messageKey: 'errors:validation.invalidPublicId' },
    ]);
  }
  return value;
}

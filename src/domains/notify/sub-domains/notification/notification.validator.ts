import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { listNotificationsQueryDto, type ListNotificationsQueryInput } from './notification.dto.js';

/**
 * Parses the `GET /notifications` query string with the strict {@link listNotificationsQueryDto}
 * (cursor pagination only); throws `ValidationError('errors:invalidInput')` on failure.
 */
export function validateListNotificationsQuery(query: unknown): ListNotificationsQueryInput {
  return parseWithSchema(listNotificationsQueryDto, query);
}

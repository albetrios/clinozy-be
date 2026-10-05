import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { listNotificationsQueryDto, type ListNotificationsQueryInput } from './notification.dto.js';

/**
 * Reject legacy `page`/`per_page` callers, then parse the `GET /notifications` query string with
 * {@link listNotificationsQueryDto}; throws `ValidationError('errors:invalidInput')` on failure.
 */
export function validateListNotificationsQuery(query: unknown): ListNotificationsQueryInput {
  return parseWithSchema(listNotificationsQueryDto, query);
}

import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { dataExportIdParamDto } from '@/domains/user/sub-domains/user-data-export/user-data-export.dto.js';

const ERROR_KEY_INVALID_INPUT = 'errors:invalidInput';

/**
 * Validate the `:data_export_id` path param for `GET /users/me/data-export/:data_export_id`.
 * Throws {@link ValidationError} (`errors:invalidInput`) with field-level issues when the id is
 * missing or longer than the public-id allowance.
 */
export function validateDataExportIdParam(data: unknown): { data_export_id: string } {
  return parseWithSchema(dataExportIdParamDto, data, ERROR_KEY_INVALID_INPUT);
}

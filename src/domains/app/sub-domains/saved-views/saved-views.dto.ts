import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';

/** Path params of the by-id `saved-views` routes. */
export const savedViewsIdParamsDto = z
  .object({
    saved_view_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new saved view. */
export const CreateSavedViewDto = z
  .object({
    list_key: trimmedStringMinMax(1, 40),
    label: trimmedStringMinMax(1, 60),
    filters: z.record(z.string(), z.unknown()).optional(),
    hidden_columns: z.array(trimmedStringMinMax(1, 60)).max(40).optional(),
  })
  .strict();

/** Body of `PATCH /app/saved-views/{saved_view_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateSavedViewDto = z
  .object({
    label: trimmedStringMinMax(1, 60).optional(),
    filters: z.record(z.string(), z.unknown()).optional(),
    hidden_columns: z.array(trimmedStringMinMax(1, 60)).max(40).optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `saved-views` list — keyset paging, `q` search, sort and filters. */
export const listSavedViewsQueryDto = listSearchSortSchema(['created_at', 'label'] as const)
  .extend({
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link CreateSavedViewDto}. */
export type CreateSavedViewInput = z.infer<typeof CreateSavedViewDto>;
/** Parsed {@link UpdateSavedViewDto}. */
export type UpdateSavedViewInput = z.infer<typeof UpdateSavedViewDto>;

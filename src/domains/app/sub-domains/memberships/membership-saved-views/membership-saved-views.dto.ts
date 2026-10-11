import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  expectedUpdatedAtSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import { MEMBERSHIP_SAVED_VIEW_HIDDEN_COLUMNS_MAX } from './membership-saved-views.constants.js';
import { MEMBERSHIP_SAVED_VIEW_LIST_KEYS } from './membership-saved-views.lists.js';

/** Path params of the by-id saved-view routes. */
export const membershipSavedViewIdParamsDto = z
  .object({
    membership_saved_view_id: recordIdSchema,
  })
  .strict();

/** A view's filters: an object of the list's query parameters (checked against the list in the service). */
const filtersSchema = z.record(z.string(), z.unknown());

/** The columns a view hides. */
const hiddenColumnsSchema = z
  .array(trimmedStringMinMax({ min: 1, max: 60 }))
  .max(MEMBERSHIP_SAVED_VIEW_HIDDEN_COLUMNS_MAX);

/** Body of `POST /app/memberships/me/saved-views` — a list's filters under a label (launch U5). */
export const createMembershipSavedViewDto = z
  .object({
    list_key: z.enum(MEMBERSHIP_SAVED_VIEW_LIST_KEYS),
    label: trimmedStringMinMax({ min: 1, max: 60 }),
    filters: filtersSchema,
    hidden_columns: hiddenColumnsSchema.optional(),
  })
  .strict();

/**
 * Body of `PATCH /app/memberships/me/saved-views/{membership_saved_view_id}` — rename it or change
 * its filters (`list_key` can't change); `expected_updated_at` refuses a stale save (D43).
 */
export const updateMembershipSavedViewDto = z
  .object({
    label: trimmedStringMinMax({ min: 1, max: 60 }).optional(),
    filters: filtersSchema.optional(),
    hidden_columns: hiddenColumnsSchema.optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/**
 * Query of `GET /app/memberships/me/saved-views` — one list's views (`list_key`), `q` on the label,
 * sort `created_at` (default, oldest first — the chips' order) or `label`.
 */
export const listMembershipSavedViewsQueryDto = listSearchSortSchema([
  'created_at',
  'label',
] as const)
  .extend({
    list_key: z.enum(MEMBERSHIP_SAVED_VIEW_LIST_KEYS).optional(),
  })
  .strict();

/** Parsed {@link createMembershipSavedViewDto}. */
export type CreateMembershipSavedViewInput = z.infer<typeof createMembershipSavedViewDto>;
/** Parsed {@link updateMembershipSavedViewDto}. */
export type UpdateMembershipSavedViewInput = z.infer<typeof updateMembershipSavedViewDto>;

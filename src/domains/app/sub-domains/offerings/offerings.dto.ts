import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedString, trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  chipToneSchema,
  expectedUpdatedAtSchema,
  moneySchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import { OFFERING_CATEGORY_VALUES, OFFERING_SPECIALTY_VALUES } from './offerings.constants.js';

/** True when every entry of a list is different. */
const distinct = (values: readonly unknown[]) => new Set(values).size === values.length;

/** Path params of the by-id `offerings` routes. */
export const offeringsIdParamsDto = z
  .object({
    offering_id: recordIdSchema,
  })
  .strict();

/**
 * Body of `POST /app/offerings` — a new offering (routes-final 3.B.8 #9): `min_price` ≤ `offer_price`
 * ≤ `price` is checked by the service (O4); `branch_ids` empty or absent = every branch (O5).
 */
export const CreateOfferingDto = z
  .object({
    name: trimmedStringMinMax({ min: 1, max: 120 }),
    category: z.enum(OFFERING_CATEGORY_VALUES).optional(),
    specialty: z.enum(OFFERING_SPECIALTY_VALUES).optional(),
    tone: chipToneSchema.optional(),
    price: moneySchema,
    min_price: moneySchema.optional(),
    duration_minutes: z.number().int().min(5).max(480).optional(),
    sessions: z.number().int().min(1).max(99).optional(),
    validity_days: z.number().int().min(0).max(1095).optional(),
    gst_percent: z
      .union([z.literal(0), z.literal(5), z.literal(12), z.literal(18), z.literal(28)])
      .optional(),
    is_active: z.boolean().optional(),
    offering_group_id: recordIdSchema.nullable().optional(),
    offer_price: moneySchema.nullable().optional(),
    branch_ids: z
      .array(recordIdSchema)
      .max(20)
      .refine(distinct, { message: 'errors:validation.eachIdOnce' })
      .optional(),
    is_gst_inclusive: z.boolean().optional(),
    search_terms: z
      .array(trimmedStringMinMax({ min: 1, max: 60 }))
      .max(20)
      .optional(),
    description: trimmedString().max(1000).nullable().optional(),
  })
  .strict();

/**
 * Body of `PATCH /app/offerings/{offering_id}` — any field (null clears an optional one; `branch_ids`
 * replaces the set, `[]` = every branch); `expected_updated_at` refuses a stale save (D43).
 */
export const UpdateOfferingDto = z
  .object({
    name: trimmedStringMinMax({ min: 1, max: 120 }).optional(),
    category: z.enum(OFFERING_CATEGORY_VALUES).optional(),
    specialty: z.enum(OFFERING_SPECIALTY_VALUES).optional(),
    tone: chipToneSchema.optional(),
    price: moneySchema.optional(),
    min_price: moneySchema.optional(),
    duration_minutes: z.number().int().min(5).max(480).optional(),
    sessions: z.number().int().min(1).max(99).optional(),
    validity_days: z.number().int().min(0).max(1095).optional(),
    gst_percent: z
      .union([z.literal(0), z.literal(5), z.literal(12), z.literal(18), z.literal(28)])
      .optional(),
    is_active: z.boolean().optional(),
    offering_group_id: recordIdSchema.nullable().optional(),
    offer_price: moneySchema.nullable().optional(),
    branch_ids: z
      .array(recordIdSchema)
      .max(20)
      .refine(distinct, { message: 'errors:validation.eachIdOnce' })
      .optional(),
    is_gst_inclusive: z.boolean().optional(),
    search_terms: z
      .array(trimmedStringMinMax({ min: 1, max: 60 }))
      .max(20)
      .optional(),
    description: trimmedString().max(1000).nullable().optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'errors:validation.sendAtLeastOneField',
  });

/**
 * Query of the `offerings` list and export — keyset paging, `q` (name, number such as `274` /
 * `#274`, search terms — O9), sort `created_at` (default, newest first) | `name`, and filters;
 * `branch_id` keeps the offerings offered there, every-branch ones included (O5). The saved-view
 * registry checks a view's `filters` against it (`membership-saved-views.lists.ts`).
 */
export const listOfferingsQueryDto = listSearchSortSchema(['created_at', 'name'] as const)
  .extend({
    category: z.enum(OFFERING_CATEGORY_VALUES).optional(),
    specialty: z.enum(OFFERING_SPECIALTY_VALUES).optional(),
    is_active: z.enum(['true', 'false']).optional(),
    offering_group_id: recordIdSchema.optional(),
    branch_id: recordIdSchema.optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link CreateOfferingDto}. */
export type CreateOfferingInput = z.infer<typeof CreateOfferingDto>;
/** Parsed {@link UpdateOfferingDto}. */
export type UpdateOfferingInput = z.infer<typeof UpdateOfferingDto>;

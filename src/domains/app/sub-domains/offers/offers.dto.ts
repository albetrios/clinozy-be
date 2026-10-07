import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedString, trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  calendarDateSchema,
  chipToneSchema,
  expectedUpdatedAtSchema,
  moneySchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import { OFFER_KIND_VALUES } from './offers.constants.js';

/** True when every entry of a list is different. */
const distinct = (values: readonly unknown[]) => new Set(values).size === values.length;

/** Path params of the by-id `offers` routes. */
export const offersIdParamsDto = z
  .object({
    offer_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new offer. */
export const CreateOfferDto = z
  .object({
    name: trimmedStringMinMax(1, 80),
    code: trimmedStringMinMax(1, 16).nullable().optional(),
    kind: z.enum(OFFER_KIND_VALUES).optional(),
    value: moneySchema,
    offering_ids: z
      .array(recordIdSchema)
      .min(1)
      .max(50)
      .refine(distinct, { message: 'Each id once' }),
    branch_ids: z
      .array(recordIdSchema)
      .max(20)
      .refine(distinct, { message: 'Each id once' })
      .optional(),
    starts_on: calendarDateSchema.nullable().optional(),
    ends_on: calendarDateSchema.nullable().optional(),
    is_paused: z.boolean().optional(),
    tone: chipToneSchema.optional(),
    note: trimmedString().max(280).nullable().optional(),
  })
  .strict();

/** Body of `PATCH /app/offers/{offer_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateOfferDto = z
  .object({
    name: trimmedStringMinMax(1, 80).optional(),
    code: trimmedStringMinMax(1, 16).nullable().optional(),
    kind: z.enum(OFFER_KIND_VALUES).optional(),
    value: moneySchema.optional(),
    offering_ids: z
      .array(recordIdSchema)
      .min(1)
      .max(50)
      .refine(distinct, { message: 'Each id once' })
      .optional(),
    branch_ids: z
      .array(recordIdSchema)
      .max(20)
      .refine(distinct, { message: 'Each id once' })
      .optional(),
    starts_on: calendarDateSchema.nullable().optional(),
    ends_on: calendarDateSchema.nullable().optional(),
    is_paused: z.boolean().optional(),
    tone: chipToneSchema.optional(),
    note: trimmedString().max(280).nullable().optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `offers` list — keyset paging, `q` search, sort and filters. */
export const listOffersQueryDto = listSearchSortSchema(['created_at', 'name', 'starts_on'] as const)
  .extend({
    kind: z.enum(OFFER_KIND_VALUES).optional(),
    starts_on_from: calendarDateSchema.optional(),
    starts_on_to: calendarDateSchema.optional(),
    is_paused: z.enum(['true', 'false']).optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link CreateOfferDto}. */
export type CreateOfferInput = z.infer<typeof CreateOfferDto>;
/** Parsed {@link UpdateOfferDto}. */
export type UpdateOfferInput = z.infer<typeof UpdateOfferDto>;

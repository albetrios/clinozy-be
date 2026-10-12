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
import {
  OFFER_BRANCH_IDS_MAX,
  OFFER_CODE_MAX_LENGTH,
  OFFER_KIND_VALUES,
  OFFER_OFFERING_IDS_MAX,
  OFFER_STATUS_VALUES,
} from './offers.constants.js';

/** True when every entry of a list is different. */
const distinct = (values: readonly unknown[]) => new Set(values).size === values.length;

/**
 * An offer code as sent: letters A–Z (any case) and digits, 1–16 — stored uppercase (O11). Its
 * OpenAPI description and example travel with it (the global field dictionary's `code` is the
 * TOTP code of the auth routes).
 */
const offerCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(OFFER_CODE_MAX_LENGTH)
  .regex(/^[A-Za-z0-9]+$/, 'errors:validation.offerCodeCharacters')
  .meta({
    description: `The offer's code — the code typed at the bill: letters A–Z (any case) and digits 0–9, up to ${OFFER_CODE_MAX_LENGTH}; stored and answered uppercase (\`diwali25\` → \`DIWALI25\`); unique among the live offers in any case (a 409 \`offer_code_in_use\`); null for none (a change clears it).`,
    example: 'DIWALI25',
  });

/** An offer's offerings: 1–50 ids, each once. */
const offeringIdsSchema = z
  .array(recordIdSchema)
  .min(1)
  .max(OFFER_OFFERING_IDS_MAX)
  .refine(distinct, { message: 'errors:validation.eachIdOnce' });

/** An offer's branches: up to 20 ids, each once; empty = every branch (O5). */
const branchIdsSchema = z
  .array(recordIdSchema)
  .max(OFFER_BRANCH_IDS_MAX)
  .refine(distinct, { message: 'errors:validation.eachIdOnce' });

/** Path params of the by-id `offers` routes. */
export const offersIdParamsDto = z
  .object({
    offer_id: recordIdSchema,
  })
  .strict();

/**
 * Body of `POST /app/offers` — a new offer (routes-final 3.C.8 #15): the value's range by kind and
 * `ends_on` ≥ `starts_on` are checked by the service (O11); `offering_ids` must be active offerings
 * (O12); `is_active` false = paused (O10).
 */
export const CreateOfferDto = z
  .object({
    name: trimmedStringMinMax({ min: 1, max: 80 }),
    code: offerCodeSchema.nullable().optional(),
    kind: z.enum(OFFER_KIND_VALUES).optional(),
    value: moneySchema,
    offering_ids: offeringIdsSchema,
    branch_ids: branchIdsSchema.optional(),
    starts_on: calendarDateSchema.nullable().optional(),
    ends_on: calendarDateSchema.nullable().optional(),
    is_active: z.boolean().optional(),
    tone: chipToneSchema.optional(),
    note: trimmedString().max(280).nullable().optional(),
  })
  .strict();

/**
 * Body of `PATCH /app/offers/{offer_id}` — any field of the create (null clears an optional one);
 * `is_active` pauses or resumes; `expected_updated_at` refuses a stale save (D43).
 */
export const UpdateOfferDto = z
  .object({
    name: trimmedStringMinMax({ min: 1, max: 80 }).optional(),
    code: offerCodeSchema.nullable().optional(),
    kind: z.enum(OFFER_KIND_VALUES).optional(),
    value: moneySchema.optional(),
    offering_ids: offeringIdsSchema.optional(),
    branch_ids: branchIdsSchema.optional(),
    starts_on: calendarDateSchema.nullable().optional(),
    ends_on: calendarDateSchema.nullable().optional(),
    is_active: z.boolean().optional(),
    tone: chipToneSchema.optional(),
    note: trimmedString().max(280).nullable().optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'errors:validation.sendAtLeastOneField',
  });

/**
 * Query of the `offers` list — keyset paging, `q` (name, code), sort `status` (default: Live →
 * Scheduled → Paused → Ended, newest first inside each — O10) | `created_at` | `name` |
 * `starts_on`, and filters: `status`, `kind`, `offering_id`, `branch_id` (every-branch offers
 * included, O5), the start-date range.
 */
export const listOffersQueryDto = listSearchSortSchema([
  'status',
  'created_at',
  'name',
  'starts_on',
] as const)
  .extend({
    status: z.enum(OFFER_STATUS_VALUES).optional(),
    kind: z.enum(OFFER_KIND_VALUES).optional(),
    offering_id: recordIdSchema.optional(),
    branch_id: recordIdSchema.optional(),
    starts_on_from: calendarDateSchema.optional(),
    starts_on_to: calendarDateSchema.optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link CreateOfferDto}. */
export type CreateOfferInput = z.infer<typeof CreateOfferDto>;
/** Parsed {@link UpdateOfferDto}. */
export type UpdateOfferInput = z.infer<typeof UpdateOfferDto>;

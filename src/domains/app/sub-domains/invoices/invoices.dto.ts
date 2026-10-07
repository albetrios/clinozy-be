import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  calendarDateSchema,
  expectedUpdatedAtSchema,
  moneySchema,
  recordIdListSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import { INVOICE_TYPE_VALUES } from './invoices.constants.js';

/** True when every entry of a list is different. */
const distinct = (values: readonly unknown[]) => new Set(values).size === values.length;

/** Path params of the by-id `invoices` routes. */
export const invoicesIdParamsDto = z
  .object({
    invoice_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new invoice. */
export const CreateInvoiceDto = z
  .object({
    type: z.enum(INVOICE_TYPE_VALUES).optional(),
    branch_id: recordIdSchema,
    patient_id: recordIdSchema.nullable().optional(),
    team_membership_ids: z
      .array(recordIdSchema)
      .max(10)
      .refine(distinct, { message: 'Each id once' })
      .optional(),
    items: z
      .array(
        z
          .object({
            offering_id: recordIdSchema.nullable().optional(),
            medicine_id: recordIdSchema.nullable().optional(),
            name: trimmedStringMinMax(1, 120),
            pack_size: trimmedStringMinMax(1, 30).nullable().optional(),
            quantity: z.number().int().min(1).max(999),
            rate: moneySchema,
            discount_percent: z.number().int().min(0).max(100).optional(),
            gst_percent: z
              .union([z.literal(0), z.literal(5), z.literal(12), z.literal(18), z.literal(28)])
              .optional(),
            batch_number: trimmedStringMinMax(1, 20).nullable().optional(),
          })
          .strict(),
      )
      .max(50)
      .optional(),
    overall_discount: moneySchema.optional(),
    invoice_date: calendarDateSchema,
    remark: trimmedStringMinMax(1, 500).nullable().optional(),
    prescription_id: recordIdSchema.nullable().optional(),
    medical_contact_id: recordIdSchema.nullable().optional(),
  })
  .strict();

/** Body of `PATCH /app/invoices/{invoice_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateInvoiceDto = z
  .object({
    type: z.enum(INVOICE_TYPE_VALUES).optional(),
    branch_id: recordIdSchema.optional(),
    patient_id: recordIdSchema.nullable().optional(),
    team_membership_ids: z
      .array(recordIdSchema)
      .max(10)
      .refine(distinct, { message: 'Each id once' })
      .optional(),
    items: z
      .array(
        z
          .object({
            offering_id: recordIdSchema.nullable().optional(),
            medicine_id: recordIdSchema.nullable().optional(),
            name: trimmedStringMinMax(1, 120),
            pack_size: trimmedStringMinMax(1, 30).nullable().optional(),
            quantity: z.number().int().min(1).max(999),
            rate: moneySchema,
            discount_percent: z.number().int().min(0).max(100).optional(),
            gst_percent: z
              .union([z.literal(0), z.literal(5), z.literal(12), z.literal(18), z.literal(28)])
              .optional(),
            batch_number: trimmedStringMinMax(1, 20).nullable().optional(),
          })
          .strict(),
      )
      .max(50)
      .optional(),
    overall_discount: moneySchema.optional(),
    invoice_date: calendarDateSchema.optional(),
    remark: trimmedStringMinMax(1, 500).nullable().optional(),
    prescription_id: recordIdSchema.nullable().optional(),
    medical_contact_id: recordIdSchema.nullable().optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `invoices` list — keyset paging, `q` search, sort and filters. */
export const listInvoicesQueryDto = listSearchSortSchema(['created_at', 'invoice_date'] as const)
  .extend({
    type: z.enum(INVOICE_TYPE_VALUES).optional(),
    branch_id: recordIdSchema.optional(),
    patient_id: recordIdSchema.optional(),
    invoice_date_from: calendarDateSchema.optional(),
    invoice_date_to: calendarDateSchema.optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
    branch_ids: recordIdListSchema.optional(),
  })
  .strict();

/** Parsed {@link CreateInvoiceDto}. */
export type CreateInvoiceInput = z.infer<typeof CreateInvoiceDto>;
/** Parsed {@link UpdateInvoiceDto}. */
export type UpdateInvoiceInput = z.infer<typeof UpdateInvoiceDto>;

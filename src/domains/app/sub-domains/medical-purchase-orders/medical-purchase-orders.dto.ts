import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  calendarDateSchema,
  expectedUpdatedAtSchema,
  moneySchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import { MEDICAL_PURCHASE_ORDER_STAGE_VALUES } from './medical-purchase-orders.constants.js';

/** Path params of the by-id `medical-purchase-orders` routes. */
export const medicalPurchaseOrdersIdParamsDto = z
  .object({
    medical_purchase_order_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new purchase order. */
export const CreateMedicalPurchaseOrderDto = z
  .object({
    supplier_id: recordIdSchema,
    supplier_bill_number: trimmedStringMinMax(1, 30).nullable().optional(),
    order_date: calendarDateSchema,
    items: z
      .array(
        z
          .object({
            medicine_id: recordIdSchema,
            quantity: z.number().int().min(1),
            free_quantity: z.number().int().min(0).optional(),
            rate: moneySchema,
            batch_number: trimmedStringMinMax(1, 20).nullable().optional(),
            expiry: z
              .string()
              .regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'Use MM/YY')
              .nullable()
              .optional(),
          })
          .strict(),
      )
      .max(50)
      .optional(),
  })
  .strict();

/** Body of `PATCH /app/medical-purchase-orders/{medical_purchase_order_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdateMedicalPurchaseOrderDto = z
  .object({
    supplier_id: recordIdSchema.optional(),
    supplier_bill_number: trimmedStringMinMax(1, 30).nullable().optional(),
    order_date: calendarDateSchema.optional(),
    items: z
      .array(
        z
          .object({
            medicine_id: recordIdSchema,
            quantity: z.number().int().min(1),
            free_quantity: z.number().int().min(0).optional(),
            rate: moneySchema,
            batch_number: trimmedStringMinMax(1, 20).nullable().optional(),
            expiry: z
              .string()
              .regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'Use MM/YY')
              .nullable()
              .optional(),
          })
          .strict(),
      )
      .max(50)
      .optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `medical-purchase-orders` list — keyset paging, `q` search, sort and filters. */
export const listMedicalPurchaseOrdersQueryDto = listSearchSortSchema([
  'created_at',
  'order_date',
] as const)
  .extend({
    supplier_id: recordIdSchema.optional(),
    order_date_from: calendarDateSchema.optional(),
    order_date_to: calendarDateSchema.optional(),
    stage: z.enum(MEDICAL_PURCHASE_ORDER_STAGE_VALUES).optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Body of `POST /app/medical-purchase-orders/{medical_purchase_order_id}/cancel`. */
export const cancelMedicalPurchaseOrderDto = z
  .object({
    cancel_reason: z.enum(['mistake', 'duplicate', 'not_needed', 'other']),
  })
  .strict();

/** Parsed {@link CreateMedicalPurchaseOrderDto}. */
export type CreateMedicalPurchaseOrderInput = z.infer<typeof CreateMedicalPurchaseOrderDto>;
/** Parsed {@link UpdateMedicalPurchaseOrderDto}. */
export type UpdateMedicalPurchaseOrderInput = z.infer<typeof UpdateMedicalPurchaseOrderDto>;

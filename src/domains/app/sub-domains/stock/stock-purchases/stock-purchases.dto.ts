import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  calendarDateSchema,
  expectedUpdatedAtSchema,
  instantSchema,
  moneySchema,
  recordIdSchema,
  valueListSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import { invoicePaymentSplitDto } from '@/domains/app/sub-domains/billing/invoices/invoices.dto.js';
import { PAYMENT_MONEY_MODE_VALUES } from '@/domains/app/sub-domains/billing/payments/payments.constants.js';
import { positiveStockQuantitySchema } from '@/domains/app/sub-domains/stock/stock-items/stock-items.dto.js';
import { STOCK_ITEM_UNIT_VALUES } from '@/domains/app/sub-domains/stock/stock-items/stock-items.constants.js';
import {
  STOCK_PURCHASE_ITEMS_MAX,
  STOCK_PURCHASE_PAYMENT_STATUS_VALUES,
} from './stock-purchases.constants.js';

/** True when every entry of a list is different. */
const distinct = (values: readonly unknown[]) => new Set(values).size === values.length;

/** Path params of the by-id stock purchase routes. */
export const stockPurchasesIdParamsDto = z
  .object({
    stock_purchase_id: recordIdSchema,
  })
  .strict();

/**
 * One line (S10): a listed item (`stock_item_id`) or one added as typed (`new_item` — "Not in the
 * list · add as typed"), how much arrived and its rate.
 */
const stockPurchaseItemDto = z
  .object({
    stock_item_id: recordIdSchema.optional(),
    new_item: z
      .object({
        name: trimmedStringMinMax({ min: 1, max: 120 }),
        unit: z.enum(STOCK_ITEM_UNIT_VALUES).optional(),
      })
      .strict()
      .optional(),
    quantity: positiveStockQuantitySchema,
    rate: moneySchema,
  })
  .strict()
  .refine((line) => (line.stock_item_id === undefined) !== (line.new_item === undefined), {
    message: 'A stock_item_id or a new_item',
  });

/**
 * The drawer's "Paid" (S11): a supplier-bill payment recorded with the purchase — the branch whose
 * money pays it, the splits, and optionally when and its reference.
 */
const stockPurchasePaymentDto = z
  .object({
    branch_id: recordIdSchema,
    splits: z
      .array(invoicePaymentSplitDto)
      .min(1)
      .max(PAYMENT_MONEY_MODE_VALUES.length)
      .refine((splits) => distinct(splits.map((split) => split.mode)), {
        message: 'Each mode once',
      }),
    paid_at: instantSchema.optional(),
    reference: trimmedStringMinMax({ min: 1, max: 60 }).optional(),
  })
  .strict();

/** The bill details a create and a change share (9.D.8 #18, #20). */
const stockPurchaseFields = {
  stock_vendor_id: recordIdSchema,
  bill_number: trimmedStringMinMax({ min: 1, max: 30 }).nullable(),
  purchase_date: calendarDateSchema,
  bill_amount: moneySchema,
};

/**
 * Body of `POST /app/stock-purchases` (9.D.8 #18): `stock_vendor_id*`, `items*` (1–50 —
 * `stock_item_id` or `new_item` {`name*`, `unit`}, `quantity*` more than 0, `rate*`); optional
 * `bill_number`, `purchase_date` (default today), `bill_amount` (default the lines' total),
 * `payment` (`branch_id*`, `splits*`; optional `paid_at`, `reference`).
 */
export const CreateStockPurchaseDto = z
  .object({
    stock_vendor_id: stockPurchaseFields.stock_vendor_id,
    items: z.array(stockPurchaseItemDto).min(1).max(STOCK_PURCHASE_ITEMS_MAX),
    bill_number: stockPurchaseFields.bill_number.optional(),
    purchase_date: stockPurchaseFields.purchase_date.optional(),
    bill_amount: stockPurchaseFields.bill_amount.optional(),
    payment: stockPurchasePaymentDto.optional(),
  })
  .strict();

/**
 * Body of `PATCH /app/stock-purchases/{stock_purchase_id}` (9.D.8 #20): the bill details —
 * `stock_vendor_id`, `bill_number` (null clears it), `purchase_date`, `bill_amount`;
 * `expected_updated_at` refuses a stale save (D43). `items` is taken only to refuse it — the lines
 * are fixed once saved (a 409).
 */
export const UpdateStockPurchaseDto = z
  .object({
    stock_vendor_id: stockPurchaseFields.stock_vendor_id.optional(),
    bill_number: stockPurchaseFields.bill_number.optional(),
    purchase_date: stockPurchaseFields.purchase_date.optional(),
    bill_amount: stockPurchaseFields.bill_amount.optional(),
    items: z.unknown().optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/**
 * Query of the Purchases tab and its export (9.D.8 #16, #17): `q` (bill number, `#16`, vendor
 * name), `stock_vendor_id`, `payment_status` (several), the purchase dates (inclusive), the created
 * range; sort `purchase_date` (default, newest first) | `stock_purchase_number` | `bill_amount` |
 * `due_amount` | `created_at`.
 */
export const listStockPurchasesQueryDto = listSearchSortSchema([
  'purchase_date',
  'stock_purchase_number',
  'bill_amount',
  'due_amount',
  'created_at',
] as const)
  .extend({
    stock_vendor_id: recordIdSchema.optional(),
    payment_status: valueListSchema(STOCK_PURCHASE_PAYMENT_STATUS_VALUES).optional(),
    purchase_date_from: calendarDateSchema.optional(),
    purchase_date_to: calendarDateSchema.optional(),
    created_from: instantSchema.optional(),
    created_to: instantSchema.optional(),
  })
  .strict();

/** Parsed {@link CreateStockPurchaseDto}. */
export type CreateStockPurchaseInput = z.infer<typeof CreateStockPurchaseDto>;
/** Parsed {@link UpdateStockPurchaseDto}. */
export type UpdateStockPurchaseInput = z.infer<typeof UpdateStockPurchaseDto>;
/** One parsed line of {@link CreateStockPurchaseDto}. */
export type StockPurchaseItemInput = CreateStockPurchaseInput['items'][number];
/** The parsed "Paid" of {@link CreateStockPurchaseDto}. */
export type StockPurchasePaymentInput = NonNullable<CreateStockPurchaseInput['payment']>;

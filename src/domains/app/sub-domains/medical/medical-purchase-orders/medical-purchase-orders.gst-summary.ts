import type {
  BaseRecordCollectionInput,
  BaseRecordExportOutput,
} from '@/domains/app/base-record.types.js';
import { organizationToday } from '@/domains/app/sub-domains/patients/patients.rules.js';
import { fieldValidationError } from '@/shared/errors/index.js';
import { toCsv } from '@/shared/utils/text/csv.util.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { instantInTimeZone, paiseOf } from '@/shared/utils/validation/record-fields.util.js';
import { medicalPurchaseGstSummaryQueryDto } from './medical-purchase-orders.dto.js';
import type {
  MedicalPurchaseGstGroupRow,
  MedicalPurchaseOrdersRepository,
} from './medical-purchase-orders.repository.js';

/** What one group of the summary came to (rupees). */
interface GstAmounts {
  line_count: number;
  taxable_amount: number;
  gst_amount: number;
  total_amount: number;
}

/** One GST rate's row of the summary. */
export interface MedicalPurchaseGstRateOutput extends GstAmounts {
  gst_percent: number;
}

/** One HSN code (at one rate) of the summary — `hsn_code` null for medicines without one. */
export interface MedicalPurchaseGstHsnOutput extends GstAmounts {
  hsn_code: string | null;
  gst_percent: number;
}

/**
 * The purchase GST summary of one month (PG9, PG11, PG12) — `GET /app/medical-purchase-orders/
 * gst-summary`.
 */
export interface MedicalPurchaseGstSummaryOutput {
  month: string;
  by_rate: MedicalPurchaseGstRateOutput[];
  by_hsn: MedicalPurchaseGstHsnOutput[];
  totals: GstAmounts & { order_count: number };
}

/** Adds groups together, in paise, as rupees. */
function sumGroups(groups: readonly MedicalPurchaseGstGroupRow[]): GstAmounts {
  const paise = (pick: (group: MedicalPurchaseGstGroupRow) => string) =>
    groups.reduce((total, group) => total + paiseOf(pick(group)), 0) / 100;
  return {
    line_count: groups.reduce((total, group) => total + group.line_count, 0),
    taxable_amount: paise((group) => group.taxable_amount),
    gst_amount: paise((group) => group.gst_amount),
    total_amount: paise((group) => group.total_amount),
  };
}

/** `2026-10` → `2026-11`. */
function nextMonth(month: string): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7));
  return index === 12 ? `${year + 1}-01` : `${year}-${String(index + 1).padStart(2, '0')}`;
}

/**
 * The purchase GST summary of a month (PG9, PG11–PG12): the received lines of the live orders
 * received in that month, in the organization's time zone — by GST rate, by HSN code and rate,
 * and in total.
 *
 * @remarks
 * - **Algorithm:** the month's bounds are its first midnight and the next month's, in the
 *   organization's time zone; the repository groups the received lines by rate and HSN code;
 *   `by_rate` folds the HSN codes (rates ascending), `by_hsn` keeps each code and rate (codes
 *   ascending, no code last, then rate); every sum is in whole paise.
 * - **Failure modes:** `ValidationError` on `month` — not `YYYY-MM`, or after the organization's
 *   current month.
 */
export async function purchaseGstSummary({
  repository,
  collection,
}: {
  repository: MedicalPurchaseOrdersRepository;
  collection: BaseRecordCollectionInput;
}): Promise<MedicalPurchaseGstSummaryOutput> {
  const { context } = collection;
  const { month } = parseWithSchema({
    schema: medicalPurchaseGstSummaryQueryDto,
    data: collection.input,
  });
  if (month > (await organizationToday(context)).slice(0, 7)) {
    throw fieldValidationError({
      field: 'month',
      messageKey: 'errors:validation.medicalPurchaseGstMonthInFuture',
    });
  }
  const { timezone } = await context.ports.organizationSettings(context.scope);
  const bound = (start: string) =>
    instantInTimeZone({ date: `${start}-01`, time: '00:00', timeZone: timezone });
  const { groups, orderCount } = await repository.findGstSummary({
    organizationId: context.organizationId,
    from: bound(month),
    to: bound(nextMonth(month)),
  });
  const rates = [...new Set(groups.map((group) => group.gst_percent))].sort((a, b) => a - b);
  const byHsn = [...groups].sort(
    (left, right) =>
      (left.hsn_code === null ? 1 : 0) - (right.hsn_code === null ? 1 : 0) ||
      (left.hsn_code ?? '').localeCompare(right.hsn_code ?? '') ||
      left.gst_percent - right.gst_percent,
  );
  return {
    month,
    by_rate: rates.map((rate) => ({
      gst_percent: rate,
      ...sumGroups(groups.filter((group) => group.gst_percent === rate)),
    })),
    by_hsn: byHsn.map((group) => ({
      hsn_code: group.hsn_code,
      gst_percent: group.gst_percent,
      ...sumGroups([group]),
    })),
    totals: { order_count: orderCount, ...sumGroups(groups) },
  };
}

/**
 * The purchase GST summary as a CSV (PG13): one row per group with its `section` — `by_rate`,
 * `by_hsn`, `total` — in the exports' envelope, `purchase-gst-summary-YYYY-MM.csv`.
 *
 * @remarks
 * - **Algorithm:** {@link purchaseGstSummary}, then one row per rate, per HSN code and rate, and
 *   the total; never truncated (a few rows).
 * - **Failure modes:** as {@link purchaseGstSummary}.
 */
export async function purchaseGstSummaryExport(options: {
  repository: MedicalPurchaseOrdersRepository;
  collection: BaseRecordCollectionInput;
}): Promise<BaseRecordExportOutput> {
  const summary = await purchaseGstSummary(options);
  const row = ({
    section,
    group,
  }: {
    section: string;
    group: GstAmounts & { gst_percent?: number; hsn_code?: string | null };
  }) => ({
    section,
    gst_percent: group.gst_percent ?? null,
    hsn_code: group.hsn_code ?? null,
    line_count: group.line_count,
    taxable_amount: group.taxable_amount.toFixed(2),
    gst_amount: group.gst_amount.toFixed(2),
    total_amount: group.total_amount.toFixed(2),
  });
  const rows = [
    ...summary.by_rate.map((group) => row({ section: 'by_rate', group })),
    ...summary.by_hsn.map((group) => row({ section: 'by_hsn', group })),
    row({ section: 'total', group: summary.totals }),
  ];
  return {
    file_name: `purchase-gst-summary-${summary.month}.csv`,
    content_type: 'text/csv',
    row_count: rows.length,
    is_truncated: false,
    content: toCsv(rows),
  };
}

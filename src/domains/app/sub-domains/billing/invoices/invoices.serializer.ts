import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordReferenceLookup } from '@/domains/app/base-record.types.js';
import { roundToPaise, toAmount } from '@/shared/utils/validation/record-fields.util.js';
import type { InvoiceLinePlan, PlannedInvoiceLine } from './invoices.lines.js';
import type { InvoiceItemReadRow } from './invoices.repository.js';
import type {
  BilledContactOutput,
  InvoiceItemOutput,
  InvoiceOutput,
  InvoicePreviewItemOutput,
  InvoicePreviewOutput,
} from './invoices.types.js';

/** The contact's public id a serializer left in `contact` (B3) — decorate fills the rest in. */
export function billedContactRef(contactPublicId: string | null): BilledContactOutput | null {
  return contactPublicId === null ? null : { id: contactPublicId, name: '', primary_phone: '' };
}

/** An amount column as a number (0 when absent). */
function money(value: unknown): number {
  return toAmount(value) ?? 0;
}

/** Shapes an `app.invoice_items` row as the API returns it (8.A.6); the treatments it bills are added after. */
export function serializeInvoiceItem({
  row,
  treatmentIds,
}: {
  row: InvoiceItemReadRow;
  treatmentIds: readonly string[];
}): InvoiceItemOutput {
  return {
    id: row.id,
    line_number: row.line_number,
    offering_id: row.offering_id,
    medicine_id: row.medicine_id,
    name: row.name,
    description: row.description,
    pack_size: row.pack_size,
    hsn_code: row.hsn_code,
    quantity: row.quantity,
    rate: money(row.rate),
    discount_percent: money(row.discount_percent),
    discount_amount: money(row.discount_amount),
    gst_percent: row.gst_percent,
    is_gst_inclusive: row.is_gst_inclusive,
    taxable_amount: money(row.taxable_amount),
    gst_amount: money(row.gst_amount),
    amount: money(row.amount),
    patient_offering_suggestion_id: row.patient_offering_suggestion_id,
    patient_offering_id: row.patient_offering_id,
    patient_treatment_ids: [...treatmentIds],
    batch_number: row.batch_number,
  };
}

/**
 * Shapes an `app.invoices` row as the API returns it (routes-final 8.A.6). The lines, the billed
 * contact, the patient file, `is_settled` and who billed it are the rules' `decorate` (one read
 * each per page) — empty here.
 */
export function serializeInvoice({
  row,
  references,
}: {
  row: BaseRecordRow;
  references: BaseRecordReferenceLookup;
}): InvoiceOutput {
  return {
    id: row.public_id,
    invoice_sequence: Number(row.invoice_sequence),
    invoice_number: row.invoice_number as string,
    financial_year: row.financial_year as string,
    type: row.type as string,
    branch_id: references.publicIdOf({ field: 'branch_id', row }) ?? '',
    contact: billedContactRef(references.publicIdOf({ field: 'contact_id', row })),
    patient_id: null,
    member_ids: references.listOf({ field: 'member_ids', row }),
    items: [],
    overall_discount: money(row.overall_discount),
    subtotal: money(row.subtotal),
    discount_total: money(row.discount_total),
    taxable_total: money(row.taxable_total),
    gst_total: money(row.gst_total),
    total: money(row.total),
    paid_amount: money(row.paid_amount),
    refunded_amount: money(row.refunded_amount),
    due_amount: money(row.due_amount),
    payment_status: row.payment_status as string,
    is_settled: false,
    invoice_date: row.invoice_date as string,
    remark: row.remark as string | null,
    patient_prescription_id: references.publicIdOf({ field: 'patient_prescription_id', row }),
    created_by_membership_id: null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

/** The public ids a preview's lines name, by internal id — one read per kind of id. */
export interface InvoicePreviewPublicIds {
  offerings: ReadonlyMap<number, string>;
  medicines: ReadonlyMap<number, string>;
  suggestions: ReadonlyMap<number, string>;
}

/** The public id of an internal id a line's values hold, or null. */
function publicIdOf({
  map,
  value,
}: {
  map: ReadonlyMap<number, string>;
  value: unknown;
}): string | null {
  return typeof value === 'number' ? (map.get(value) ?? null) : null;
}

/** Shapes one planned line as a preview returns it (D81) — the line the save would write. */
function serializeInvoicePreviewItem({
  line,
  ids,
}: {
  line: PlannedInvoiceLine;
  ids: InvoicePreviewPublicIds;
}): InvoicePreviewItemOutput {
  const { values, amounts } = line;
  return {
    id: line.existing?.public_id ?? null,
    line_number: Number(values.line_number),
    offering_id: publicIdOf({ map: ids.offerings, value: values.offering_id }),
    medicine_id: publicIdOf({ map: ids.medicines, value: values.medicine_id }),
    name: typeof values.name === 'string' ? values.name : '',
    description: (values.description as string | null | undefined) ?? null,
    pack_size: (values.pack_size as string | null | undefined) ?? null,
    hsn_code: (values.hsn_code as string | null | undefined) ?? null,
    quantity: Number(values.quantity),
    rate: money(values.rate),
    discount_percent: money(values.discount_percent),
    discount_amount: amounts.discountAmount,
    gst_percent: Number(values.gst_percent),
    is_gst_inclusive: values.is_gst_inclusive === true,
    taxable_amount: amounts.taxableAmount,
    gst_amount: amounts.gstAmount,
    amount: amounts.amount,
    sessions_total: line.sessionsTotal,
    offer_ids: [...line.offerIds],
    patient_offering_suggestion_id: publicIdOf({
      map: ids.suggestions,
      value: values.patient_offering_suggestion_id,
    }),
    batch_number: (values.batch_number as string | null | undefined) ?? null,
  };
}

/**
 * Shapes a save's plan as `POST /app/invoices/preview` and `…/{invoice_id}/preview` return it
 * (D81, Q2): the lines and the totals the save would write; `paid_amount` what is already paid,
 * `refunded_amount` what its credit notes refunded, and `due_amount` the rest.
 */
export function serializeInvoicePreview(options: {
  plan: InvoiceLinePlan;
  type: string;
  invoice_date: string;
  overall_discount: number;
  paid_amount: number;
  refunded_amount: number;
  public_ids: InvoicePreviewPublicIds;
}): InvoicePreviewOutput {
  const { totals } = options.plan;
  const total = totals.total ?? 0;
  return {
    type: options.type,
    invoice_date: options.invoice_date,
    items: options.plan.lines.map((line) =>
      serializeInvoicePreviewItem({ line, ids: options.public_ids }),
    ),
    overall_discount: options.overall_discount,
    subtotal: totals.subtotal ?? 0,
    discount_total: totals.discount_total ?? 0,
    taxable_total: totals.taxable_total ?? 0,
    gst_total: totals.gst_total ?? 0,
    total,
    paid_amount: options.paid_amount,
    refunded_amount: options.refunded_amount,
    due_amount: roundToPaise(total - options.paid_amount - options.refunded_amount),
  };
}

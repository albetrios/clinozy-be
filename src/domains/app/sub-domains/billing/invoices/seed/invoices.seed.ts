import { eq } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import {
  invoice_items,
  invoice_members,
  invoices,
} from '@/domains/app/sub-domains/billing/invoices/invoices.schema.js';
import { computeInvoiceAmounts } from '@/domains/app/sub-domains/billing/invoices/invoices.amounts.js';
import type { INVOICE_TYPE_VALUES } from '@/domains/app/sub-domains/billing/invoices/invoices.constants.js';

/**
 * One line of a seeded invoice at its rate, with its own discount and GST: an offering on a
 * clinic or consultation invoice, or packs of a medicine from one batch on a medical one (B8).
 */
export interface SeedInvoiceLine {
  offering_id?: number;
  medicine_id?: number;
  medicine_batch_id?: number;
  batch_number?: string;
  name: string;
  /** A medicine line's snapshots — its pack label and HSN code. */
  pack_size?: string;
  hsn_code?: string;
  quantity: number;
  /** Per unit, in rupees. */
  rate: number;
  discount_percent: number;
  gst_percent: number;
  is_gst_inclusive: boolean;
}

/** An invoice to seed: its type, who it bills, where and when, its lines and who earned it. */
export interface SeedInvoicePayload {
  organization_id: number;
  /** Defaults to the column's default (`clinic`); a medical invoice is written by its sale. */
  type?: (typeof INVOICE_TYPE_VALUES)[number];
  branch_id: number;
  contact_id: number;
  /** The local calendar date (`YYYY-MM-DD`); the database numbers the invoice for its financial year. */
  invoice_date: string;
  lines: readonly SeedInvoiceLine[];
  /** The members credited with the sale (`app.invoice_members`). */
  member_ids: readonly number[];
  created_by_user_id?: number;
  created_at?: Date;
}

/**
 * Inserts an invoice with its lines and members, its amounts computed exactly as the billing
 * service computes them ({@link computeInvoiceAmounts}); returns its id and total. It starts
 * unpaid — record payments, then {@link seedInvoicePaidAmount}.
 */
export async function seedInvoice(
  payload: SeedInvoicePayload,
): Promise<{ id: number; total: number }> {
  const database = getRequestDatabase();
  const amounts = computeInvoiceAmounts({
    lines: payload.lines.map((line) => ({
      quantity: line.quantity,
      rate: line.rate,
      discountPercent: line.discount_percent,
      gstPercent: line.gst_percent,
      isGstInclusive: line.is_gst_inclusive,
    })),
    overallDiscount: 0,
  });
  const createdAt = payload.created_at
    ? { created_at: payload.created_at, updated_at: payload.created_at }
    : {};
  const audit = {
    created_by_user_id: payload.created_by_user_id,
    updated_by_user_id: payload.created_by_user_id,
    ...createdAt,
  };
  const [invoice] = await database
    .insert(invoices)
    .values({
      public_id: generatePublicId('invoice'),
      organization_id: payload.organization_id,
      ...(payload.type ? { type: payload.type } : {}),
      branch_id: payload.branch_id,
      contact_id: payload.contact_id,
      invoice_date: payload.invoice_date,
      subtotal: amounts.subtotal.toFixed(2),
      discount_total: amounts.discountTotal.toFixed(2),
      taxable_total: amounts.taxableTotal.toFixed(2),
      gst_total: amounts.gstTotal.toFixed(2),
      total: amounts.total.toFixed(2),
      ...audit,
    })
    .returning({ id: invoices.id });
  await database.insert(invoice_items).values(
    payload.lines.map((line, index) => {
      const lineAmounts = amounts.lines[index]!;
      return {
        public_id: generatePublicId('invoiceItem'),
        organization_id: payload.organization_id,
        invoice_id: invoice!.id,
        line_number: index + 1,
        offering_id: line.offering_id,
        medicine_id: line.medicine_id,
        medicine_batch_id: line.medicine_batch_id,
        batch_number: line.batch_number,
        name: line.name,
        pack_size: line.pack_size,
        hsn_code: line.hsn_code,
        quantity: line.quantity,
        rate: line.rate.toFixed(2),
        discount_percent: line.discount_percent.toFixed(2),
        discount_amount: lineAmounts.discountAmount.toFixed(2),
        gst_percent: line.gst_percent,
        is_gst_inclusive: line.is_gst_inclusive,
        taxable_amount: lineAmounts.taxableAmount.toFixed(2),
        gst_amount: lineAmounts.gstAmount.toFixed(2),
        amount: lineAmounts.amount.toFixed(2),
        ...audit,
      };
    }),
  );
  if (payload.member_ids.length > 0) {
    await database.insert(invoice_members).values(
      payload.member_ids.map((membership_id) => ({
        invoice_id: invoice!.id,
        membership_id,
        organization_id: payload.organization_id,
        created_by_user_id: payload.created_by_user_id,
        ...(payload.created_at ? { created_at: payload.created_at } : {}),
      })),
    );
  }
  return { id: invoice!.id, total: amounts.total };
}

/** Sets an invoice's paid amount to what its seeded payments add up to (the due and status follow). */
export async function seedInvoicePaidAmount(options: {
  invoice_id: number;
  paid_amount: number;
}): Promise<void> {
  await getRequestDatabase()
    .update(invoices)
    .set({ paid_amount: options.paid_amount.toFixed(2) })
    .where(eq(invoices.id, options.invoice_id));
}

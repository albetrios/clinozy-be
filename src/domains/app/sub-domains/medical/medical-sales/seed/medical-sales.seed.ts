import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { INVOICE_TYPE } from '@/domains/app/sub-domains/billing/invoices/invoices.constants.js';
import { seedInvoice } from '@/domains/app/sub-domains/billing/invoices/seed/invoices.seed.js';
import { medical_sales } from '@/domains/app/sub-domains/medical/medical-sales/medical-sales.schema.js';

/** One line of a seeded sale: packs of a medicine from one batch, at its MRP (GST inside). */
export interface SeedMedicalSaleLine {
  medicine_id: number;
  medicine_batch_id: number;
  batch_number: string;
  name: string;
  quantity: number;
  /** The MRP per pack, in rupees. */
  rate: number;
  discount_percent: number;
  gst_percent: number;
}

/** A store sale to seed: the buyer, the branch, when, the lines drawn and who prescribed them. */
export interface SeedMedicalSalePayload {
  organization_id: number;
  branch_id: number;
  contact_id: number;
  /** The local calendar date of the sale — its invoice's date. */
  invoice_date: string;
  sold_at: Date;
  lines: readonly SeedMedicalSaleLine[];
  /** The members credited with it ("Prescribed by", `app.invoice_members`). */
  member_ids: readonly number[];
  created_by_user_id?: number;
}

/**
 * Inserts a store sale with its own `medical` invoice — the sale's bill (MD7, MD28: the store
 * writes it; `/invoices` never takes one). The invoice, its medicine lines with their batches and
 * its credited team go through {@link seedInvoice} (MRP inclusive of GST); then the sale row.
 * Returns the sale's and invoice's ids and the total. It starts unpaid; drawing the packs out of
 * their batches is the caller's job.
 */
export async function seedMedicalSale(
  payload: SeedMedicalSalePayload,
): Promise<{ id: number; invoiceId: number; total: number }> {
  const invoice = await seedInvoice({
    organization_id: payload.organization_id,
    type: INVOICE_TYPE.MEDICAL,
    branch_id: payload.branch_id,
    contact_id: payload.contact_id,
    invoice_date: payload.invoice_date,
    lines: payload.lines.map((line) => ({ ...line, is_gst_inclusive: true })),
    member_ids: payload.member_ids,
    ...(payload.created_by_user_id === undefined
      ? {}
      : { created_by_user_id: payload.created_by_user_id }),
    created_at: payload.sold_at,
  });
  const [sale] = await getRequestDatabase()
    .insert(medical_sales)
    .values({
      public_id: generatePublicId('medicalSale'),
      organization_id: payload.organization_id,
      invoice_id: invoice.id,
      contact_id: payload.contact_id,
      branch_id: payload.branch_id,
      sold_at: payload.sold_at,
      created_by_user_id: payload.created_by_user_id,
      updated_by_user_id: payload.created_by_user_id,
      created_at: payload.sold_at,
      updated_at: payload.sold_at,
    })
    .returning({ id: medical_sales.id });
  return { id: sale!.id, invoiceId: invoice.id, total: invoice.total };
}

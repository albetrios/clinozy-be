import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import {
  BaseRecordRepository,
  type BaseRecordLinkTable,
} from '@/domains/app/base-record.repository.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import { medicines } from '@/domains/app/sub-domains/medical/medicines/medicines.schema.js';
import { offerings } from '@/domains/app/sub-domains/offerings/offerings.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { patient_offerings } from '@/domains/app/sub-domains/patients/patient-offerings/patient-offerings.schema.js';
import { patient_offering_suggestions } from '@/domains/app/sub-domains/patients/patient-offering-suggestions/patient-offering-suggestions.schema.js';
import { patient_treatments } from '@/domains/app/sub-domains/patients/patient-treatments/patient-treatments.schema.js';
import { invoice_credit_notes } from '@/domains/app/sub-domains/billing/invoice-credit-notes/invoice-credit-notes.schema.js';
import { medical_sales } from '@/domains/app/sub-domains/medical/medical-sales/medical-sales.schema.js';
import {
  offer_branches,
  offer_offerings,
  offers,
} from '@/domains/app/sub-domains/offerings/offers/offers.schema.js';
import { contactSearchSql } from '@/domains/app/sub-domains/billing/payments/payments.repository.js';
import type { InvoiceOfferCandidate } from './invoices.pricing.js';
import { invoice_items, invoice_members, invoices } from './invoices.schema.js';

/** The `member_ids` link of an invoice (`app.invoice_members`, B15). */
export const INVOICE_MEMBERS_LINK: BaseRecordLinkTable = {
  table: invoice_members,
  ownerColumn: 'invoice_id',
  targetColumn: 'membership_id',
  targetTable: memberships,
};

/** An invoice line as a page reads it — public ids, and what it sold and bills (8.A.6). */
export interface InvoiceItemReadRow {
  invoice_id: number;
  id: string;
  line_number: number;
  offering_id: string | null;
  medicine_id: string | null;
  name: string;
  pack_size: string | null;
  hsn_code: string | null;
  quantity: number;
  rate: string;
  discount_percent: string;
  discount_amount: string;
  gst_percent: number;
  is_gst_inclusive: boolean;
  taxable_amount: string;
  gst_amount: string;
  amount: string;
  patient_offering_suggestion_id: string | null;
  patient_offering_id: string | null;
  batch_number: string | null;
}

/** An invoice line as a save reads it — internal ids, and its patient offering's spend (B12). */
export interface InvoiceItemWriteRow {
  id: number;
  public_id: string;
  line_number: number;
  offering_id: number | null;
  medicine_id: number | null;
  name: string;
  pack_size: string | null;
  hsn_code: string | null;
  quantity: number;
  rate: string;
  discount_percent: string;
  gst_percent: number;
  is_gst_inclusive: boolean;
  patient_offering_suggestion_id: number | null;
  batch_number: string | null;
  patient_offering_id: number | null;
  /** The sessions its patient offering holds — the line's snapshot of what it sold (PK4). */
  sessions_total: number | null;
  sessions_used: number | null;
}

/**
 * Persistence for `app.invoices`, its lines (`app.invoice_items`) and its team
 * (`app.invoice_members`) — launch ROUTE #136, routes-final 8.A.
 *
 * @remarks
 * - **Algorithm:** `q` on the statutory number (`2026-27/0412`), the billed contact (their names
 *   and numbers, D81) or the sequence (`#1042`); sorts
 *   `invoice_date` (newest first), `created_at`, `due_amount`; the derived `patient_id` filter (the
 *   patient file's contact, B3). The lines are written by the invoice's save (B12) — kept by id,
 *   renumbered under the deferrable `(invoice_id, line_number)` constraint.
 */
export class InvoicesRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: invoices,
      entity: 'invoice',
      searchColumns: ['invoice_number'],
      searchExpressions: [contactSearchSql(invoices.contact_id)],
      numberColumn: 'invoice_sequence',
      sortColumns: { created_at: 'created_at', invoice_date: 'text' },
      sortKeys: {
        due_amount: { keys: [{ value: 'due_amount', sqlType: 'numeric' }], defaultOrder: 'desc' },
      },
      derivedFilters: {
        patient_id: (value) =>
          sql`${invoices.contact_id} = (select ${patients.contact_id} from ${patients} where ${patients.public_id} = ${String(value)})`,
      },
      defaultSort: 'invoice_date',
      defaultOrder: 'desc',
    });
  }

  /** The lines of a page's invoices, in order — with the patient offering each sold (8.A.6). */
  async findItems(invoiceIds: readonly number[]): Promise<InvoiceItemReadRow[]> {
    if (invoiceIds.length === 0) return [];
    return getRequestDatabase()
      .select({
        invoice_id: invoice_items.invoice_id,
        id: invoice_items.public_id,
        line_number: invoice_items.line_number,
        offering_id: offerings.public_id,
        medicine_id: medicines.public_id,
        name: invoice_items.name,
        pack_size: invoice_items.pack_size,
        hsn_code: invoice_items.hsn_code,
        quantity: invoice_items.quantity,
        rate: invoice_items.rate,
        discount_percent: invoice_items.discount_percent,
        discount_amount: invoice_items.discount_amount,
        gst_percent: invoice_items.gst_percent,
        is_gst_inclusive: invoice_items.is_gst_inclusive,
        taxable_amount: invoice_items.taxable_amount,
        gst_amount: invoice_items.gst_amount,
        amount: invoice_items.amount,
        patient_offering_suggestion_id: patient_offering_suggestions.public_id,
        patient_offering_id: patient_offerings.public_id,
        batch_number: invoice_items.batch_number,
      })
      .from(invoice_items)
      .leftJoin(offerings, eq(offerings.id, invoice_items.offering_id))
      .leftJoin(medicines, eq(medicines.id, invoice_items.medicine_id))
      .leftJoin(
        patient_offering_suggestions,
        eq(patient_offering_suggestions.id, invoice_items.patient_offering_suggestion_id),
      )
      .leftJoin(patient_offerings, eq(patient_offerings.invoice_item_id, invoice_items.id))
      .where(inArray(invoice_items.invoice_id, [...invoiceIds]))
      .orderBy(asc(invoice_items.invoice_id), asc(invoice_items.line_number));
  }

  /** The treatments each patient offering bills, by its public id (`patient_treatment_ids`, B28). */
  async findBilledTreatments(
    patientOfferingPublicIds: readonly string[],
    organizationId: number,
  ): Promise<Map<string, string[]>> {
    if (patientOfferingPublicIds.length === 0) return new Map();
    const rows = await getRequestDatabase()
      .select({ offering: patient_offerings.public_id, id: patient_treatments.public_id })
      .from(patient_treatments)
      .innerJoin(
        patient_offerings,
        eq(patient_offerings.id, patient_treatments.patient_offering_id),
      )
      .where(
        and(
          eq(patient_offerings.organization_id, organizationId),
          inArray(patient_offerings.public_id, [...patientOfferingPublicIds]),
        ),
      )
      .orderBy(patient_treatments.id);
    const billed = new Map<string, string[]>();
    for (const row of rows) billed.set(row.offering, [...(billed.get(row.offering) ?? []), row.id]);
    return billed;
  }

  /** An invoice's lines for a save — internal ids and each line's patient offering spend (B12). */
  async findItemsForWrite(invoiceId: number): Promise<InvoiceItemWriteRow[]> {
    return getRequestDatabase()
      .select({
        id: invoice_items.id,
        public_id: invoice_items.public_id,
        line_number: invoice_items.line_number,
        offering_id: invoice_items.offering_id,
        medicine_id: invoice_items.medicine_id,
        name: invoice_items.name,
        pack_size: invoice_items.pack_size,
        hsn_code: invoice_items.hsn_code,
        quantity: invoice_items.quantity,
        rate: invoice_items.rate,
        discount_percent: invoice_items.discount_percent,
        gst_percent: invoice_items.gst_percent,
        is_gst_inclusive: invoice_items.is_gst_inclusive,
        patient_offering_suggestion_id: invoice_items.patient_offering_suggestion_id,
        batch_number: invoice_items.batch_number,
        patient_offering_id: patient_offerings.id,
        sessions_total: patient_offerings.sessions_total,
        sessions_used: patient_offerings.sessions_used,
      })
      .from(invoice_items)
      .leftJoin(patient_offerings, eq(patient_offerings.invoice_item_id, invoice_items.id))
      .where(eq(invoice_items.invoice_id, invoiceId))
      .orderBy(asc(invoice_items.line_number));
  }

  /**
   * The live offers that name each offering and run at the branch (none = every branch, O5) — the
   * candidates billing weighs (M26), by offering id, newest first; whether each is live on the
   * invoice's day is the pricing rule's to decide.
   */
  async findOfferCandidates(options: {
    offeringIds: readonly number[];
    branchId: number;
  }): Promise<Map<number, InvoiceOfferCandidate[]>> {
    const candidates = new Map<number, InvoiceOfferCandidate[]>();
    if (options.offeringIds.length === 0) return candidates;
    const rows = await getRequestDatabase()
      .select({
        offering_id: offer_offerings.offering_id,
        id: offers.public_id,
        kind: offers.kind,
        value: offers.value,
        starts_on: offers.starts_on,
        ends_on: offers.ends_on,
        is_active: offers.is_active,
      })
      .from(offer_offerings)
      .innerJoin(offers, eq(offers.id, offer_offerings.offer_id))
      .where(
        and(
          inArray(offer_offerings.offering_id, [...new Set(options.offeringIds)]),
          isNull(offers.deleted_at),
          sql`(not exists (select 1 from ${offer_branches} where ${offer_branches.offer_id} = ${offers.id}) or exists (select 1 from ${offer_branches} where ${offer_branches.offer_id} = ${offers.id} and ${offer_branches.branch_id} = ${options.branchId}))`,
        ),
      )
      .orderBy(desc(offers.created_at), desc(offers.id));
    for (const { offering_id, value, ...offer } of rows) {
      candidates.set(offering_id, [
        ...(candidates.get(offering_id) ?? []),
        { ...offer, value: Number(value) },
      ]);
    }
    return candidates;
  }

  /** Inserts a line with a fresh public id; returns its id. */
  async insertItem(values: Record<string, unknown>): Promise<number> {
    const rows = await getRequestDatabase()
      .insert(invoice_items)
      .values({ ...values, public_id: generatePublicId('invoiceItem') } as never)
      .returning({ id: invoice_items.id });
    return rows[0]!.id;
  }

  /** Changes a kept line (B12). */
  async updateItem(options: {
    id: number;
    values: Record<string, unknown>;
    userId: number | null;
  }): Promise<void> {
    await getRequestDatabase()
      .update(invoice_items)
      .set({
        ...options.values,
        updated_at: sql`greatest(${invoice_items.created_at}, now())`,
        updated_by_user_id: options.userId,
      } as never)
      .where(eq(invoice_items.id, options.id));
  }

  /** Removes left-out lines — their unspent patient offerings go with them (`CASCADE`, B12). */
  async deleteItems(ids: readonly number[]): Promise<void> {
    if (ids.length === 0) return;
    await getRequestDatabase()
      .delete(invoice_items)
      .where(inArray(invoice_items.id, [...ids]));
  }

  /** Whether any of the invoice's patient offerings has a spent session (B12, B14). */
  async hasSpentOffering(invoiceId: number): Promise<boolean> {
    const rows = await getRequestDatabase()
      .select({ id: patient_offerings.id })
      .from(patient_offerings)
      .innerJoin(invoice_items, eq(invoice_items.id, patient_offerings.invoice_item_id))
      .where(
        and(eq(invoice_items.invoice_id, invoiceId), sql`${patient_offerings.sessions_used} > 0`),
      )
      .limit(1);
    return rows.length > 0;
  }

  /**
   * B14: an invoice's patient offerings go and come back with it — soft-deleted with its reason,
   * restored with it.
   */
  async setOfferingsDeleted(options: {
    invoiceId: number;
    deleted: { reason: string; note: string | null } | null;
    userId: number | null;
  }): Promise<void> {
    const ofInvoice = sql`${patient_offerings.invoice_item_id} in (select ${invoice_items.id} from ${invoice_items} where ${invoice_items.invoice_id} = ${options.invoiceId})`;
    await getRequestDatabase()
      .update(patient_offerings)
      .set({
        deleted_at: options.deleted ? sql`now()` : null,
        delete_reason: options.deleted?.reason ?? null,
        delete_note: options.deleted?.note ?? null,
        updated_at: sql`greatest(${patient_offerings.created_at}, now())`,
        updated_by_user_id: options.userId,
      } as never)
      .where(and(ofInvoice, options.deleted ? isNull(patient_offerings.deleted_at) : sql`true`));
  }

  /** The invoice of each line (`patient_offerings.invoice_item_id` → the bill, PK4). */
  async findInvoicesOfItems(
    itemIds: readonly number[],
  ): Promise<Map<number, { public_id: string; invoice_date: string }>> {
    if (itemIds.length === 0) return new Map();
    const rows = await getRequestDatabase()
      .select({
        item_id: invoice_items.id,
        public_id: invoices.public_id,
        invoice_date: invoices.invoice_date,
      })
      .from(invoice_items)
      .innerJoin(invoices, eq(invoices.id, invoice_items.invoice_id))
      .where(inArray(invoice_items.id, [...itemIds]));
    return new Map(rows.map(({ item_id, ...invoice }) => [item_id, invoice]));
  }

  /**
   * How much of each plan row live invoices' lines invoiced (PK7) — a deleted invoice's lines do
   * not count (B14).
   */
  async findInvoicedQuantities(suggestionIds: readonly number[]): Promise<Map<number, number>> {
    if (suggestionIds.length === 0) return new Map();
    const rows = await getRequestDatabase()
      .select({
        suggestion_id: invoice_items.patient_offering_suggestion_id,
        quantity: sql<number>`sum(${invoice_items.quantity})::int`,
      })
      .from(invoice_items)
      .innerJoin(invoices, eq(invoices.id, invoice_items.invoice_id))
      .where(
        and(
          inArray(invoice_items.patient_offering_suggestion_id, [...suggestionIds]),
          isNull(invoices.deleted_at),
        ),
      )
      .groupBy(invoice_items.patient_offering_suggestion_id);
    return new Map(rows.map((row) => [row.suggestion_id as number, row.quantity]));
  }

  /**
   * MD20: whether a medical sale wrote this invoice — `live` while the sale stands (the invoice is
   * then the sale's to change, MDC18), `voided` once it is voided; null for any other invoice.
   */
  async findSaleState(invoiceId: number): Promise<'live' | 'voided' | null> {
    const rows = await getRequestDatabase()
      .select({ deleted_at: medical_sales.deleted_at })
      .from(medical_sales)
      .where(eq(medical_sales.invoice_id, invoiceId))
      .limit(1);
    if (rows.length === 0) return null;
    return rows[0]?.deleted_at === null ? 'live' : 'voided';
  }

  /**
   * B16, MD33: takes the invoice `FOR UPDATE` and reads its paid amount — two refunds or returns
   * on one bill then run one after the other, the second seeing what the first wrote.
   */
  async lockPaidAmount(invoiceId: number): Promise<string | null> {
    const rows = await getRequestDatabase()
      .select({ paid_amount: invoices.paid_amount })
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .for('update');
    return rows[0]?.paid_amount ?? null;
  }

  /** Whether an invoice has a live credit note (B14 — then it can't be deleted). */
  async hasLiveCreditNote(invoiceId: number): Promise<boolean> {
    const rows = await getRequestDatabase()
      .select({ id: invoice_credit_notes.id })
      .from(invoice_credit_notes)
      .where(
        and(
          eq(invoice_credit_notes.invoice_id, invoiceId),
          isNull(invoice_credit_notes.deleted_at),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  /** A contact change moves the invoice's unspent patient offerings to the new patient file (B12). */
  async moveOfferingsToPatient(options: {
    invoiceId: number;
    patientId: number;
    userId: number | null;
  }): Promise<void> {
    await getRequestDatabase()
      .update(patient_offerings)
      .set({
        patient_id: options.patientId,
        updated_at: sql`greatest(${patient_offerings.created_at}, now())`,
        updated_by_user_id: options.userId,
      } as never)
      .where(
        sql`${patient_offerings.invoice_item_id} in (select ${invoice_items.id} from ${invoice_items} where ${invoice_items.invoice_id} = ${options.invoiceId})`,
      );
  }
}

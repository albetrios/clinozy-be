import type { PgTable } from 'drizzle-orm/pg-core';
import { offering_groups } from '@/domains/app/sub-domains/offerings/offering-groups/offering-groups.schema.js';
import { contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import { branch_rooms } from '@/domains/app/sub-domains/branches/branch-rooms/branch-rooms.schema.js';
import { branch_machines } from '@/domains/app/sub-domains/branches/branch-machines/branch-machines.schema.js';
import { branch_holidays } from '@/domains/app/sub-domains/branches/branch-holidays/branch-holidays.schema.js';
import { offerings } from '@/domains/app/sub-domains/offerings/offerings.schema.js';
import { offers } from '@/domains/app/sub-domains/offerings/offers/offers.schema.js';
import { leads } from '@/domains/app/sub-domains/leads/leads.schema.js';
import { contact_message_templates } from '@/domains/app/sub-domains/contacts/contact-message-templates/contact-message-templates.schema.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { patient_diagnoses } from '@/domains/app/sub-domains/patients/patient-diagnoses/patient-diagnoses.schema.js';
import { patient_clinical_notes } from '@/domains/app/sub-domains/patients/patient-clinical-notes/patient-clinical-notes.schema.js';
import { patient_prescriptions } from '@/domains/app/sub-domains/patients/patient-prescriptions/patient-prescriptions.schema.js';
import { prescription_kits } from '@/domains/app/sub-domains/patients/prescription-kits/prescription-kits.schema.js';
import { patient_images } from '@/domains/app/sub-domains/patients/patient-images/patient-images.schema.js';
import { patient_reports } from '@/domains/app/sub-domains/patients/patient-reports/patient-reports.schema.js';
import { invoices } from '@/domains/app/sub-domains/billing/invoices/invoices.schema.js';
import { patient_offerings } from '@/domains/app/sub-domains/patients/patient-offerings/patient-offerings.schema.js';
import { patient_offering_suggestions } from '@/domains/app/sub-domains/patients/patient-offering-suggestions/patient-offering-suggestions.schema.js';
import { payments } from '@/domains/app/sub-domains/billing/payments/payments.schema.js';
import { invoice_credit_notes } from '@/domains/app/sub-domains/billing/invoice-credit-notes/invoice-credit-notes.schema.js';
import { pending_credits } from '@/domains/app/sub-domains/billing/pending-credits/pending-credits.schema.js';
import { patient_check_ins } from '@/domains/app/sub-domains/patients/patient-check-ins/patient-check-ins.schema.js';
import { patient_reviews } from '@/domains/app/sub-domains/patients/patient-reviews/patient-reviews.schema.js';
import { manufacturers } from '@/domains/app/sub-domains/medical/manufacturers/manufacturers.schema.js';
import { suppliers } from '@/domains/app/sub-domains/medical/suppliers/suppliers.schema.js';
import { medical_reps } from '@/domains/app/sub-domains/medical/medical-reps/medical-reps.schema.js';
import { medical_rep_visits } from '@/domains/app/sub-domains/medical/medical-reps/medical-rep-visits/medical-rep-visits.schema.js';
import { medicines } from '@/domains/app/sub-domains/medical/medicines/medicines.schema.js';
import { medical_purchase_orders } from '@/domains/app/sub-domains/medical/medical-purchase-orders/medical-purchase-orders.schema.js';
import { medical_sales } from '@/domains/app/sub-domains/medical/medical-sales/medical-sales.schema.js';
import { stock_vendors } from '@/domains/app/sub-domains/stock/stock-vendors/stock-vendors.schema.js';
import { stock_items } from '@/domains/app/sub-domains/stock/stock-items/stock-items.schema.js';
import { stock_purchases } from '@/domains/app/sub-domains/stock/stock-purchases/stock-purchases.schema.js';
import { tasks } from '@/domains/app/sub-domains/tasks/tasks.schema.js';

/**
 * The soft-deleting `app.*` tables the deleted-record purge erases, children before parents — the
 * order it erases them in, so a parent goes after the rows that named it (D38).
 *
 * @remarks
 * - **Notes:** never a clinical or a financial table ({@link APP_RECORD_KEPT_TABLES} — kept for
 *   good, deleted rows included, G2-4); pinned by `app-record-purge.policy.unit.test.ts`.
 *   `app.branches` is not here — a branch is never deleted (D3, D16) — nor `app.patients` (never
 *   purged, P7), nor the tables that never soft-delete (`app.patient_treatments` — reversed, TR6;
 *   the append-only `app.patient_feedback_actions`, `app.payment_edits`, `app.day_close_events`,
 *   `app.stock_item_movements`, `app.stock_counts`, `app.task_owner_changes`;
 *   `app.supplier_credits` — a voided credit is kept, never purged, MD32;
 *   `app.task_rule_settings` — upserted; `app.day_closes` — opened and closed, B25). A deleted
 *   row a kept record still names (a contact with appointments, an offering on a bill, a medicine
 *   on a sale) is skipped as blocked, run after run.
 */
export const APP_RECORD_TABLES: readonly { table: PgTable; label: string }[] = [
  // A task's owner changes go with it (append-only, `ON DELETE CASCADE`)
  { table: tasks, label: 'app.tasks' },
  // An item with movement history stays blocked (`RESTRICT` — the ledger keeps it, S5)
  { table: stock_items, label: 'app.stock_items' },
  { table: stock_vendors, label: 'app.stock_vendors' },
  // A medicine's batches and supplier prices go with it; one a bill line or a supplier credit
  // still names stays blocked (`RESTRICT`)
  { table: medicines, label: 'app.medicines' },
  { table: medical_rep_visits, label: 'app.medical_rep_visits' },
  { table: medical_reps, label: 'app.medical_reps' },
  { table: suppliers, label: 'app.suppliers' },
  { table: manufacturers, label: 'app.manufacturers' },
  // A feedback action goes with its review (append-only, `ON DELETE CASCADE`); the review's files
  // are tombstoned with it, so the upload retention removes them from storage (G2-5)
  { table: patient_reviews, label: 'app.patient_reviews' },
  { table: prescription_kits, label: 'app.prescription_kits' },
  { table: contact_message_templates, label: 'app.contact_message_templates' },
  { table: leads, label: 'app.leads' },
  // Never `app.patients` (P7 — a patient file is only ever soft-deleted). A contact goes after the
  // leads that name it (and its numbers with it); one with a patient file or an appointment stays
  // blocked (`ON DELETE RESTRICT`).
  { table: contacts, label: 'app.contacts' },
  { table: offers, label: 'app.offers' },
  { table: offerings, label: 'app.offerings' },
  { table: branch_holidays, label: 'app.branch_holidays' },
  { table: branch_machines, label: 'app.branch_machines' },
  { table: branch_rooms, label: 'app.branch_rooms' },
  { table: offering_groups, label: 'app.offering_groups' },
];

/** Why a soft-deleting table is kept for good: a patient's clinical record or the clinic's books. */
export type AppRecordKeptKind = 'clinical' | 'financial';

/**
 * The soft-deleting `app.*` tables the deleted-record purge never erases — a deleted row stays,
 * restorable, like a patient file (P7). The organization's `deleted_record_purge_days` does not
 * apply to them (G2-4).
 *
 * @remarks
 * - **Notes:** clinical — the visit, the notes, diagnoses, prescriptions, photos, reports,
 *   check-ins and the treatment plan (`app.patient_treatments` is never deleted at all, TR6);
 *   financial — bills, payments, credit notes, pending credits, the packages bought (the sessions
 *   ledger), the medical sales and the purchases with their GST. Pinned by
 *   `app-record-purge.policy.unit.test.ts`: none of them is in {@link APP_RECORD_TABLES}.
 */
export const APP_RECORD_KEPT_TABLES: readonly {
  table: PgTable;
  label: string;
  kind: AppRecordKeptKind;
}[] = [
  { table: appointments, label: 'app.appointments', kind: 'clinical' },
  { table: patient_clinical_notes, label: 'app.patient_clinical_notes', kind: 'clinical' },
  { table: patient_diagnoses, label: 'app.patient_diagnoses', kind: 'clinical' },
  { table: patient_prescriptions, label: 'app.patient_prescriptions', kind: 'clinical' },
  { table: patient_images, label: 'app.patient_images', kind: 'clinical' },
  { table: patient_reports, label: 'app.patient_reports', kind: 'clinical' },
  { table: patient_check_ins, label: 'app.patient_check_ins', kind: 'clinical' },
  {
    table: patient_offering_suggestions,
    label: 'app.patient_offering_suggestions',
    kind: 'clinical',
  },
  { table: invoices, label: 'app.invoices', kind: 'financial' },
  { table: payments, label: 'app.payments', kind: 'financial' },
  { table: invoice_credit_notes, label: 'app.invoice_credit_notes', kind: 'financial' },
  { table: pending_credits, label: 'app.pending_credits', kind: 'financial' },
  { table: patient_offerings, label: 'app.patient_offerings', kind: 'financial' },
  { table: medical_sales, label: 'app.medical_sales', kind: 'financial' },
  { table: medical_purchase_orders, label: 'app.medical_purchase_orders', kind: 'financial' },
  { table: stock_purchases, label: 'app.stock_purchases', kind: 'financial' },
];

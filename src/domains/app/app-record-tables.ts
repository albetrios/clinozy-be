import type { PgTable } from 'drizzle-orm/pg-core';
import { offering_groups } from '@/domains/app/sub-domains/offerings/offering-groups/offering-groups.schema.js';
import { contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import { branch_rooms } from '@/domains/app/sub-domains/branches/branch-rooms/branch-rooms.schema.js';
import { branch_machines } from '@/domains/app/sub-domains/branches/branch-machines/branch-machines.schema.js';
import { branch_holidays } from '@/domains/app/sub-domains/branches/branch-holidays/branch-holidays.schema.js';
import { offerings } from '@/domains/app/sub-domains/offerings/offerings.schema.js';
import { offers } from '@/domains/app/sub-domains/offerings/offers/offers.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { leads } from '@/domains/app/sub-domains/leads/leads.schema.js';
import { contact_message_templates } from '@/domains/app/sub-domains/contacts/contact-message-templates/contact-message-templates.schema.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { diagnoses } from '@/domains/app/sub-domains/diagnoses/diagnoses.schema.js';
import { patient_clinical_notes } from '@/domains/app/sub-domains/patient-clinical-notes/patient-clinical-notes.schema.js';
import { prescriptions } from '@/domains/app/sub-domains/prescriptions/prescriptions.schema.js';
import { prescription_kits } from '@/domains/app/sub-domains/prescription-kits/prescription-kits.schema.js';
import { patient_images } from '@/domains/app/sub-domains/patient-images/patient-images.schema.js';
import { patient_reports } from '@/domains/app/sub-domains/patient-reports/patient-reports.schema.js';
import { patient_notes } from '@/domains/app/sub-domains/patient-notes/patient-notes.schema.js';
import { invoices } from '@/domains/app/sub-domains/invoices/invoices.schema.js';
import { patient_packages } from '@/domains/app/sub-domains/patient-packages/patient-packages.schema.js';
import { offering_suggestions } from '@/domains/app/sub-domains/offering-suggestions/offering-suggestions.schema.js';
import { patient_ideas } from '@/domains/app/sub-domains/patient-ideas/patient-ideas.schema.js';
import { payments } from '@/domains/app/sub-domains/payments/payments.schema.js';
import { payment_edits } from '@/domains/app/sub-domains/payment-edits/payment-edits.schema.js';
import { credit_notes } from '@/domains/app/sub-domains/credit-notes/credit-notes.schema.js';
import { pending_credits } from '@/domains/app/sub-domains/pending-credits/pending-credits.schema.js';
import { day_closes } from '@/domains/app/sub-domains/day-closes/day-closes.schema.js';
import { day_close_events } from '@/domains/app/sub-domains/day-close-events/day-close-events.schema.js';
import { treatments } from '@/domains/app/sub-domains/treatments/treatments.schema.js';
import { check_ins } from '@/domains/app/sub-domains/check-ins/check-ins.schema.js';
import { reviews } from '@/domains/app/sub-domains/reviews/reviews.schema.js';
import { feedback_actions } from '@/domains/app/sub-domains/feedback-actions/feedback-actions.schema.js';
import { manufacturers } from '@/domains/app/sub-domains/manufacturers/manufacturers.schema.js';
import { suppliers } from '@/domains/app/sub-domains/suppliers/suppliers.schema.js';
import { medical_reps } from '@/domains/app/sub-domains/medical-reps/medical-reps.schema.js';
import { medical_rep_visits } from '@/domains/app/sub-domains/medical-rep-visits/medical-rep-visits.schema.js';
import { medicines } from '@/domains/app/sub-domains/medicines/medicines.schema.js';
import { medical_purchase_orders } from '@/domains/app/sub-domains/medical-purchase-orders/medical-purchase-orders.schema.js';
import { medical_contacts } from '@/domains/app/sub-domains/medical-contacts/medical-contacts.schema.js';
import { medical_sales } from '@/domains/app/sub-domains/medical-sales/medical-sales.schema.js';
import { supplier_credits } from '@/domains/app/sub-domains/supplier-credits/supplier-credits.schema.js';
import { stock_vendors } from '@/domains/app/sub-domains/stock-vendors/stock-vendors.schema.js';
import { stock_items } from '@/domains/app/sub-domains/stock-items/stock-items.schema.js';
import { stock_purchases } from '@/domains/app/sub-domains/stock-purchases/stock-purchases.schema.js';
import { stock_counts } from '@/domains/app/sub-domains/stock-counts/stock-counts.schema.js';
import { stock_movements } from '@/domains/app/sub-domains/stock-movements/stock-movements.schema.js';
import { tasks } from '@/domains/app/sub-domains/tasks/tasks.schema.js';
import { task_owner_changes } from '@/domains/app/sub-domains/task-owner-changes/task-owner-changes.schema.js';
import { task_rule_settings } from '@/domains/app/sub-domains/task-rule-settings/task-rule-settings.schema.js';

/**
 * Every soft-deleting `app.*` table, children before parents — the order the deleted-record
 * purge erases them in, so a parent goes after the rows that named it (D38).
 *
 * @remarks
 * - **Notes:** generated with the app tables. `app.branches` is not here — a branch is never
 *   deleted (D3, D16).
 */
export const APP_RECORD_TABLES: readonly { table: PgTable; label: string }[] = [
  { table: task_rule_settings, label: 'app.task_rule_settings' },
  { table: task_owner_changes, label: 'app.task_owner_changes' },
  { table: tasks, label: 'app.tasks' },
  { table: stock_movements, label: 'app.stock_movements' },
  { table: stock_counts, label: 'app.stock_counts' },
  { table: stock_purchases, label: 'app.stock_purchases' },
  { table: stock_items, label: 'app.stock_items' },
  { table: stock_vendors, label: 'app.stock_vendors' },
  { table: supplier_credits, label: 'app.supplier_credits' },
  { table: medical_sales, label: 'app.medical_sales' },
  { table: medical_contacts, label: 'app.medical_contacts' },
  { table: medical_purchase_orders, label: 'app.medical_purchase_orders' },
  { table: medicines, label: 'app.medicines' },
  { table: medical_rep_visits, label: 'app.medical_rep_visits' },
  { table: medical_reps, label: 'app.medical_reps' },
  { table: suppliers, label: 'app.suppliers' },
  { table: manufacturers, label: 'app.manufacturers' },
  { table: feedback_actions, label: 'app.feedback_actions' },
  { table: reviews, label: 'app.reviews' },
  { table: check_ins, label: 'app.check_ins' },
  { table: treatments, label: 'app.treatments' },
  { table: day_close_events, label: 'app.day_close_events' },
  { table: day_closes, label: 'app.day_closes' },
  { table: pending_credits, label: 'app.pending_credits' },
  { table: credit_notes, label: 'app.credit_notes' },
  { table: payment_edits, label: 'app.payment_edits' },
  { table: payments, label: 'app.payments' },
  { table: patient_ideas, label: 'app.patient_ideas' },
  { table: offering_suggestions, label: 'app.offering_suggestions' },
  { table: patient_packages, label: 'app.patient_packages' },
  { table: invoices, label: 'app.invoices' },
  { table: patient_notes, label: 'app.patient_notes' },
  { table: patient_reports, label: 'app.patient_reports' },
  { table: patient_images, label: 'app.patient_images' },
  { table: prescription_kits, label: 'app.prescription_kits' },
  { table: prescriptions, label: 'app.prescriptions' },
  { table: patient_clinical_notes, label: 'app.patient_clinical_notes' },
  { table: diagnoses, label: 'app.diagnoses' },
  { table: appointments, label: 'app.appointments' },
  { table: contact_message_templates, label: 'app.contact_message_templates' },
  { table: leads, label: 'app.leads' },
  { table: patients, label: 'app.patients' },
  // A contact goes after the leads, patients and appointments that name it (and its numbers with it)
  { table: contacts, label: 'app.contacts' },
  { table: offers, label: 'app.offers' },
  { table: offerings, label: 'app.offerings' },
  { table: branch_holidays, label: 'app.branch_holidays' },
  { table: branch_machines, label: 'app.branch_machines' },
  { table: branch_rooms, label: 'app.branch_rooms' },
  { table: offering_groups, label: 'app.offering_groups' },
];

-- Migration: tenant_composite_foreign_keys
-- Created: 2026-11-01T10:11:00.000Z
-- Reference: docs/reference/data/migrations.md
--
-- B2-5: each single-column foreign key from a clinic record to another clinic's record is replaced by
-- a composite one, so the referenced row must belong to the SAME organization:
--   (organization_id, <column>) -> <parent> (organization_id, id)
-- The indexes it needs were built CONCURRENTLY by 20261101101000_tenant_composite_index_prep.sql.
-- Delete actions keep their meaning: RESTRICT and CASCADE are unchanged; SET NULL clears only the
-- referencing column (`ON DELETE SET NULL (<column>)`, PostgreSQL 15+), because clearing
-- organization_id as well would violate its NOT NULL.
--
-- Existing data: each constraint is added NOT VALID and then VALIDATEd, all in this one transaction.
-- VALIDATE reads every row as the table owner with row security set aside, so it sees every clinic's
-- rows even though the migrator is subject to FORCE ROW LEVEL SECURITY (a plain SELECT pre-check run by
-- the migrator would see none of them and pass on any data). A row that already points at another
-- organization's record stops the migration with
--   ERROR: insert or update on table "<child>" violates foreign key constraint "<name>"
--   DETAIL: Key (organization_id, <column>)=(<organization>, <id>) is not present in table "<parent>".
-- and the transaction rolls back: every old key is still in place and nothing is half-converted. Fix or
-- clear that row through the operator login, then run the migration again.
--
-- Locks: DROP CONSTRAINT takes ACCESS EXCLUSIVE on the child and the parent, held until commit, so these
-- tables wait for the whole file, including the VALIDATE scans. The runner caps each lock wait (5 s) and
-- retries the file; RLS policies and FORCE ROW LEVEL SECURITY are not touched.
--
-- Converted (33): tenancy.memberships.role_id; tenancy.membership_additional_roles.membership_id and
-- .role_id; and the patient record chain — app.patients (contact_id, home_branch_id, lead_id),
-- patient_clinical_notes, patient_prescriptions, patient_images, patient_reports, patient_treatments,
-- patient_check_ins, patient_reviews, patient_feedback_actions, patient_offerings,
-- patient_offering_suggestions (each link to a patient, appointment, treatment, offering, check-in,
-- review, invoice item or diagnosis).
--
-- Deferred (113 single-column links between clinic tables, still single-column), by area, each for its
-- own follow-up with the same pattern:
-- - billing ledger: invoices, invoice_items, invoice_members, invoice_credit_notes, payments,
--   payment_edits, pending_credits, day_closes, day_close_events.
-- - inventory and purchasing: medicines, medicine_batches, medicine_supplier_prices, medical_purchase_*,
--   medical_rep_*, medical_sales, medical_sale_returns, medical_sale_return_items, stock_*,
--   supplier_credits, supplier_manufacturers.
-- - scheduling and CRM: appointments, branch_*, offerings, offer_*, offering_branches, contacts,
--   contact_activities, contact_members, leads, lead_involved_memberships, tasks, task_owner_changes,
--   membership_preference_branches.
-- audit.logs.actor_api_key_id is not converted: the audit trail is append-only.
ALTER TABLE tenancy.memberships DROP CONSTRAINT "memberships_role_id_roles_id_fk";
--> statement-breakpoint
ALTER TABLE tenancy.memberships ADD CONSTRAINT "memberships_role_fk" FOREIGN KEY (organization_id, role_id) REFERENCES tenancy.roles (organization_id, id) ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE tenancy.memberships VALIDATE CONSTRAINT "memberships_role_fk";
--> statement-breakpoint
ALTER TABLE tenancy.membership_additional_roles DROP CONSTRAINT "membership_additional_roles_membership_id_memberships_id_fk";
--> statement-breakpoint
ALTER TABLE tenancy.membership_additional_roles ADD CONSTRAINT "membership_additional_roles_membership_fk" FOREIGN KEY (organization_id, membership_id) REFERENCES tenancy.memberships (organization_id, id) ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE tenancy.membership_additional_roles VALIDATE CONSTRAINT "membership_additional_roles_membership_fk";
--> statement-breakpoint
ALTER TABLE tenancy.membership_additional_roles DROP CONSTRAINT "membership_additional_roles_role_id_roles_id_fk";
--> statement-breakpoint
ALTER TABLE tenancy.membership_additional_roles ADD CONSTRAINT "membership_additional_roles_role_fk" FOREIGN KEY (organization_id, role_id) REFERENCES tenancy.roles (organization_id, id) ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE tenancy.membership_additional_roles VALIDATE CONSTRAINT "membership_additional_roles_role_fk";
--> statement-breakpoint
ALTER TABLE app.patients DROP CONSTRAINT "patients_contact_id_contacts_id_fk";
--> statement-breakpoint
ALTER TABLE app.patients ADD CONSTRAINT "patients_contact_fk" FOREIGN KEY (organization_id, contact_id) REFERENCES app.contacts (organization_id, id) ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patients VALIDATE CONSTRAINT "patients_contact_fk";
--> statement-breakpoint
ALTER TABLE app.patients DROP CONSTRAINT "patients_home_branch_id_branches_id_fk";
--> statement-breakpoint
ALTER TABLE app.patients ADD CONSTRAINT "patients_home_branch_fk" FOREIGN KEY (organization_id, home_branch_id) REFERENCES app.branches (organization_id, id) ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patients VALIDATE CONSTRAINT "patients_home_branch_fk";
--> statement-breakpoint
ALTER TABLE app.patients DROP CONSTRAINT "patients_lead_id_leads_id_fk";
--> statement-breakpoint
ALTER TABLE app.patients ADD CONSTRAINT "patients_lead_fk" FOREIGN KEY (organization_id, lead_id) REFERENCES app.leads (organization_id, id) ON DELETE SET NULL (lead_id) NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patients VALIDATE CONSTRAINT "patients_lead_fk";
--> statement-breakpoint
ALTER TABLE app.patient_clinical_notes DROP CONSTRAINT "patient_clinical_notes_appointment_id_appointments_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_clinical_notes ADD CONSTRAINT "patient_clinical_notes_appointment_fk" FOREIGN KEY (organization_id, appointment_id) REFERENCES app.appointments (organization_id, id) ON DELETE SET NULL (appointment_id) NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_clinical_notes VALIDATE CONSTRAINT "patient_clinical_notes_appointment_fk";
--> statement-breakpoint
ALTER TABLE app.patient_clinical_notes DROP CONSTRAINT "patient_clinical_notes_patient_diagnosis_id_patient_diagnoses_i";
--> statement-breakpoint
ALTER TABLE app.patient_clinical_notes ADD CONSTRAINT "patient_clinical_notes_patient_diagnosis_fk" FOREIGN KEY (organization_id, patient_diagnosis_id) REFERENCES app.patient_diagnoses (organization_id, id) ON DELETE SET NULL (patient_diagnosis_id) NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_clinical_notes VALIDATE CONSTRAINT "patient_clinical_notes_patient_diagnosis_fk";
--> statement-breakpoint
ALTER TABLE app.patient_clinical_notes DROP CONSTRAINT "patient_clinical_notes_patient_id_patients_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_clinical_notes ADD CONSTRAINT "patient_clinical_notes_patient_fk" FOREIGN KEY (organization_id, patient_id) REFERENCES app.patients (organization_id, id) ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_clinical_notes VALIDATE CONSTRAINT "patient_clinical_notes_patient_fk";
--> statement-breakpoint
ALTER TABLE app.patient_prescriptions DROP CONSTRAINT "patient_prescriptions_appointment_id_appointments_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_prescriptions ADD CONSTRAINT "patient_prescriptions_appointment_fk" FOREIGN KEY (organization_id, appointment_id) REFERENCES app.appointments (organization_id, id) ON DELETE SET NULL (appointment_id) NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_prescriptions VALIDATE CONSTRAINT "patient_prescriptions_appointment_fk";
--> statement-breakpoint
ALTER TABLE app.patient_prescriptions DROP CONSTRAINT "patient_prescriptions_patient_id_patients_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_prescriptions ADD CONSTRAINT "patient_prescriptions_patient_fk" FOREIGN KEY (organization_id, patient_id) REFERENCES app.patients (organization_id, id) ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_prescriptions VALIDATE CONSTRAINT "patient_prescriptions_patient_fk";
--> statement-breakpoint
ALTER TABLE app.patient_images DROP CONSTRAINT "patient_images_appointment_id_appointments_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_images ADD CONSTRAINT "patient_images_appointment_fk" FOREIGN KEY (organization_id, appointment_id) REFERENCES app.appointments (organization_id, id) ON DELETE SET NULL (appointment_id) NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_images VALIDATE CONSTRAINT "patient_images_appointment_fk";
--> statement-breakpoint
ALTER TABLE app.patient_images DROP CONSTRAINT "patient_images_patient_id_patients_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_images ADD CONSTRAINT "patient_images_patient_fk" FOREIGN KEY (organization_id, patient_id) REFERENCES app.patients (organization_id, id) ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_images VALIDATE CONSTRAINT "patient_images_patient_fk";
--> statement-breakpoint
ALTER TABLE app.patient_images DROP CONSTRAINT "patient_images_patient_treatment_id_patient_treatments_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_images ADD CONSTRAINT "patient_images_patient_treatment_fk" FOREIGN KEY (organization_id, patient_treatment_id) REFERENCES app.patient_treatments (organization_id, id) ON DELETE SET NULL (patient_treatment_id) NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_images VALIDATE CONSTRAINT "patient_images_patient_treatment_fk";
--> statement-breakpoint
ALTER TABLE app.patient_reports DROP CONSTRAINT "patient_reports_patient_id_patients_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_reports ADD CONSTRAINT "patient_reports_patient_fk" FOREIGN KEY (organization_id, patient_id) REFERENCES app.patients (organization_id, id) ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_reports VALIDATE CONSTRAINT "patient_reports_patient_fk";
--> statement-breakpoint
ALTER TABLE app.patient_treatments DROP CONSTRAINT "patient_treatments_appointment_id_appointments_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_treatments ADD CONSTRAINT "patient_treatments_appointment_fk" FOREIGN KEY (organization_id, appointment_id) REFERENCES app.appointments (organization_id, id) ON DELETE SET NULL (appointment_id) NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_treatments VALIDATE CONSTRAINT "patient_treatments_appointment_fk";
--> statement-breakpoint
ALTER TABLE app.patient_treatments DROP CONSTRAINT "patient_treatments_offering_id_offerings_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_treatments ADD CONSTRAINT "patient_treatments_offering_fk" FOREIGN KEY (organization_id, offering_id) REFERENCES app.offerings (organization_id, id) ON DELETE SET NULL (offering_id) NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_treatments VALIDATE CONSTRAINT "patient_treatments_offering_fk";
--> statement-breakpoint
ALTER TABLE app.patient_treatments DROP CONSTRAINT "patient_treatments_patient_id_patients_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_treatments ADD CONSTRAINT "patient_treatments_patient_fk" FOREIGN KEY (organization_id, patient_id) REFERENCES app.patients (organization_id, id) ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_treatments VALIDATE CONSTRAINT "patient_treatments_patient_fk";
--> statement-breakpoint
ALTER TABLE app.patient_treatments DROP CONSTRAINT "patient_treatments_patient_offering_id_patient_offerings_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_treatments ADD CONSTRAINT "patient_treatments_patient_offering_fk" FOREIGN KEY (organization_id, patient_offering_id) REFERENCES app.patient_offerings (organization_id, id) ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_treatments VALIDATE CONSTRAINT "patient_treatments_patient_offering_fk";
--> statement-breakpoint
ALTER TABLE app.patient_check_ins DROP CONSTRAINT "patient_check_ins_appointment_id_appointments_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_check_ins ADD CONSTRAINT "patient_check_ins_appointment_fk" FOREIGN KEY (organization_id, appointment_id) REFERENCES app.appointments (organization_id, id) ON DELETE SET NULL (appointment_id) NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_check_ins VALIDATE CONSTRAINT "patient_check_ins_appointment_fk";
--> statement-breakpoint
ALTER TABLE app.patient_check_ins DROP CONSTRAINT "patient_check_ins_patient_id_patients_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_check_ins ADD CONSTRAINT "patient_check_ins_patient_fk" FOREIGN KEY (organization_id, patient_id) REFERENCES app.patients (organization_id, id) ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_check_ins VALIDATE CONSTRAINT "patient_check_ins_patient_fk";
--> statement-breakpoint
ALTER TABLE app.patient_check_ins DROP CONSTRAINT "patient_check_ins_patient_treatment_id_patient_treatments_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_check_ins ADD CONSTRAINT "patient_check_ins_patient_treatment_fk" FOREIGN KEY (organization_id, patient_treatment_id) REFERENCES app.patient_treatments (organization_id, id) ON DELETE SET NULL (patient_treatment_id) NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_check_ins VALIDATE CONSTRAINT "patient_check_ins_patient_treatment_fk";
--> statement-breakpoint
ALTER TABLE app.patient_reviews DROP CONSTRAINT "patient_reviews_appointment_id_appointments_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_reviews ADD CONSTRAINT "patient_reviews_appointment_fk" FOREIGN KEY (organization_id, appointment_id) REFERENCES app.appointments (organization_id, id) ON DELETE SET NULL (appointment_id) NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_reviews VALIDATE CONSTRAINT "patient_reviews_appointment_fk";
--> statement-breakpoint
ALTER TABLE app.patient_reviews DROP CONSTRAINT "patient_reviews_patient_id_patients_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_reviews ADD CONSTRAINT "patient_reviews_patient_fk" FOREIGN KEY (organization_id, patient_id) REFERENCES app.patients (organization_id, id) ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_reviews VALIDATE CONSTRAINT "patient_reviews_patient_fk";
--> statement-breakpoint
ALTER TABLE app.patient_feedback_actions DROP CONSTRAINT "patient_feedback_actions_patient_check_in_id_patient_check_ins_";
--> statement-breakpoint
ALTER TABLE app.patient_feedback_actions ADD CONSTRAINT "patient_feedback_actions_patient_check_in_fk" FOREIGN KEY (organization_id, patient_check_in_id) REFERENCES app.patient_check_ins (organization_id, id) ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_feedback_actions VALIDATE CONSTRAINT "patient_feedback_actions_patient_check_in_fk";
--> statement-breakpoint
ALTER TABLE app.patient_feedback_actions DROP CONSTRAINT "patient_feedback_actions_patient_review_id_patient_reviews_id_f";
--> statement-breakpoint
ALTER TABLE app.patient_feedback_actions ADD CONSTRAINT "patient_feedback_actions_patient_review_fk" FOREIGN KEY (organization_id, patient_review_id) REFERENCES app.patient_reviews (organization_id, id) ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_feedback_actions VALIDATE CONSTRAINT "patient_feedback_actions_patient_review_fk";
--> statement-breakpoint
ALTER TABLE app.patient_offerings DROP CONSTRAINT "patient_offerings_invoice_item_id_invoice_items_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_offerings ADD CONSTRAINT "patient_offerings_invoice_item_fk" FOREIGN KEY (organization_id, invoice_item_id) REFERENCES app.invoice_items (organization_id, id) ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_offerings VALIDATE CONSTRAINT "patient_offerings_invoice_item_fk";
--> statement-breakpoint
ALTER TABLE app.patient_offerings DROP CONSTRAINT "patient_offerings_offering_id_offerings_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_offerings ADD CONSTRAINT "patient_offerings_offering_fk" FOREIGN KEY (organization_id, offering_id) REFERENCES app.offerings (organization_id, id) ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_offerings VALIDATE CONSTRAINT "patient_offerings_offering_fk";
--> statement-breakpoint
ALTER TABLE app.patient_offerings DROP CONSTRAINT "patient_offerings_patient_id_patients_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_offerings ADD CONSTRAINT "patient_offerings_patient_fk" FOREIGN KEY (organization_id, patient_id) REFERENCES app.patients (organization_id, id) ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_offerings VALIDATE CONSTRAINT "patient_offerings_patient_fk";
--> statement-breakpoint
ALTER TABLE app.patient_offering_suggestions DROP CONSTRAINT "patient_offering_suggestions_appointment_id_appointments_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_offering_suggestions ADD CONSTRAINT "patient_offering_suggestions_appointment_fk" FOREIGN KEY (organization_id, appointment_id) REFERENCES app.appointments (organization_id, id) ON DELETE SET NULL (appointment_id) NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_offering_suggestions VALIDATE CONSTRAINT "patient_offering_suggestions_appointment_fk";
--> statement-breakpoint
ALTER TABLE app.patient_offering_suggestions DROP CONSTRAINT "patient_offering_suggestions_offering_id_offerings_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_offering_suggestions ADD CONSTRAINT "patient_offering_suggestions_offering_fk" FOREIGN KEY (organization_id, offering_id) REFERENCES app.offerings (organization_id, id) ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_offering_suggestions VALIDATE CONSTRAINT "patient_offering_suggestions_offering_fk";
--> statement-breakpoint
ALTER TABLE app.patient_offering_suggestions DROP CONSTRAINT "patient_offering_suggestions_patient_check_in_id_patient_check_";
--> statement-breakpoint
ALTER TABLE app.patient_offering_suggestions ADD CONSTRAINT "patient_offering_suggestions_patient_check_in_fk" FOREIGN KEY (organization_id, patient_check_in_id) REFERENCES app.patient_check_ins (organization_id, id) ON DELETE SET NULL (patient_check_in_id) NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_offering_suggestions VALIDATE CONSTRAINT "patient_offering_suggestions_patient_check_in_fk";
--> statement-breakpoint
ALTER TABLE app.patient_offering_suggestions DROP CONSTRAINT "patient_offering_suggestions_patient_id_patients_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_offering_suggestions ADD CONSTRAINT "patient_offering_suggestions_patient_fk" FOREIGN KEY (organization_id, patient_id) REFERENCES app.patients (organization_id, id) ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_offering_suggestions VALIDATE CONSTRAINT "patient_offering_suggestions_patient_fk";

-- migration-transaction: none reason="CREATE/DROP INDEX CONCURRENTLY cannot run inside a transaction"
-- Migration: tenant_composite_index_prep
-- Created: 2026-11-01T10:10:00.000Z
-- Reference: docs/reference/data/migrations.md
--
-- B2-5: the database did not stop a row from pointing at another clinic's row. A composite
-- foreign key (organization_id, <column>) -> parent (organization_id, id) does — but it needs a
-- unique index on the parent's (organization_id, id) and an index on the child that leads with
-- (organization_id, <column>) for the ON DELETE / ON UPDATE action. This file builds those indexes
-- CONCURRENTLY, so no write waits; the foreign keys themselves are swapped in the next migration
-- (20261101101100_tenant_composite_foreign_keys.sql, transactional) once every index is valid.
--
-- Child indexes are partial (WHERE <column> IS NOT NULL), the shape the index hygiene gate accepts
-- for a foreign key. The plain organization indexes the new parent indexes make redundant are dropped
-- by 20261101101050_tenant_composite_retire_plain_indexes.sql.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_roles_organization_id_id ON tenancy.roles (organization_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_organization_id_id ON app.contacts (organization_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_branches_organization_id_id ON app.branches (organization_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_organization_id_id ON app.leads (organization_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_organization_id_id ON app.appointments (organization_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_diagnoses_organization_id_id ON app.patient_diagnoses (organization_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_patients_organization_id_id ON app.patients (organization_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_treatments_organization_id_id ON app.patient_treatments (organization_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_offerings_organization_id_id ON app.offerings (organization_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_offerings_organization_id_id ON app.patient_offerings (organization_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_check_ins_organization_id_id ON app.patient_check_ins (organization_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_reviews_organization_id_id ON app.patient_reviews (organization_id, id);
--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_invoice_items_organization_id_id ON app.invoice_items (organization_id, id);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_memberships_organization_role ON tenancy.memberships (organization_id, role_id) WHERE role_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_membership_additional_roles_organization_membership ON tenancy.membership_additional_roles (organization_id, membership_id) WHERE membership_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_membership_additional_roles_organization_role ON tenancy.membership_additional_roles (organization_id, role_id) WHERE role_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patients_organization_contact ON app.patients (organization_id, contact_id) WHERE contact_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patients_organization_home_branch ON app.patients (organization_id, home_branch_id) WHERE home_branch_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patients_organization_lead ON app.patients (organization_id, lead_id) WHERE lead_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_clinical_notes_organization_appointment ON app.patient_clinical_notes (organization_id, appointment_id) WHERE appointment_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_clinical_notes_organization_patient_diagnosis ON app.patient_clinical_notes (organization_id, patient_diagnosis_id) WHERE patient_diagnosis_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_clinical_notes_organization_patient ON app.patient_clinical_notes (organization_id, patient_id) WHERE patient_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_prescriptions_organization_appointment ON app.patient_prescriptions (organization_id, appointment_id) WHERE appointment_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_prescriptions_organization_patient ON app.patient_prescriptions (organization_id, patient_id) WHERE patient_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_images_organization_appointment ON app.patient_images (organization_id, appointment_id) WHERE appointment_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_images_organization_patient ON app.patient_images (organization_id, patient_id) WHERE patient_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_images_organization_patient_treatment ON app.patient_images (organization_id, patient_treatment_id) WHERE patient_treatment_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_reports_organization_patient ON app.patient_reports (organization_id, patient_id) WHERE patient_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_treatments_organization_appointment ON app.patient_treatments (organization_id, appointment_id) WHERE appointment_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_treatments_organization_offering ON app.patient_treatments (organization_id, offering_id) WHERE offering_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_treatments_organization_patient ON app.patient_treatments (organization_id, patient_id) WHERE patient_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_treatments_organization_patient_offering ON app.patient_treatments (organization_id, patient_offering_id) WHERE patient_offering_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_check_ins_organization_appointment ON app.patient_check_ins (organization_id, appointment_id) WHERE appointment_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_check_ins_organization_patient ON app.patient_check_ins (organization_id, patient_id) WHERE patient_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_check_ins_organization_patient_treatment ON app.patient_check_ins (organization_id, patient_treatment_id) WHERE patient_treatment_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_reviews_organization_appointment ON app.patient_reviews (organization_id, appointment_id) WHERE appointment_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_reviews_organization_patient ON app.patient_reviews (organization_id, patient_id) WHERE patient_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_feedback_actions_organization_patient_check_in ON app.patient_feedback_actions (organization_id, patient_check_in_id) WHERE patient_check_in_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_feedback_actions_organization_patient_review ON app.patient_feedback_actions (organization_id, patient_review_id) WHERE patient_review_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_offerings_organization_invoice_item ON app.patient_offerings (organization_id, invoice_item_id) WHERE invoice_item_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_offerings_organization_offering ON app.patient_offerings (organization_id, offering_id) WHERE offering_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_offerings_organization_patient ON app.patient_offerings (organization_id, patient_id) WHERE patient_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_offering_suggestions_organization_appointment ON app.patient_offering_suggestions (organization_id, appointment_id) WHERE appointment_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_offering_suggestions_organization_offering ON app.patient_offering_suggestions (organization_id, offering_id) WHERE offering_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_offering_suggestions_organization_patient_check_in ON app.patient_offering_suggestions (organization_id, patient_check_in_id) WHERE patient_check_in_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patient_offering_suggestions_organization_patient ON app.patient_offering_suggestions (organization_id, patient_id) WHERE patient_id IS NOT NULL;

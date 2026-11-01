-- Migration: user_erasure_attribution_set_null
-- Created: 2026-11-01T10:00:00.000Z
-- Reference: docs/reference/data/migrations.md
--
-- G2-2: a departed clinician's account data was never erased. Every attribution column that
-- records who created or last changed a row (created_by_user_id / updated_by_user_id) referenced
-- auth.users with NO ACTION, so the tombstone purge of a user row failed on the first record that
-- user had touched, and the retention job skipped the row: the account (email, name, password
-- hash) was kept forever. The record outlives the person who touched it, so each such reference
-- becomes ON DELETE SET NULL — the same meaning as the attribution columns already converted by
-- 20261010152248_user_erasure_foreign_keys.sql. Each column is nullable, so no NOT NULL changes.
--
-- The one NO ACTION reference left on auth.users is tenancy.organizations.owner_user_id: a user
-- who owns a team organization cannot be deleted until ownership is transferred, and the personal
-- organization is tombstoned with its owner. The policy test
-- src/tests/integration/database/user-erasure-foreign-keys.integration.test.ts pins this set.
--
-- Constraint names are kept; each is re-added NOT VALID and validated (no long lock).
ALTER TABLE app.appointments DROP CONSTRAINT "appointments_created_by_user_id_users_id_fk", ADD CONSTRAINT "appointments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.appointments VALIDATE CONSTRAINT "appointments_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.appointments DROP CONSTRAINT "appointments_updated_by_user_id_users_id_fk", ADD CONSTRAINT "appointments_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.appointments VALIDATE CONSTRAINT "appointments_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.branch_holidays DROP CONSTRAINT "branch_holidays_created_by_user_id_users_id_fk", ADD CONSTRAINT "branch_holidays_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.branch_holidays VALIDATE CONSTRAINT "branch_holidays_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.branch_holidays DROP CONSTRAINT "branch_holidays_updated_by_user_id_users_id_fk", ADD CONSTRAINT "branch_holidays_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.branch_holidays VALIDATE CONSTRAINT "branch_holidays_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.branch_machines DROP CONSTRAINT "branch_machines_created_by_user_id_users_id_fk", ADD CONSTRAINT "branch_machines_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.branch_machines VALIDATE CONSTRAINT "branch_machines_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.branch_machines DROP CONSTRAINT "branch_machines_updated_by_user_id_users_id_fk", ADD CONSTRAINT "branch_machines_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.branch_machines VALIDATE CONSTRAINT "branch_machines_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.branch_members DROP CONSTRAINT "branch_members_created_by_user_id_users_id_fk", ADD CONSTRAINT "branch_members_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.branch_members VALIDATE CONSTRAINT "branch_members_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.branch_rooms DROP CONSTRAINT "branch_rooms_created_by_user_id_users_id_fk", ADD CONSTRAINT "branch_rooms_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.branch_rooms VALIDATE CONSTRAINT "branch_rooms_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.branch_rooms DROP CONSTRAINT "branch_rooms_updated_by_user_id_users_id_fk", ADD CONSTRAINT "branch_rooms_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.branch_rooms VALIDATE CONSTRAINT "branch_rooms_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.branches DROP CONSTRAINT "branches_created_by_user_id_users_id_fk", ADD CONSTRAINT "branches_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.branches VALIDATE CONSTRAINT "branches_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.branches DROP CONSTRAINT "branches_updated_by_user_id_users_id_fk", ADD CONSTRAINT "branches_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.branches VALIDATE CONSTRAINT "branches_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.contact_activities DROP CONSTRAINT "contact_activities_created_by_user_id_users_id_fk", ADD CONSTRAINT "contact_activities_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.contact_activities VALIDATE CONSTRAINT "contact_activities_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.contact_activities DROP CONSTRAINT "contact_activities_updated_by_user_id_users_id_fk", ADD CONSTRAINT "contact_activities_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.contact_activities VALIDATE CONSTRAINT "contact_activities_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.contact_members DROP CONSTRAINT "contact_members_created_by_user_id_users_id_fk", ADD CONSTRAINT "contact_members_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.contact_members VALIDATE CONSTRAINT "contact_members_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.contact_message_templates DROP CONSTRAINT "contact_message_templates_created_by_user_id_users_id_fk", ADD CONSTRAINT "contact_message_templates_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.contact_message_templates VALIDATE CONSTRAINT "contact_message_templates_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.contact_message_templates DROP CONSTRAINT "contact_message_templates_updated_by_user_id_users_id_fk", ADD CONSTRAINT "contact_message_templates_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.contact_message_templates VALIDATE CONSTRAINT "contact_message_templates_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.contacts DROP CONSTRAINT "contacts_created_by_user_id_users_id_fk", ADD CONSTRAINT "contacts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.contacts VALIDATE CONSTRAINT "contacts_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.contacts DROP CONSTRAINT "contacts_updated_by_user_id_users_id_fk", ADD CONSTRAINT "contacts_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.contacts VALIDATE CONSTRAINT "contacts_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.day_close_events DROP CONSTRAINT "day_close_events_created_by_user_id_users_id_fk", ADD CONSTRAINT "day_close_events_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.day_close_events VALIDATE CONSTRAINT "day_close_events_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.day_closes DROP CONSTRAINT "day_closes_created_by_user_id_users_id_fk", ADD CONSTRAINT "day_closes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.day_closes VALIDATE CONSTRAINT "day_closes_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.day_closes DROP CONSTRAINT "day_closes_updated_by_user_id_users_id_fk", ADD CONSTRAINT "day_closes_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.day_closes VALIDATE CONSTRAINT "day_closes_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.invoice_credit_notes DROP CONSTRAINT "invoice_credit_notes_created_by_user_id_users_id_fk", ADD CONSTRAINT "invoice_credit_notes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.invoice_credit_notes VALIDATE CONSTRAINT "invoice_credit_notes_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.invoice_credit_notes DROP CONSTRAINT "invoice_credit_notes_updated_by_user_id_users_id_fk", ADD CONSTRAINT "invoice_credit_notes_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.invoice_credit_notes VALIDATE CONSTRAINT "invoice_credit_notes_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.invoice_items DROP CONSTRAINT "invoice_items_created_by_user_id_users_id_fk", ADD CONSTRAINT "invoice_items_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.invoice_items VALIDATE CONSTRAINT "invoice_items_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.invoice_items DROP CONSTRAINT "invoice_items_updated_by_user_id_users_id_fk", ADD CONSTRAINT "invoice_items_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.invoice_items VALIDATE CONSTRAINT "invoice_items_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.invoice_members DROP CONSTRAINT "invoice_members_created_by_user_id_users_id_fk", ADD CONSTRAINT "invoice_members_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.invoice_members VALIDATE CONSTRAINT "invoice_members_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.invoices DROP CONSTRAINT "invoices_created_by_user_id_users_id_fk", ADD CONSTRAINT "invoices_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.invoices VALIDATE CONSTRAINT "invoices_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.invoices DROP CONSTRAINT "invoices_updated_by_user_id_users_id_fk", ADD CONSTRAINT "invoices_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.invoices VALIDATE CONSTRAINT "invoices_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.lead_involved_memberships DROP CONSTRAINT "lead_involved_memberships_created_by_user_id_users_id_fk", ADD CONSTRAINT "lead_involved_memberships_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.lead_involved_memberships VALIDATE CONSTRAINT "lead_involved_memberships_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.leads DROP CONSTRAINT "leads_created_by_user_id_users_id_fk", ADD CONSTRAINT "leads_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.leads VALIDATE CONSTRAINT "leads_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.leads DROP CONSTRAINT "leads_updated_by_user_id_users_id_fk", ADD CONSTRAINT "leads_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.leads VALIDATE CONSTRAINT "leads_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.manufacturers DROP CONSTRAINT "manufacturers_created_by_user_id_users_id_fk", ADD CONSTRAINT "manufacturers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.manufacturers VALIDATE CONSTRAINT "manufacturers_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.manufacturers DROP CONSTRAINT "manufacturers_updated_by_user_id_users_id_fk", ADD CONSTRAINT "manufacturers_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.manufacturers VALIDATE CONSTRAINT "manufacturers_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.medical_purchase_orders DROP CONSTRAINT "medical_purchase_orders_created_by_user_id_users_id_fk", ADD CONSTRAINT "medical_purchase_orders_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.medical_purchase_orders VALIDATE CONSTRAINT "medical_purchase_orders_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.medical_purchase_orders DROP CONSTRAINT "medical_purchase_orders_updated_by_user_id_users_id_fk", ADD CONSTRAINT "medical_purchase_orders_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.medical_purchase_orders VALIDATE CONSTRAINT "medical_purchase_orders_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.medical_rep_manufacturers DROP CONSTRAINT "medical_rep_manufacturers_created_by_user_id_users_id_fk", ADD CONSTRAINT "medical_rep_manufacturers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.medical_rep_manufacturers VALIDATE CONSTRAINT "medical_rep_manufacturers_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.medical_rep_visits DROP CONSTRAINT "medical_rep_visits_created_by_user_id_users_id_fk", ADD CONSTRAINT "medical_rep_visits_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.medical_rep_visits VALIDATE CONSTRAINT "medical_rep_visits_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.medical_rep_visits DROP CONSTRAINT "medical_rep_visits_updated_by_user_id_users_id_fk", ADD CONSTRAINT "medical_rep_visits_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.medical_rep_visits VALIDATE CONSTRAINT "medical_rep_visits_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.medical_reps DROP CONSTRAINT "medical_reps_created_by_user_id_users_id_fk", ADD CONSTRAINT "medical_reps_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.medical_reps VALIDATE CONSTRAINT "medical_reps_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.medical_reps DROP CONSTRAINT "medical_reps_updated_by_user_id_users_id_fk", ADD CONSTRAINT "medical_reps_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.medical_reps VALIDATE CONSTRAINT "medical_reps_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.medical_sale_returns DROP CONSTRAINT "medical_sale_returns_created_by_user_id_users_id_fk", ADD CONSTRAINT "medical_sale_returns_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.medical_sale_returns VALIDATE CONSTRAINT "medical_sale_returns_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.medical_sales DROP CONSTRAINT "medical_sales_created_by_user_id_users_id_fk", ADD CONSTRAINT "medical_sales_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.medical_sales VALIDATE CONSTRAINT "medical_sales_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.medical_sales DROP CONSTRAINT "medical_sales_updated_by_user_id_users_id_fk", ADD CONSTRAINT "medical_sales_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.medical_sales VALIDATE CONSTRAINT "medical_sales_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.medicine_batches DROP CONSTRAINT "medicine_batches_created_by_user_id_users_id_fk", ADD CONSTRAINT "medicine_batches_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.medicine_batches VALIDATE CONSTRAINT "medicine_batches_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.medicine_batches DROP CONSTRAINT "medicine_batches_updated_by_user_id_users_id_fk", ADD CONSTRAINT "medicine_batches_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.medicine_batches VALIDATE CONSTRAINT "medicine_batches_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.medicines DROP CONSTRAINT "medicines_created_by_user_id_users_id_fk", ADD CONSTRAINT "medicines_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.medicines VALIDATE CONSTRAINT "medicines_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.medicines DROP CONSTRAINT "medicines_updated_by_user_id_users_id_fk", ADD CONSTRAINT "medicines_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.medicines VALIDATE CONSTRAINT "medicines_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.membership_preferences DROP CONSTRAINT "membership_preferences_created_by_user_id_users_id_fk", ADD CONSTRAINT "membership_preferences_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.membership_preferences VALIDATE CONSTRAINT "membership_preferences_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.membership_preferences DROP CONSTRAINT "membership_preferences_updated_by_user_id_users_id_fk", ADD CONSTRAINT "membership_preferences_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.membership_preferences VALIDATE CONSTRAINT "membership_preferences_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.membership_saved_views DROP CONSTRAINT "membership_saved_views_created_by_user_id_users_id_fk", ADD CONSTRAINT "membership_saved_views_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.membership_saved_views VALIDATE CONSTRAINT "membership_saved_views_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.membership_saved_views DROP CONSTRAINT "membership_saved_views_updated_by_user_id_users_id_fk", ADD CONSTRAINT "membership_saved_views_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.membership_saved_views VALIDATE CONSTRAINT "membership_saved_views_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.offer_branches DROP CONSTRAINT "offer_branches_created_by_user_id_users_id_fk", ADD CONSTRAINT "offer_branches_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.offer_branches VALIDATE CONSTRAINT "offer_branches_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.offer_offerings DROP CONSTRAINT "offer_offerings_created_by_user_id_users_id_fk", ADD CONSTRAINT "offer_offerings_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.offer_offerings VALIDATE CONSTRAINT "offer_offerings_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.offering_branches DROP CONSTRAINT "offering_branches_created_by_user_id_users_id_fk", ADD CONSTRAINT "offering_branches_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.offering_branches VALIDATE CONSTRAINT "offering_branches_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.offering_groups DROP CONSTRAINT "offering_groups_created_by_user_id_users_id_fk", ADD CONSTRAINT "offering_groups_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.offering_groups VALIDATE CONSTRAINT "offering_groups_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.offering_groups DROP CONSTRAINT "offering_groups_updated_by_user_id_users_id_fk", ADD CONSTRAINT "offering_groups_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.offering_groups VALIDATE CONSTRAINT "offering_groups_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.offerings DROP CONSTRAINT "offerings_created_by_user_id_users_id_fk", ADD CONSTRAINT "offerings_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.offerings VALIDATE CONSTRAINT "offerings_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.offerings DROP CONSTRAINT "offerings_updated_by_user_id_users_id_fk", ADD CONSTRAINT "offerings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.offerings VALIDATE CONSTRAINT "offerings_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.offers DROP CONSTRAINT "offers_created_by_user_id_users_id_fk", ADD CONSTRAINT "offers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.offers VALIDATE CONSTRAINT "offers_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.offers DROP CONSTRAINT "offers_updated_by_user_id_users_id_fk", ADD CONSTRAINT "offers_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.offers VALIDATE CONSTRAINT "offers_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_check_ins DROP CONSTRAINT "patient_check_ins_created_by_user_id_users_id_fk", ADD CONSTRAINT "patient_check_ins_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_check_ins VALIDATE CONSTRAINT "patient_check_ins_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_check_ins DROP CONSTRAINT "patient_check_ins_updated_by_user_id_users_id_fk", ADD CONSTRAINT "patient_check_ins_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_check_ins VALIDATE CONSTRAINT "patient_check_ins_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_clinical_notes DROP CONSTRAINT "patient_clinical_notes_created_by_user_id_users_id_fk", ADD CONSTRAINT "patient_clinical_notes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_clinical_notes VALIDATE CONSTRAINT "patient_clinical_notes_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_clinical_notes DROP CONSTRAINT "patient_clinical_notes_updated_by_user_id_users_id_fk", ADD CONSTRAINT "patient_clinical_notes_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_clinical_notes VALIDATE CONSTRAINT "patient_clinical_notes_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_diagnoses DROP CONSTRAINT "patient_diagnoses_created_by_user_id_users_id_fk", ADD CONSTRAINT "patient_diagnoses_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_diagnoses VALIDATE CONSTRAINT "patient_diagnoses_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_diagnoses DROP CONSTRAINT "patient_diagnoses_updated_by_user_id_users_id_fk", ADD CONSTRAINT "patient_diagnoses_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_diagnoses VALIDATE CONSTRAINT "patient_diagnoses_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_feedback_actions DROP CONSTRAINT "patient_feedback_actions_created_by_user_id_users_id_fk", ADD CONSTRAINT "patient_feedback_actions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_feedback_actions VALIDATE CONSTRAINT "patient_feedback_actions_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_images DROP CONSTRAINT "patient_images_created_by_user_id_users_id_fk", ADD CONSTRAINT "patient_images_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_images VALIDATE CONSTRAINT "patient_images_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_images DROP CONSTRAINT "patient_images_updated_by_user_id_users_id_fk", ADD CONSTRAINT "patient_images_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_images VALIDATE CONSTRAINT "patient_images_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_offering_suggestions DROP CONSTRAINT "patient_offering_suggestions_created_by_user_id_users_id_fk", ADD CONSTRAINT "patient_offering_suggestions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_offering_suggestions VALIDATE CONSTRAINT "patient_offering_suggestions_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_offering_suggestions DROP CONSTRAINT "patient_offering_suggestions_updated_by_user_id_users_id_fk", ADD CONSTRAINT "patient_offering_suggestions_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_offering_suggestions VALIDATE CONSTRAINT "patient_offering_suggestions_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_offerings DROP CONSTRAINT "patient_offerings_created_by_user_id_users_id_fk", ADD CONSTRAINT "patient_offerings_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_offerings VALIDATE CONSTRAINT "patient_offerings_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_offerings DROP CONSTRAINT "patient_offerings_updated_by_user_id_users_id_fk", ADD CONSTRAINT "patient_offerings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_offerings VALIDATE CONSTRAINT "patient_offerings_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_prescriptions DROP CONSTRAINT "patient_prescriptions_created_by_user_id_users_id_fk", ADD CONSTRAINT "patient_prescriptions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_prescriptions VALIDATE CONSTRAINT "patient_prescriptions_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_prescriptions DROP CONSTRAINT "patient_prescriptions_updated_by_user_id_users_id_fk", ADD CONSTRAINT "patient_prescriptions_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_prescriptions VALIDATE CONSTRAINT "patient_prescriptions_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_reports DROP CONSTRAINT "patient_reports_created_by_user_id_users_id_fk", ADD CONSTRAINT "patient_reports_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_reports VALIDATE CONSTRAINT "patient_reports_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_reports DROP CONSTRAINT "patient_reports_updated_by_user_id_users_id_fk", ADD CONSTRAINT "patient_reports_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_reports VALIDATE CONSTRAINT "patient_reports_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_reviews DROP CONSTRAINT "patient_reviews_created_by_user_id_users_id_fk", ADD CONSTRAINT "patient_reviews_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_reviews VALIDATE CONSTRAINT "patient_reviews_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_reviews DROP CONSTRAINT "patient_reviews_updated_by_user_id_users_id_fk", ADD CONSTRAINT "patient_reviews_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_reviews VALIDATE CONSTRAINT "patient_reviews_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_treatments DROP CONSTRAINT "patient_treatments_created_by_user_id_users_id_fk", ADD CONSTRAINT "patient_treatments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_treatments VALIDATE CONSTRAINT "patient_treatments_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.patient_treatments DROP CONSTRAINT "patient_treatments_updated_by_user_id_users_id_fk", ADD CONSTRAINT "patient_treatments_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patient_treatments VALIDATE CONSTRAINT "patient_treatments_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.patients DROP CONSTRAINT "patients_created_by_user_id_users_id_fk", ADD CONSTRAINT "patients_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patients VALIDATE CONSTRAINT "patients_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.patients DROP CONSTRAINT "patients_updated_by_user_id_users_id_fk", ADD CONSTRAINT "patients_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.patients VALIDATE CONSTRAINT "patients_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.payment_edits DROP CONSTRAINT "payment_edits_created_by_user_id_users_id_fk", ADD CONSTRAINT "payment_edits_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.payment_edits VALIDATE CONSTRAINT "payment_edits_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.payments DROP CONSTRAINT "payments_created_by_user_id_users_id_fk", ADD CONSTRAINT "payments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.payments VALIDATE CONSTRAINT "payments_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.payments DROP CONSTRAINT "payments_updated_by_user_id_users_id_fk", ADD CONSTRAINT "payments_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.payments VALIDATE CONSTRAINT "payments_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.pending_credits DROP CONSTRAINT "pending_credits_created_by_user_id_users_id_fk", ADD CONSTRAINT "pending_credits_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.pending_credits VALIDATE CONSTRAINT "pending_credits_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.pending_credits DROP CONSTRAINT "pending_credits_updated_by_user_id_users_id_fk", ADD CONSTRAINT "pending_credits_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.pending_credits VALIDATE CONSTRAINT "pending_credits_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.prescription_kits DROP CONSTRAINT "prescription_kits_created_by_user_id_users_id_fk", ADD CONSTRAINT "prescription_kits_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.prescription_kits VALIDATE CONSTRAINT "prescription_kits_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.prescription_kits DROP CONSTRAINT "prescription_kits_updated_by_user_id_users_id_fk", ADD CONSTRAINT "prescription_kits_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.prescription_kits VALIDATE CONSTRAINT "prescription_kits_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.stock_counts DROP CONSTRAINT "stock_counts_created_by_user_id_users_id_fk", ADD CONSTRAINT "stock_counts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.stock_counts VALIDATE CONSTRAINT "stock_counts_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.stock_item_movements DROP CONSTRAINT "stock_item_movements_created_by_user_id_users_id_fk", ADD CONSTRAINT "stock_item_movements_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.stock_item_movements VALIDATE CONSTRAINT "stock_item_movements_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.stock_items DROP CONSTRAINT "stock_items_created_by_user_id_users_id_fk", ADD CONSTRAINT "stock_items_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.stock_items VALIDATE CONSTRAINT "stock_items_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.stock_items DROP CONSTRAINT "stock_items_updated_by_user_id_users_id_fk", ADD CONSTRAINT "stock_items_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.stock_items VALIDATE CONSTRAINT "stock_items_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.stock_purchases DROP CONSTRAINT "stock_purchases_created_by_user_id_users_id_fk", ADD CONSTRAINT "stock_purchases_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.stock_purchases VALIDATE CONSTRAINT "stock_purchases_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.stock_purchases DROP CONSTRAINT "stock_purchases_updated_by_user_id_users_id_fk", ADD CONSTRAINT "stock_purchases_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.stock_purchases VALIDATE CONSTRAINT "stock_purchases_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.stock_vendors DROP CONSTRAINT "stock_vendors_created_by_user_id_users_id_fk", ADD CONSTRAINT "stock_vendors_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.stock_vendors VALIDATE CONSTRAINT "stock_vendors_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.stock_vendors DROP CONSTRAINT "stock_vendors_updated_by_user_id_users_id_fk", ADD CONSTRAINT "stock_vendors_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.stock_vendors VALIDATE CONSTRAINT "stock_vendors_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.supplier_credits DROP CONSTRAINT "supplier_credits_created_by_user_id_users_id_fk", ADD CONSTRAINT "supplier_credits_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.supplier_credits VALIDATE CONSTRAINT "supplier_credits_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.supplier_credits DROP CONSTRAINT "supplier_credits_updated_by_user_id_users_id_fk", ADD CONSTRAINT "supplier_credits_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.supplier_credits VALIDATE CONSTRAINT "supplier_credits_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.supplier_manufacturers DROP CONSTRAINT "supplier_manufacturers_created_by_user_id_users_id_fk", ADD CONSTRAINT "supplier_manufacturers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.supplier_manufacturers VALIDATE CONSTRAINT "supplier_manufacturers_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.suppliers DROP CONSTRAINT "suppliers_created_by_user_id_users_id_fk", ADD CONSTRAINT "suppliers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.suppliers VALIDATE CONSTRAINT "suppliers_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.suppliers DROP CONSTRAINT "suppliers_updated_by_user_id_users_id_fk", ADD CONSTRAINT "suppliers_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.suppliers VALIDATE CONSTRAINT "suppliers_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.task_owner_changes DROP CONSTRAINT "task_owner_changes_created_by_user_id_users_id_fk", ADD CONSTRAINT "task_owner_changes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.task_owner_changes VALIDATE CONSTRAINT "task_owner_changes_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.task_rule_settings DROP CONSTRAINT "task_rule_settings_created_by_user_id_users_id_fk", ADD CONSTRAINT "task_rule_settings_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.task_rule_settings VALIDATE CONSTRAINT "task_rule_settings_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.task_rule_settings DROP CONSTRAINT "task_rule_settings_updated_by_user_id_users_id_fk", ADD CONSTRAINT "task_rule_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.task_rule_settings VALIDATE CONSTRAINT "task_rule_settings_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.tasks DROP CONSTRAINT "tasks_created_by_user_id_users_id_fk", ADD CONSTRAINT "tasks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.tasks VALIDATE CONSTRAINT "tasks_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE app.tasks DROP CONSTRAINT "tasks_updated_by_user_id_users_id_fk", ADD CONSTRAINT "tasks_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE app.tasks VALIDATE CONSTRAINT "tasks_updated_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE tenancy.membership_additional_roles DROP CONSTRAINT "membership_additional_roles_created_by_user_id_users_id_fk", ADD CONSTRAINT "membership_additional_roles_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES auth.users ("id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE tenancy.membership_additional_roles VALIDATE CONSTRAINT "membership_additional_roles_created_by_user_id_users_id_fk";

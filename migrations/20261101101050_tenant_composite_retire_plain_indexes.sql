-- migration-transaction: none reason="DROP INDEX CONCURRENTLY cannot run inside a transaction"
-- Migration: tenant_composite_retire_plain_indexes
-- Created: 2026-11-01T10:10:50.000Z
-- Reference: docs/reference/data/migrations.md
--
-- B2-5: the unique (organization_id, id) index that tenant_composite_index_prep builds on each
-- parent covers every plain organization_id index on that table, so these four are redundant (the
-- index hygiene gate fails on a plain index a longer index already serves). Each is dropped
-- CONCURRENTLY, after its replacement is valid. Queries by organization_id are served by the
-- unique index, which leads with organization_id.
DROP INDEX CONCURRENTLY IF EXISTS app.idx_invoice_items_organization_id;
--> statement-breakpoint
DROP INDEX CONCURRENTLY IF EXISTS app.idx_patient_check_ins_organization_id;
--> statement-breakpoint
DROP INDEX CONCURRENTLY IF EXISTS app.idx_patient_offerings_organization_id;
--> statement-breakpoint
DROP INDEX CONCURRENTLY IF EXISTS app.idx_patient_reviews_organization_id;

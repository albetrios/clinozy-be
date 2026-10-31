-- Migration: invoice_items_description
-- Created: 2026-10-31T04:03:23.581Z
-- Reference: docs/reference/data/migrations.md
--
-- feat-bill-line-description-2026-10-31-rjxx ROUTE #1 (decisions BD1, BD3): a bill line's optional
-- free text — "LHR Axilla 10 sessions =10*550", "+2 sessions free" — printed under its name. Typed
-- on the line (the bill writes and previews take it), never a snapshot of the offering or medicine.
-- Nullable, no default, no index (never filtered or sorted): a catalog-only ADD COLUMN, no table
-- rewrite. RLS is unchanged — the table's FORCE RLS organization policy covers every column.
-- The Cresence descriptions packed into bills' remarks move here in a later, separate backfill.

ALTER TABLE app.invoice_items
  ADD COLUMN IF NOT EXISTS description VARCHAR(280) NULL;

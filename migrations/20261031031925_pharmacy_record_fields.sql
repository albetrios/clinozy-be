-- Migration: pharmacy_record_fields
-- Created: 2026-10-31T03:19:25.711Z
-- Reference: docs/reference/data/migrations.md
--
-- change-pharmacy-record-fields: the pharmacy records keep what the old Cresence system knew.
-- A medicine gains its HSN code (4, 6 or 8 digits — the GST return's HSN summary), its pack label
-- as printed ("1*10", "30GM") and its units per pack (1 = sold in whole packs; above 1 = loose
-- strips or tablets sold one unit at a time — its stock then counts units). A batch and an order
-- line gain the MRP printed on the packs (a sale charges the batch's). A supplier gains its email
-- and address, a purchase order a note, and a bill line the HSN code snapshotted when billed.
--
-- Every column is nullable or carries a default, so no row is rewritten and every stored number
-- keeps its meaning (units_per_pack 1: a unit is a pack). Each CHECK is added NOT VALID and
-- validated after, so writers are never blocked for a scan.

ALTER TABLE app.medicines
  ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(8),
  ADD COLUMN IF NOT EXISTS pack_label VARCHAR(30),
  ADD COLUMN IF NOT EXISTS units_per_pack SMALLINT NOT NULL DEFAULT 1;

ALTER TABLE app.medicine_batches
  ADD COLUMN IF NOT EXISTS mrp NUMERIC(12, 2);

ALTER TABLE app.medical_purchase_order_items
  ADD COLUMN IF NOT EXISTS mrp NUMERIC(12, 2);

ALTER TABLE app.medical_purchase_orders
  ADD COLUMN IF NOT EXISTS note VARCHAR(500);

ALTER TABLE app.suppliers
  ADD COLUMN IF NOT EXISTS email VARCHAR(120),
  ADD COLUMN IF NOT EXISTS address VARCHAR(240);

ALTER TABLE app.invoice_items
  ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(8);

ALTER TABLE app.medicines
  ADD CONSTRAINT chk_medicines_hsn_code
  CHECK (hsn_code ~ '^[0-9]{4}([0-9]{2}){0,2}$')
  NOT VALID;

ALTER TABLE app.medicines
  VALIDATE CONSTRAINT chk_medicines_hsn_code;

ALTER TABLE app.medicines
  ADD CONSTRAINT chk_medicines_pack_label
  CHECK (char_length(pack_label) > 0)
  NOT VALID;

ALTER TABLE app.medicines
  VALIDATE CONSTRAINT chk_medicines_pack_label;

ALTER TABLE app.medicines
  ADD CONSTRAINT chk_medicines_units_per_pack
  CHECK (units_per_pack >= 1 AND units_per_pack <= 1000)
  NOT VALID;

ALTER TABLE app.medicines
  VALIDATE CONSTRAINT chk_medicines_units_per_pack;

ALTER TABLE app.medicine_batches
  ADD CONSTRAINT chk_medicine_batches_mrp
  CHECK (mrp > 0)
  NOT VALID;

ALTER TABLE app.medicine_batches
  VALIDATE CONSTRAINT chk_medicine_batches_mrp;

ALTER TABLE app.medical_purchase_order_items
  ADD CONSTRAINT chk_medical_purchase_order_items_mrp
  CHECK (mrp > 0)
  NOT VALID;

ALTER TABLE app.medical_purchase_order_items
  VALIDATE CONSTRAINT chk_medical_purchase_order_items_mrp;

ALTER TABLE app.medical_purchase_orders
  ADD CONSTRAINT chk_medical_purchase_orders_note
  CHECK (char_length(note) > 0)
  NOT VALID;

ALTER TABLE app.medical_purchase_orders
  VALIDATE CONSTRAINT chk_medical_purchase_orders_note;

ALTER TABLE app.suppliers
  ADD CONSTRAINT chk_suppliers_email
  CHECK (char_length(email) >= 3)
  NOT VALID;

ALTER TABLE app.suppliers
  VALIDATE CONSTRAINT chk_suppliers_email;

ALTER TABLE app.suppliers
  ADD CONSTRAINT chk_suppliers_address
  CHECK (char_length(address) > 0)
  NOT VALID;

ALTER TABLE app.suppliers
  VALIDATE CONSTRAINT chk_suppliers_address;

ALTER TABLE app.invoice_items
  ADD CONSTRAINT chk_invoice_items_hsn_code
  CHECK (hsn_code ~ '^[0-9]{4}([0-9]{2}){0,2}$')
  NOT VALID;

ALTER TABLE app.invoice_items
  VALIDATE CONSTRAINT chk_invoice_items_hsn_code;

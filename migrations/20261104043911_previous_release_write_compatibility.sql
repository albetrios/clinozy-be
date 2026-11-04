-- Migration: previous_release_write_compatibility
-- Created: 2026-11-04T04:39:11.115Z
-- Reference: docs/reference/data/migrations.md
--
-- Expand phase for the release after v9.4.1. A deploy migrates first and then swaps the containers, so
-- the previous release keeps writing while and after this release's migrations apply, and again after a
-- rollback to it. Four of those migrations refuse writes the previous release makes, and one leaves its
-- records without the upload binding this release reads. Each trigger below completes the previous
-- release's write in this release's shape. Triggers 2–6 act only on a shape this release never writes,
-- so this release's own writes, and a raw write that breaks a rule on purpose, still meet the
-- constraint. The binding triggers (1) fire on every write that carries keys, this release's too, and
-- do what its own bind does next in the same transaction — a no-op for it.
--
-- 1. Uploads (20261101090000_upload_record_binding): the previous release attaches a file to a record
--    without binding it, and this release signs a view link only for the record a file is bound to. An
--    AFTER trigger on each bindable record table binds the record's confirmed, unbound keys, as
--    UploadRepository.bindKeysToRecord does; a key bound to another record is left alone. Rows written
--    before this migration are bound by the backfill that follows it (upload_record_binding_backfill).
-- 2. Leads (20261030103639_leads_closed_at): the previous release closes a lead (check-in's
--    `clinic_visited`, or a status change to `lost`, `not_interested`, `invalid`) without `closed_at`,
--    and reopens one without clearing it. Only when a write changes `status`: a closing status with no
--    `closed_at` gets now(); a reopening that leaves `closed_at` as it was gets NULL. A write that sets
--    `closed_at` on an open lead is still refused (D13).
-- 3. Purchase lines (20261031042806_purchase_line_gst): the previous release inserts a line without its
--    GST. A line inserted with no `gst_percent` takes its medicine's rate, GST-inclusive, the taxable
--    value round(amount × 100 ÷ (100 + rate), 2) and the GST the rest — the PG8 fill of that migration
--    and this release's default — so `amount` is unchanged. The previous release writes an order before
--    its lines, so such a line also re-splits its order's total over the lines that count.
-- 4. Purchase orders (same migration): the previous release writes `total` and leaves the split at its
--    defaults. An insert with total > 0 and both parts 0, or an update of `total` that leaves both parts
--    as they were and no longer adds up, splits `total` into the taxable value of the lines that count
--    (every line while ordered, the received ones once received; never more than `total`) and the GST.
--    So does a receive (`stage` changes) that leaves the total and both parts as they were — a line
--    not ticked and an unordered one of the same amount keep the total, not the split.
-- 5. Received lines (20261101054040_purchase_line_received_quantities): the previous release marks a
--    line received without a received quantity. A line that becomes received with neither quantity
--    takes received = ordered, the same fill as SD10.
-- 6. Contacts (20261031040602_contacts_date_of_birth_is_approximate): the previous release clears
--    `date_of_birth` without the flag. An update that empties the date and leaves the flag on turns it
--    off — this release's own rule (AG2: a sent date of birth, or null, is a real one).
--
-- Every function runs as the writer (SECURITY INVOKER), inside the writer's organization context, so
-- row-level security applies to what it reads and writes; no policy or FORCE ROW LEVEL SECURITY
-- changes. CREATE TRIGGER takes a SHARE ROW EXCLUSIVE lock on each table (blocking its writes, not its
-- reads) until the file commits; they are taken in the order the previous release writes the tables —
-- a contact before its records, a record before its activity entry, the entry before the lead it
-- moves, an order before its lines — and a deadlock with a write that goes the other way is retried
-- by the runner (SQLSTATE 40P01).
--
-- Temporary: once no previous-release container can write again (this release is live and a rollback
-- past it is ruled out), a contract migration drops these triggers and functions. Tracked in
-- docs/reference/data/migrations.md → "Previous-release write compatibility".

CREATE OR REPLACE FUNCTION app.fn_contacts_date_of_birth_for_previous_release() RETURNS trigger
LANGUAGE plpgsql
SET search_path = app, pg_catalog
AS $$
BEGIN
  IF NEW.date_of_birth IS NULL
    AND OLD.date_of_birth IS NOT NULL
    AND NEW.date_of_birth_is_approximate
    AND OLD.date_of_birth_is_approximate THEN
    NEW.date_of_birth_is_approximate := false;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER trg_contacts_date_of_birth_for_previous_release
BEFORE UPDATE OF date_of_birth ON app.contacts
FOR EACH ROW EXECUTE FUNCTION app.fn_contacts_date_of_birth_for_previous_release();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.fn_bind_record_upload_keys_for_previous_release() RETURNS trigger
LANGUAGE plpgsql
SET search_path = app, pg_catalog
AS $$
DECLARE
  -- TG_ARGV[0]: the record kind an upload stores as `bound_resource`; TG_ARGV[1]: the record's key
  -- column (one key, or an array of keys).
  key_value jsonb := to_jsonb(NEW) -> TG_ARGV[1];
  file_keys text[];
BEGIN
  file_keys := CASE jsonb_typeof(key_value)
    WHEN 'array' THEN ARRAY(SELECT jsonb_array_elements_text(key_value))
    WHEN 'string' THEN ARRAY[key_value #>> '{}']
    ELSE ARRAY[]::text[]
  END;
  IF cardinality(file_keys) = 0 THEN
    RETURN NULL;
  END IF;
  UPDATE upload.uploads
  SET bound_resource = TG_ARGV[0],
      bound_public_id = NEW.public_id,
      updated_at = now()
  WHERE organization_id = NEW.organization_id
    AND file_key = ANY (file_keys)
    AND status = 'UPLOADED'
    AND deleted_at IS NULL
    AND bound_public_id IS NULL;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER trg_patient_images_bind_upload_keys_for_previous_release
AFTER INSERT OR UPDATE OF file_key ON app.patient_images
FOR EACH ROW EXECUTE FUNCTION app.fn_bind_record_upload_keys_for_previous_release('patient_image', 'file_key');
--> statement-breakpoint
CREATE TRIGGER trg_patient_reports_bind_upload_keys_for_previous_release
AFTER INSERT OR UPDATE OF file_keys ON app.patient_reports
FOR EACH ROW WHEN (cardinality(NEW.file_keys) > 0)
EXECUTE FUNCTION app.fn_bind_record_upload_keys_for_previous_release('patient_report', 'file_keys');
--> statement-breakpoint
CREATE TRIGGER trg_patient_reviews_bind_upload_keys_for_previous_release
AFTER INSERT OR UPDATE OF file_keys ON app.patient_reviews
FOR EACH ROW WHEN (cardinality(NEW.file_keys) > 0)
EXECUTE FUNCTION app.fn_bind_record_upload_keys_for_previous_release('patient_review', 'file_keys');
--> statement-breakpoint
CREATE TRIGGER trg_payments_bind_upload_keys_for_previous_release
AFTER INSERT OR UPDATE OF attachment_keys ON app.payments
FOR EACH ROW WHEN (cardinality(NEW.attachment_keys) > 0)
EXECUTE FUNCTION app.fn_bind_record_upload_keys_for_previous_release('payment', 'attachment_keys');
--> statement-breakpoint
CREATE TRIGGER trg_contact_activities_bind_upload_keys_for_previous_release
AFTER INSERT OR UPDATE OF attachment_keys ON app.contact_activities
FOR EACH ROW WHEN (cardinality(NEW.attachment_keys) > 0)
EXECUTE FUNCTION app.fn_bind_record_upload_keys_for_previous_release('contact_activity', 'attachment_keys');
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.fn_leads_closed_at_for_previous_release() RETURNS trigger
LANGUAGE plpgsql
SET search_path = app, pg_catalog
AS $$
BEGIN
  -- The closing statuses of chk_leads_closed_at (LEAD_CLOSED_STATUS_VALUES).
  IF NEW.status IN ('not_interested', 'invalid', 'lost', 'clinic_visited') THEN
    IF NEW.closed_at IS NULL THEN
      NEW.closed_at := now();
    END IF;
  ELSIF TG_OP = 'UPDATE'
    AND OLD.status IN ('not_interested', 'invalid', 'lost', 'clinic_visited')
    AND NEW.closed_at IS NOT DISTINCT FROM OLD.closed_at THEN
    NEW.closed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER trg_leads_closed_at_for_previous_release
BEFORE INSERT OR UPDATE OF status ON app.leads
FOR EACH ROW EXECUTE FUNCTION app.fn_leads_closed_at_for_previous_release();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.fn_medical_purchase_orders_split_for_previous_release() RETURNS trigger
LANGUAGE plpgsql
SET search_path = app, pg_catalog
AS $$
DECLARE
  counted_taxable numeric(12, 2);
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.stage IS DISTINCT FROM OLD.stage
    AND NEW.total = OLD.total
    AND NEW.taxable_total = OLD.taxable_total
    AND NEW.gst_total = OLD.gst_total THEN
    -- A receive that kept the ordered total (a line not ticked, an unordered line of the same
    -- amount) still holds the ordered split: count the received lines below.
    NULL;
  ELSIF NEW.total = NEW.taxable_total + NEW.gst_total THEN
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.taxable_total <> 0 OR NEW.gst_total <> 0 THEN
      RETURN NEW;
    END IF;
  ELSIF NEW.taxable_total IS DISTINCT FROM OLD.taxable_total
    OR NEW.gst_total IS DISTINCT FROM OLD.gst_total THEN
    RETURN NEW;
  END IF;
  SELECT coalesce(sum(item.taxable_amount), 0) INTO counted_taxable
  FROM app.medical_purchase_order_items AS item
  WHERE item.medical_purchase_order_id = NEW.id
    AND (NEW.stage = 'ordered' OR item.is_received IS TRUE);
  NEW.taxable_total := least(NEW.total, counted_taxable);
  NEW.gst_total := NEW.total - NEW.taxable_total;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER trg_medical_purchase_orders_split_for_previous_release
BEFORE INSERT OR UPDATE OF total ON app.medical_purchase_orders
FOR EACH ROW EXECUTE FUNCTION app.fn_medical_purchase_orders_split_for_previous_release();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.fn_medical_purchase_order_items_fill_for_previous_release() RETURNS trigger
LANGUAGE plpgsql
SET search_path = app, pg_catalog
AS $$
DECLARE
  medicine_gst_percent smallint;
  counted_taxable numeric(12, 2);
BEGIN
  IF NEW.is_received IS TRUE
    AND NEW.received_quantity IS NULL
    AND NEW.received_free_quantity IS NULL
    AND (TG_OP = 'INSERT' OR OLD.is_received IS NOT TRUE) THEN
    NEW.received_quantity := NEW.quantity;
    NEW.received_free_quantity := NEW.free_quantity;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.gst_percent IS NULL THEN
    SELECT medicine.gst_percent INTO medicine_gst_percent
    FROM app.medicines AS medicine
    WHERE medicine.id = NEW.medicine_id;
    NEW.gst_percent := coalesce(medicine_gst_percent, 0);
    NEW.is_gst_inclusive := true;
    NEW.taxable_amount := round(NEW.amount * 100 / (100 + NEW.gst_percent), 2);
    NEW.gst_amount := NEW.amount - NEW.taxable_amount;

    -- The order was written first, with its total and no split: split it over the lines that count,
    -- this one included (rows the same INSERT wrote before this one are visible here).
    SELECT coalesce(sum(item.taxable_amount), 0)
      + CASE WHEN purchase_order.stage = 'ordered' OR NEW.is_received IS TRUE
          THEN NEW.taxable_amount ELSE 0 END
    INTO counted_taxable
    FROM app.medical_purchase_orders AS purchase_order
    LEFT JOIN app.medical_purchase_order_items AS item
      ON item.medical_purchase_order_id = purchase_order.id
      AND (purchase_order.stage = 'ordered' OR item.is_received IS TRUE)
    WHERE purchase_order.id = NEW.medical_purchase_order_id
    GROUP BY purchase_order.stage;

    UPDATE app.medical_purchase_orders AS purchase_order
    SET taxable_total = least(purchase_order.total, coalesce(counted_taxable, 0)),
        gst_total = purchase_order.total - least(purchase_order.total, coalesce(counted_taxable, 0))
    WHERE purchase_order.id = NEW.medical_purchase_order_id;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER trg_medical_purchase_order_items_fill_for_previous_release
BEFORE INSERT OR UPDATE OF is_received ON app.medical_purchase_order_items
FOR EACH ROW EXECUTE FUNCTION app.fn_medical_purchase_order_items_fill_for_previous_release();

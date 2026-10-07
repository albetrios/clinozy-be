-- The clinic profile on the organization (launch-2026-09-30-jxmr, ROUTE #1, decision D7).
--
-- The launch's Organization (schema-routes.md:138–149) is the existing tenancy.organizations row,
-- extended: what the clinic practises (specialties — the drop's offering_specialty values, 1–6 of
-- them), the IANA timezone its timed work runs in, and its one currency (INR, server-set). The
-- slug and name are the ones the organization already has.
--
-- Each column is NOT NULL with a constant default: a metadata-only change on Postgres 17 (no table
-- rewrite), and every existing organization takes the launch defaults. The CHECKs go in NOT VALID,
-- then validate without blocking writers. IANA validity of the timezone is the validator's job (a
-- CHECK cannot consult the timezone catalog immutably).

ALTER TABLE tenancy.organizations
  ADD COLUMN IF NOT EXISTS specialties TEXT[] NOT NULL DEFAULT ARRAY['skin']::text[];
--> statement-breakpoint

ALTER TABLE tenancy.organizations
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata';
--> statement-breakpoint

ALTER TABLE tenancy.organizations
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'INR';
--> statement-breakpoint

ALTER TABLE tenancy.organizations DROP CONSTRAINT IF EXISTS chk_organizations_specialties_allowed;
--> statement-breakpoint

ALTER TABLE tenancy.organizations
  ADD CONSTRAINT chk_organizations_specialties_allowed
  CHECK (specialties <@ ARRAY['skin', 'hair', 'dental', 'gynac', 'physio', 'general']::text[]) NOT VALID;
--> statement-breakpoint

ALTER TABLE tenancy.organizations VALIDATE CONSTRAINT chk_organizations_specialties_allowed;
--> statement-breakpoint

ALTER TABLE tenancy.organizations DROP CONSTRAINT IF EXISTS chk_organizations_specialties_count;
--> statement-breakpoint

ALTER TABLE tenancy.organizations
  ADD CONSTRAINT chk_organizations_specialties_count
  CHECK (cardinality(specialties) BETWEEN 1 AND 6) NOT VALID;
--> statement-breakpoint

ALTER TABLE tenancy.organizations VALIDATE CONSTRAINT chk_organizations_specialties_count;
--> statement-breakpoint

ALTER TABLE tenancy.organizations DROP CONSTRAINT IF EXISTS chk_organizations_currency;
--> statement-breakpoint

ALTER TABLE tenancy.organizations
  ADD CONSTRAINT chk_organizations_currency CHECK (currency = 'INR') NOT VALID;
--> statement-breakpoint

ALTER TABLE tenancy.organizations VALIDATE CONSTRAINT chk_organizations_currency;

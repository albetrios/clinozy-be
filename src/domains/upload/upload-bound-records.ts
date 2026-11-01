import { contact_activities } from '@/domains/app/sub-domains/contacts/contact-activities/contact-activities.schema.js';
import { payments } from '@/domains/app/sub-domains/billing/payments/payments.schema.js';
import { patient_images } from '@/domains/app/sub-domains/patients/patient-images/patient-images.schema.js';
import { patient_reports } from '@/domains/app/sub-domains/patients/patient-reports/patient-reports.schema.js';
import { patient_reviews } from '@/domains/app/sub-domains/patients/patient-reviews/patient-reviews.schema.js';
import { UPLOAD_RECORD_RESOURCE } from '@/domains/app/base-record.types.js';
import type { PgTable, AnyPgColumn } from 'drizzle-orm/pg-core';

/**
 * The record tables an upload can be bound to (C-2), by the `bound_resource` each stores — the
 * sweep that tombstones the uploads of a record that is gone (G2-5) reads them.
 *
 * @remarks
 * - **Notes:** a join-only read of the records' tables (`NOT EXISTS`), the same exception the upload
 *   schema already takes for the tenancy and user tables. Keep it in step with the `resource` each
 *   record's `uploadFields` names — pinned by `upload-bound-records.unit.test.ts`.
 */
export const UPLOAD_BOUND_RECORD_TABLES: Readonly<
  Record<string, { table: PgTable; publicId: AnyPgColumn }>
> = {
  [UPLOAD_RECORD_RESOURCE.PATIENT_REVIEW]: {
    table: patient_reviews,
    publicId: patient_reviews.public_id,
  },
  [UPLOAD_RECORD_RESOURCE.PATIENT_REPORT]: {
    table: patient_reports,
    publicId: patient_reports.public_id,
  },
  [UPLOAD_RECORD_RESOURCE.PATIENT_IMAGE]: {
    table: patient_images,
    publicId: patient_images.public_id,
  },
  [UPLOAD_RECORD_RESOURCE.CONTACT_ACTIVITY]: {
    table: contact_activities,
    publicId: contact_activities.public_id,
  },
  [UPLOAD_RECORD_RESOURCE.PAYMENT]: { table: payments, publicId: payments.public_id },
};

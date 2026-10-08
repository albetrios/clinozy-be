import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  calendarDateSchema,
  expectedUpdatedAtSchema,
  instantSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  PATIENT_REPORT_FILE_KEYS_MAX,
  PATIENT_REPORT_NOTES_MAX,
  PATIENT_REPORT_TYPE_VALUES,
} from './patient-reports.constants.js';

/** True when every entry of a list is different. */
const distinct = (values: readonly unknown[]) => new Set(values).size === values.length;

/** The fields a report is written with (7.G.8 #40, #42) — each optional; create and update narrow them. */
const reportFields = {
  type: z.enum(PATIENT_REPORT_TYPE_VALUES),
  name: trimmedStringMinMax(1, 120),
  report_date: calendarDateSchema,
  file_keys: z
    .array(trimmedStringMinMax(1, 512))
    .max(PATIENT_REPORT_FILE_KEYS_MAX)
    .refine(distinct, { message: 'Each file once' }),
  notes: trimmedStringMinMax(1, PATIENT_REPORT_NOTES_MAX).nullable(),
};

/** Path params of the by-id `patient-reports` routes (nested under the patient). */
export const patientReportsIdParamsDto = z
  .object({
    patient_id: recordIdSchema,
    patient_report_id: recordIdSchema,
  })
  .strict();

/** Path params of the `patient-reports` routes nested under their patient. */
export const patientReportsParentParamsDto = z
  .object({
    patient_id: recordIdSchema,
  })
  .strict();

/**
 * Body of `POST /app/patients/{patient_id}/reports` (routes-final 7.G.8 #40): `name*`,
 * `report_date*`; optional `type`, `file_keys` (up to 10 confirmed uploads, P29), `notes` (≤ 1000).
 */
export const CreatePatientReportDto = z
  .object({
    name: reportFields.name,
    report_date: reportFields.report_date,
    type: reportFields.type.optional(),
    file_keys: reportFields.file_keys.optional(),
    notes: reportFields.notes.optional(),
  })
  .strict();

/** Body of `PATCH …/reports/{patient_report_id}` (7.G.8 #42): any of #40's fields (at least one); `expected_updated_at` refuses a stale save (D43). */
export const UpdatePatientReportDto = z
  .object({
    name: reportFields.name.optional(),
    report_date: reportFields.report_date.optional(),
    type: reportFields.type.optional(),
    file_keys: reportFields.file_keys.optional(),
    notes: reportFields.notes.optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of a patient's reports (7.G.8 #39): `type`, `q` (the name); sort `report_date` (default, newest first) | `created_at`. */
export const listPatientReportsQueryDto = listSearchSortSchema([
  'report_date',
  'created_at',
] as const)
  .extend({
    type: z.enum(PATIENT_REPORT_TYPE_VALUES).optional(),
    created_from: instantSchema.optional(),
    created_to: instantSchema.optional(),
  })
  .strict();

/** Parsed {@link CreatePatientReportDto}. */
export type CreatePatientReportInput = z.infer<typeof CreatePatientReportDto>;
/** Parsed {@link UpdatePatientReportDto}. */
export type UpdatePatientReportInput = z.infer<typeof UpdatePatientReportDto>;

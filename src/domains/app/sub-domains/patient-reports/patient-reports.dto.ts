import { z } from 'zod';
import { listSearchSortSchema } from '@/shared/utils/http/list-query.util.js';
import { trimmedString, trimmedStringMinMax } from '@/shared/utils/validation/validation.util.js';
import {
  calendarDateSchema,
  expectedUpdatedAtSchema,
  recordIdSchema,
} from '@/shared/utils/validation/record-fields.util.js';
import { PATIENT_REPORT_TYPE_VALUES } from './patient-reports.constants.js';

/** Path params of the by-id `patient-reports` routes. */
export const patientReportsIdParamsDto = z
  .object({
    patient_report_id: recordIdSchema,
  })
  .strict();

/** Path params of the `patient-reports` routes nested under their patient. */
export const patientReportsParentParamsDto = z
  .object({
    patient_id: recordIdSchema,
  })
  .strict();

/** Body of the create route — a new patient report. */
export const CreatePatientReportDto = z
  .object({
    type: z.enum(PATIENT_REPORT_TYPE_VALUES).optional(),
    name: trimmedStringMinMax(1, 120),
    report_date: calendarDateSchema,
    file_keys: z.array(trimmedStringMinMax(1, 512)).max(10).optional(),
    notes: trimmedString().max(1000).nullable().optional(),
  })
  .strict();

/** Body of `PATCH /app/patient-reports/{patient_report_id}` — any field (null clears an optional one); `expected_updated_at` refuses a stale save (D43). */
export const UpdatePatientReportDto = z
  .object({
    type: z.enum(PATIENT_REPORT_TYPE_VALUES).optional(),
    name: trimmedStringMinMax(1, 120).optional(),
    report_date: calendarDateSchema.optional(),
    file_keys: z.array(trimmedStringMinMax(1, 512)).max(10).optional(),
    notes: trimmedString().max(1000).nullable().optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/** Query of the `patient-reports` list — keyset paging, `q` search, sort and filters. */
export const listPatientReportsQueryDto = listSearchSortSchema([
  'created_at',
  'report_date',
] as const)
  .extend({
    type: z.enum(PATIENT_REPORT_TYPE_VALUES).optional(),
    created_from: z.iso.datetime({ offset: true }).optional(),
    created_to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

/** Parsed {@link CreatePatientReportDto}. */
export type CreatePatientReportInput = z.infer<typeof CreatePatientReportDto>;
/** Parsed {@link UpdatePatientReportDto}. */
export type UpdatePatientReportInput = z.infer<typeof UpdatePatientReportDto>;

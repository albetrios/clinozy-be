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
  PATIENT_PRESCRIPTION_ITEMS_MAX,
  PATIENT_PRESCRIPTION_PRINT_LANGUAGE_VALUES,
  PATIENT_PRESCRIPTION_STATUS_VALUES,
  PATIENT_PRESCRIPTION_TEXT_MAX,
} from './patient-prescriptions.constants.js';

/** When a line's doses are taken. */
const LINE_TIMING_VALUES = [
  'empty_stomach',
  'with_meal',
  'morning',
  'night',
  'morning_night',
  'thrice_week',
  'once_week',
  'alternate_days',
] as const;

/** Where a line's medicine is applied (a prescription's own list — 7.C.6). */
const LINE_BODY_PART_VALUES = [
  'face',
  'scalp',
  'hair',
  'body',
  'chest',
  'back',
  'underarm',
  'legs',
  'arms',
  'other',
] as const;

/** A dose of one time of day: none, one or two. */
const doseSchema = z.number().int().min(0).max(2);

/**
 * One prescription line (routes-final 7.C.6) — a prescription's and a kit's (P16, P17):
 * `medicine_name*` (1–120), `medicine_id` (a live medicine, P15), doses, SOS, meal, timing, body
 * part, quantity, remarks.
 */
export const PatientPrescriptionLineDto = z
  .object({
    medicine_name: trimmedStringMinMax({ min: 1, max: 120 }),
    medicine_id: recordIdSchema.nullable().optional(),
    dose_morning: doseSchema.optional(),
    dose_afternoon: doseSchema.optional(),
    dose_night: doseSchema.optional(),
    is_sos: z.boolean().optional(),
    meal: z.enum(['before', 'after']).nullable().optional(),
    timing: z.enum(LINE_TIMING_VALUES).nullable().optional(),
    timing_text: trimmedStringMinMax({ min: 1, max: 40 }).nullable().optional(),
    body_part: z.enum(LINE_BODY_PART_VALUES).nullable().optional(),
    body_part_text: trimmedStringMinMax({ min: 1, max: 40 }).nullable().optional(),
    quantity: z.number().int().min(1).max(999).optional(),
    remarks: trimmedStringMinMax({ min: 1, max: 200 }).nullable().optional(),
  })
  .strict();

/** A prescription's or a kit's lines — up to 30 (P16). */
export const patientPrescriptionItemsSchema = z
  .array(PatientPrescriptionLineDto)
  .max(PATIENT_PRESCRIPTION_ITEMS_MAX);

/** An advice, lab report or procedure text — up to 2000. */
const prescriptionTextSchema = trimmedStringMinMax({
  min: 1,
  max: PATIENT_PRESCRIPTION_TEXT_MAX,
}).nullable();

/** The fields a prescription is written with (7.C.8 #15, #17) — each optional; create and update narrow them. */
const prescriptionFields = {
  doctor_membership_id: recordIdSchema,
  prescription_date: calendarDateSchema,
  appointment_id: recordIdSchema.nullable(),
  items: patientPrescriptionItemsSchema,
  advice: prescriptionTextSchema,
  lab_report: prescriptionTextSchema,
  procedure_today: prescriptionTextSchema,
  follow_up_date: calendarDateSchema.nullable(),
  print_language: z.enum(PATIENT_PRESCRIPTION_PRINT_LANGUAGE_VALUES),
};

/** Path params of the by-id `patient-prescriptions` routes (nested under the patient). */
export const patientPrescriptionsIdParamsDto = z
  .object({
    patient_id: recordIdSchema,
    patient_prescription_id: recordIdSchema,
  })
  .strict();

/** Path params of the `patient-prescriptions` routes nested under their patient. */
export const patientPrescriptionsParentParamsDto = z
  .object({
    patient_id: recordIdSchema,
  })
  .strict();

/**
 * Body of `POST /app/patients/{patient_id}/prescriptions` (routes-final 7.C.8 #15): the doctor and
 * the date; optional visit, lines (up to 30), advice, lab report, procedure today, follow-up date,
 * print language. A new prescription is a `draft`.
 */
export const CreatePatientPrescriptionDto = z
  .object({
    doctor_membership_id: prescriptionFields.doctor_membership_id,
    prescription_date: prescriptionFields.prescription_date,
    appointment_id: prescriptionFields.appointment_id.optional(),
    items: prescriptionFields.items.optional(),
    advice: prescriptionFields.advice.optional(),
    lab_report: prescriptionFields.lab_report.optional(),
    procedure_today: prescriptionFields.procedure_today.optional(),
    follow_up_date: prescriptionFields.follow_up_date.optional(),
    print_language: prescriptionFields.print_language.optional(),
  })
  .strict();

/**
 * Body of `PATCH …/prescriptions/{patient_prescription_id}` (7.C.8 #17): any field of the create
 * (at least one; null clears an optional one) — a draft only; `expected_updated_at` refuses a stale
 * save (D43).
 */
export const UpdatePatientPrescriptionDto = z
  .object({
    doctor_membership_id: prescriptionFields.doctor_membership_id.optional(),
    prescription_date: prescriptionFields.prescription_date.optional(),
    appointment_id: prescriptionFields.appointment_id.optional(),
    items: prescriptionFields.items.optional(),
    advice: prescriptionFields.advice.optional(),
    lab_report: prescriptionFields.lab_report.optional(),
    procedure_today: prescriptionFields.procedure_today.optional(),
    follow_up_date: prescriptionFields.follow_up_date.optional(),
    print_language: prescriptionFields.print_language.optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expected_updated_at'), {
    message: 'Send at least one field',
  });

/**
 * Query of the prescription lists (7.C.8 #13, #14) — `q` (the prescription number only, `RX-500`
 * or `#500`), `status`, `doctor_membership_id`, `appointment_id`, the prescription-date range, and
 * on the pharmacy queue `patient_id` (the nested list's path wins, TR3); sort `created_at` (default,
 * newest first) | `prescription_date`.
 */
export const listPatientPrescriptionsQueryDto = listSearchSortSchema([
  'created_at',
  'prescription_date',
] as const)
  .extend({
    status: z.enum(PATIENT_PRESCRIPTION_STATUS_VALUES).optional(),
    doctor_membership_id: recordIdSchema.optional(),
    appointment_id: recordIdSchema.optional(),
    patient_id: recordIdSchema.optional(),
    // MDC4: the pharmacy queue — filled by a live medical sale, or not yet
    is_filled: z.enum(['true', 'false']).optional(),
    prescription_date_from: calendarDateSchema.optional(),
    prescription_date_to: calendarDateSchema.optional(),
    created_from: instantSchema.optional(),
    created_to: instantSchema.optional(),
  })
  .strict();

/** Parsed {@link CreatePatientPrescriptionDto}. */
export type CreatePatientPrescriptionInput = z.infer<typeof CreatePatientPrescriptionDto>;
/** Parsed {@link UpdatePatientPrescriptionDto}. */
export type UpdatePatientPrescriptionInput = z.infer<typeof UpdatePatientPrescriptionDto>;
/** One parsed {@link PatientPrescriptionLineDto}. */
export type PatientPrescriptionLine = z.infer<typeof PatientPrescriptionLineDto>;

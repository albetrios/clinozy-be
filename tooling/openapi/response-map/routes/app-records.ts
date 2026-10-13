/** OpenAPI success responses — the app record tables (launch iteration, generated from the table specs). */
import type { ResponseDefinition } from '@tooling/openapi/response-map/building-blocks.js';
import {
  wrapPaginated,
  wrapSuccess,
  wrapUncountedPaginated,
} from '@tooling/openapi/response-map/building-blocks.js';
import * as schemas from '@tooling/openapi/response-map/resource-schemas.js';

export const appRecordRouteResponses: Record<string, ResponseDefinition> = {
  'GET /api/v1/app/offering-groups': {
    statusCode: 200,
    schema: wrapPaginated(schemas.offeringGroupsRecordSchema, [
      schemas.offeringGroupsRecordExample,
    ]),
    example: null,
  },
  'POST /api/v1/app/offering-groups': {
    statusCode: 200,
    schema: wrapSuccess(schemas.offeringGroupsRecordSchema, schemas.offeringGroupsRecordExample),
    example: null,
  },
  'GET /api/v1/app/offering-groups/{offering_group_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.offeringGroupsRecordSchema, schemas.offeringGroupsRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/offering-groups/{offering_group_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.offeringGroupsRecordSchema, schemas.offeringGroupsRecordExample),
    example: null,
  },
  'DELETE /api/v1/app/offering-groups/{offering_group_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  'POST /api/v1/app/offering-groups/{offering_group_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.offeringGroupsRecordSchema, schemas.offeringGroupsRecordExample),
    example: null,
  },
  'GET /api/v1/app/branches/{branch_id}/rooms': {
    statusCode: 200,
    schema: wrapPaginated(schemas.roomsRecordSchema, [schemas.roomsRecordExample]),
    example: null,
  },
  'POST /api/v1/app/branches/{branch_id}/rooms': {
    statusCode: 200,
    schema: wrapSuccess(schemas.roomsRecordSchema, schemas.roomsRecordExample),
    example: null,
  },
  'GET /api/v1/app/branches/{branch_id}/rooms/{branch_room_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.roomsRecordSchema, schemas.roomsRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/branches/{branch_id}/rooms/{branch_room_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.roomsRecordSchema, schemas.roomsRecordExample),
    example: null,
  },
  'DELETE /api/v1/app/branches/{branch_id}/rooms/{branch_room_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  'POST /api/v1/app/branches/{branch_id}/rooms/{branch_room_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.roomsRecordSchema, schemas.roomsRecordExample),
    example: null,
  },
  'GET /api/v1/app/branches/{branch_id}/machines': {
    statusCode: 200,
    schema: wrapPaginated(schemas.machinesRecordSchema, [schemas.machinesRecordExample]),
    example: null,
  },
  'POST /api/v1/app/branches/{branch_id}/machines': {
    statusCode: 200,
    schema: wrapSuccess(schemas.machinesRecordSchema, schemas.machinesRecordExample),
    example: null,
  },
  'GET /api/v1/app/branches/{branch_id}/machines/{branch_machine_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.machinesRecordSchema, schemas.machinesRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/branches/{branch_id}/machines/{branch_machine_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.machinesRecordSchema, schemas.machinesRecordExample),
    example: null,
  },
  'DELETE /api/v1/app/branches/{branch_id}/machines/{branch_machine_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  'POST /api/v1/app/branches/{branch_id}/machines/{branch_machine_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.machinesRecordSchema, schemas.machinesRecordExample),
    example: null,
  },
  'GET /api/v1/app/branches/{branch_id}/holidays': {
    statusCode: 200,
    schema: wrapPaginated(schemas.branchHolidaysRecordSchema, [
      schemas.branchHolidaysRecordExample,
    ]),
    example: null,
  },
  'POST /api/v1/app/branches/{branch_id}/holidays': {
    statusCode: 200,
    schema: wrapSuccess(schemas.branchHolidaysRecordSchema, schemas.branchHolidaysRecordExample),
    example: null,
  },
  'GET /api/v1/app/branches/{branch_id}/holidays/{branch_holiday_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.branchHolidaysRecordSchema, schemas.branchHolidaysRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/branches/{branch_id}/holidays/{branch_holiday_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.branchHolidaysRecordSchema, schemas.branchHolidaysRecordExample),
    example: null,
  },
  'DELETE /api/v1/app/branches/{branch_id}/holidays/{branch_holiday_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  'POST /api/v1/app/branches/{branch_id}/holidays/{branch_holiday_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.branchHolidaysRecordSchema, schemas.branchHolidaysRecordExample),
    example: null,
  },
  'GET /api/v1/app/offerings': {
    statusCode: 200,
    schema: wrapPaginated(schemas.offeringsRecordSchema, [schemas.offeringsRecordExample]),
    example: null,
  },
  'GET /api/v1/app/offerings/exports': {
    statusCode: 200,
    schema: wrapSuccess(schemas.recordExportSchema, schemas.recordExportExample),
    example: null,
  },
  'POST /api/v1/app/offerings': {
    statusCode: 200,
    schema: wrapSuccess(schemas.offeringsRecordSchema, schemas.offeringsRecordExample),
    example: null,
  },
  'GET /api/v1/app/offerings/{offering_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.offeringsRecordSchema, schemas.offeringsRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/offerings/{offering_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.offeringsRecordSchema, schemas.offeringsRecordExample),
    example: null,
  },
  'DELETE /api/v1/app/offerings/{offering_id}': { statusCode: 204, schema: null, example: null },
  'POST /api/v1/app/offerings/{offering_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.offeringsRecordSchema, schemas.offeringsRecordExample),
    example: null,
  },
  'GET /api/v1/app/offers': {
    statusCode: 200,
    schema: wrapPaginated(schemas.offersRecordSchema, [schemas.offersRecordExample]),
    example: null,
  },
  'POST /api/v1/app/offers': {
    statusCode: 200,
    schema: wrapSuccess(schemas.offersRecordSchema, schemas.offersRecordExample),
    example: null,
  },
  'GET /api/v1/app/offers/{offer_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.offersRecordSchema, schemas.offersRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/offers/{offer_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.offersRecordSchema, schemas.offersRecordExample),
    example: null,
  },
  'DELETE /api/v1/app/offers/{offer_id}': { statusCode: 204, schema: null, example: null },
  'POST /api/v1/app/offers/{offer_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.offersRecordSchema, schemas.offersRecordExample),
    example: null,
  },
  'GET /api/v1/app/patients': {
    statusCode: 200,
    schema: wrapPaginated(schemas.patientsRecordSchema, [schemas.patientsRecordExample]),
    example: null,
  },
  'GET /api/v1/app/patients/exports': {
    statusCode: 200,
    schema: wrapSuccess(schemas.recordExportSchema, schemas.recordExportExample),
    example: null,
  },
  'POST /api/v1/app/patients': {
    statusCode: 200,
    schema: wrapSuccess(schemas.patientsRecordSchema, schemas.patientsRecordExample),
    example: null,
  },
  'GET /api/v1/app/patients/{patient_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.patientsRecordSchema, schemas.patientsRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/patients/{patient_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.patientsRecordSchema, schemas.patientsRecordExample),
    example: null,
  },
  'DELETE /api/v1/app/patients/{patient_id}': { statusCode: 204, schema: null, example: null },
  'POST /api/v1/app/patients/{patient_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.patientsRecordSchema, schemas.patientsRecordExample),
    example: null,
  },
  'GET /api/v1/app/leads': {
    statusCode: 200,
    schema: wrapPaginated(schemas.leadsRecordSchema, [schemas.leadsRecordExample]),
    example: null,
  },
  'GET /api/v1/app/leads/exports': {
    statusCode: 200,
    schema: wrapSuccess(schemas.recordExportSchema, schemas.recordExportExample),
    example: null,
  },
  'POST /api/v1/app/leads': {
    statusCode: 200,
    schema: wrapSuccess(schemas.leadsRecordSchema, schemas.leadsRecordExample),
    example: null,
  },
  'GET /api/v1/app/leads/{lead_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.leadsRecordSchema, schemas.leadsRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/leads/{lead_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.leadsRecordSchema, schemas.leadsRecordExample),
    example: null,
  },
  'POST /api/v1/app/leads/{lead_id}/claim': {
    statusCode: 200,
    schema: wrapSuccess(schemas.leadsRecordSchema, schemas.leadsRecordExample),
    example: null,
  },
  'POST /api/v1/app/leads/{lead_id}/release': {
    statusCode: 200,
    schema: wrapSuccess(schemas.leadsRecordSchema, schemas.leadsRecordExample),
    example: null,
  },
  'DELETE /api/v1/app/leads/{lead_id}': { statusCode: 204, schema: null, example: null },
  'POST /api/v1/app/leads/{lead_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.leadsRecordSchema, schemas.leadsRecordExample),
    example: null,
  },
  'GET /api/v1/app/appointments': {
    statusCode: 200,
    schema: wrapPaginated(schemas.appointmentsRecordSchema, [schemas.appointmentsRecordExample]),
    example: null,
  },
  'GET /api/v1/app/appointments/exports': {
    statusCode: 200,
    schema: wrapSuccess(schemas.recordExportSchema, schemas.recordExportExample),
    example: null,
  },
  'POST /api/v1/app/appointments': {
    statusCode: 200,
    schema: wrapSuccess(schemas.appointmentsRecordSchema, schemas.appointmentsRecordExample),
    example: null,
  },
  'GET /api/v1/app/appointments/{appointment_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.appointmentsRecordSchema, schemas.appointmentsRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/appointments/{appointment_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.appointmentsRecordSchema, schemas.appointmentsRecordExample),
    example: null,
  },
  'POST /api/v1/app/appointments/{appointment_id}/cancel': {
    statusCode: 200,
    schema: wrapSuccess(schemas.appointmentsRecordSchema, schemas.appointmentsRecordExample),
    example: null,
  },
  'POST /api/v1/app/appointments/{appointment_id}/reinstate': {
    statusCode: 200,
    schema: wrapSuccess(schemas.appointmentsRecordSchema, schemas.appointmentsRecordExample),
    example: null,
  },
  'POST /api/v1/app/appointments/{appointment_id}/copy': {
    statusCode: 200,
    schema: wrapSuccess(schemas.appointmentsRecordSchema, schemas.appointmentsRecordExample),
    example: null,
  },
  'POST /api/v1/app/appointments/{appointment_id}/undo-check-in': {
    statusCode: 200,
    schema: wrapSuccess(schemas.appointmentsRecordSchema, schemas.appointmentsRecordExample),
    example: null,
  },
  'POST /api/v1/app/appointments/{appointment_id}/confirm': {
    statusCode: 200,
    schema: wrapSuccess(schemas.appointmentsRecordSchema, schemas.appointmentsRecordExample),
    example: null,
  },
  'POST /api/v1/app/appointments/{appointment_id}/check-in': {
    statusCode: 200,
    schema: wrapSuccess(schemas.appointmentsRecordSchema, schemas.appointmentsRecordExample),
    example: null,
  },
  'POST /api/v1/app/appointments/{appointment_id}/complete': {
    statusCode: 200,
    schema: wrapSuccess(schemas.appointmentsRecordSchema, schemas.appointmentsRecordExample),
    example: null,
  },
  'POST /api/v1/app/appointments/{appointment_id}/no-show': {
    statusCode: 200,
    schema: wrapSuccess(schemas.appointmentsRecordSchema, schemas.appointmentsRecordExample),
    example: null,
  },
  'POST /api/v1/app/appointments/{appointment_id}/stage': {
    statusCode: 200,
    schema: wrapSuccess(schemas.appointmentsRecordSchema, schemas.appointmentsRecordExample),
    example: null,
  },
  'POST /api/v1/app/appointments/{appointment_id}/pause': {
    statusCode: 200,
    schema: wrapSuccess(schemas.appointmentsRecordSchema, schemas.appointmentsRecordExample),
    example: null,
  },
  'POST /api/v1/app/appointments/{appointment_id}/resume': {
    statusCode: 200,
    schema: wrapSuccess(schemas.appointmentsRecordSchema, schemas.appointmentsRecordExample),
    example: null,
  },
  'GET /api/v1/app/appointments/slots': {
    statusCode: 200,
    schema: wrapSuccess({ type: 'object', additionalProperties: true }, {}),
    example: null,
  },
  'GET /api/v1/app/appointments/daily-counts': {
    statusCode: 200,
    schema: wrapSuccess({ type: 'object', additionalProperties: true }, {}),
    example: null,
  },
  'DELETE /api/v1/app/appointments/{appointment_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  'POST /api/v1/app/appointments/{appointment_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.appointmentsRecordSchema, schemas.appointmentsRecordExample),
    example: null,
  },
  'GET /api/v1/app/patients/{patient_id}/clinical-notes': {
    statusCode: 200,
    schema: wrapPaginated(schemas.patientClinicalNotesRecordSchema, [
      schemas.patientClinicalNotesRecordExample,
    ]),
    example: null,
  },
  'POST /api/v1/app/patients/{patient_id}/clinical-notes': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.patientClinicalNotesRecordSchema,
      schemas.patientClinicalNotesRecordExample,
    ),
    example: null,
  },
  'GET /api/v1/app/patients/{patient_id}/clinical-notes/{patient_clinical_note_id}': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.patientClinicalNotesRecordSchema,
      schemas.patientClinicalNotesRecordExample,
    ),
    example: null,
  },
  'DELETE /api/v1/app/patients/{patient_id}/clinical-notes/{patient_clinical_note_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  'POST /api/v1/app/patients/{patient_id}/clinical-notes/{patient_clinical_note_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.patientClinicalNotesRecordSchema,
      schemas.patientClinicalNotesRecordExample,
    ),
    example: null,
  },
  'GET /api/v1/app/patient-prescriptions': {
    statusCode: 200,
    schema: wrapPaginated(schemas.patientPrescriptionsRecordSchema, [
      schemas.patientPrescriptionsRecordExample,
    ]),
    example: null,
  },
  'GET /api/v1/app/patients/{patient_id}/prescriptions': {
    statusCode: 200,
    schema: wrapPaginated(schemas.patientPrescriptionsRecordSchema, [
      schemas.patientPrescriptionsRecordExample,
    ]),
    example: null,
  },
  'POST /api/v1/app/patients/{patient_id}/prescriptions': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.patientPrescriptionsRecordSchema,
      schemas.patientPrescriptionsRecordExample,
    ),
    example: null,
  },
  'GET /api/v1/app/patients/{patient_id}/prescriptions/{patient_prescription_id}': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.patientPrescriptionsRecordSchema,
      schemas.patientPrescriptionsRecordExample,
    ),
    example: null,
  },
  'PATCH /api/v1/app/patients/{patient_id}/prescriptions/{patient_prescription_id}': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.patientPrescriptionsRecordSchema,
      schemas.patientPrescriptionsRecordExample,
    ),
    example: null,
  },
  'POST /api/v1/app/patients/{patient_id}/prescriptions/{patient_prescription_id}/approve': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.patientPrescriptionsRecordSchema,
      schemas.patientPrescriptionsRecordExample,
    ),
    example: null,
  },
  'DELETE /api/v1/app/patients/{patient_id}/prescriptions/{patient_prescription_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  'POST /api/v1/app/patients/{patient_id}/prescriptions/{patient_prescription_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.patientPrescriptionsRecordSchema,
      schemas.patientPrescriptionsRecordExample,
    ),
    example: null,
  },
  'GET /api/v1/app/prescription-kits': {
    statusCode: 200,
    schema: wrapPaginated(schemas.prescriptionKitsRecordSchema, [
      schemas.prescriptionKitsRecordExample,
    ]),
    example: null,
  },
  'POST /api/v1/app/prescription-kits': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.prescriptionKitsRecordSchema,
      schemas.prescriptionKitsRecordExample,
    ),
    example: null,
  },
  'GET /api/v1/app/prescription-kits/{prescription_kit_id}': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.prescriptionKitsRecordSchema,
      schemas.prescriptionKitsRecordExample,
    ),
    example: null,
  },
  'PATCH /api/v1/app/prescription-kits/{prescription_kit_id}': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.prescriptionKitsRecordSchema,
      schemas.prescriptionKitsRecordExample,
    ),
    example: null,
  },
  'DELETE /api/v1/app/prescription-kits/{prescription_kit_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  'POST /api/v1/app/prescription-kits/{prescription_kit_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.prescriptionKitsRecordSchema,
      schemas.prescriptionKitsRecordExample,
    ),
    example: null,
  },
  'GET /api/v1/app/patient-diagnoses': {
    statusCode: 200,
    schema: wrapPaginated(schemas.patientDiagnosesRecordSchema, [
      schemas.patientDiagnosesRecordExample,
    ]),
    example: null,
  },
  'POST /api/v1/app/patient-diagnoses': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.patientDiagnosesRecordSchema,
      schemas.patientDiagnosesRecordExample,
    ),
    example: null,
  },
  'GET /api/v1/app/patient-diagnoses/{patient_diagnosis_id}': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.patientDiagnosesRecordSchema,
      schemas.patientDiagnosesRecordExample,
    ),
    example: null,
  },
  'PATCH /api/v1/app/patient-diagnoses/{patient_diagnosis_id}': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.patientDiagnosesRecordSchema,
      schemas.patientDiagnosesRecordExample,
    ),
    example: null,
  },
  'DELETE /api/v1/app/patient-diagnoses/{patient_diagnosis_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  'POST /api/v1/app/patient-diagnoses/{patient_diagnosis_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.patientDiagnosesRecordSchema,
      schemas.patientDiagnosesRecordExample,
    ),
    example: null,
  },
  'GET /api/v1/app/patients/{patient_id}/images': {
    statusCode: 200,
    schema: wrapPaginated(schemas.patientImagesRecordSchema, [schemas.patientImagesRecordExample], {
      album_counts: schemas.patientImageAlbumCountsSchema,
    }),
    example: null,
  },
  'POST /api/v1/app/patients/{patient_id}/images': {
    statusCode: 200,
    schema: wrapSuccess(schemas.patientImagesRecordSchema, schemas.patientImagesRecordExample),
    example: null,
  },
  'GET /api/v1/app/patients/{patient_id}/images/{patient_image_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.patientImagesRecordSchema, schemas.patientImagesRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/patients/{patient_id}/images/{patient_image_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.patientImagesRecordSchema, schemas.patientImagesRecordExample),
    example: null,
  },
  'DELETE /api/v1/app/patients/{patient_id}/images/{patient_image_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  'POST /api/v1/app/patients/{patient_id}/images/{patient_image_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.patientImagesRecordSchema, schemas.patientImagesRecordExample),
    example: null,
  },
  'GET /api/v1/app/patients/{patient_id}/reports': {
    statusCode: 200,
    schema: wrapPaginated(schemas.patientReportsRecordSchema, [
      schemas.patientReportsRecordExample,
    ]),
    example: null,
  },
  'POST /api/v1/app/patients/{patient_id}/reports': {
    statusCode: 200,
    schema: wrapSuccess(schemas.patientReportsRecordSchema, schemas.patientReportsRecordExample),
    example: null,
  },
  'GET /api/v1/app/patients/{patient_id}/reports/{patient_report_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.patientReportsRecordSchema, schemas.patientReportsRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/patients/{patient_id}/reports/{patient_report_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.patientReportsRecordSchema, schemas.patientReportsRecordExample),
    example: null,
  },
  'DELETE /api/v1/app/patients/{patient_id}/reports/{patient_report_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  'POST /api/v1/app/patients/{patient_id}/reports/{patient_report_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.patientReportsRecordSchema, schemas.patientReportsRecordExample),
    example: null,
  },
  'GET /api/v1/app/invoices': {
    statusCode: 200,
    schema: wrapPaginated(schemas.invoicesRecordSchema, [schemas.invoicesRecordExample], {
      due_total: {
        type: 'number',
        description: 'What is due on every invoice the filters match, every page (D81)',
      },
      paid_total: {
        type: 'number',
        description: 'What is paid on every invoice the filters match, every page (D81)',
      },
    }),
    example: null,
  },
  'GET /api/v1/app/invoices/exports': {
    statusCode: 200,
    schema: wrapSuccess(schemas.recordExportSchema, schemas.recordExportExample),
    example: null,
  },
  'POST /api/v1/app/invoices': {
    statusCode: 200,
    schema: wrapSuccess(schemas.invoicesRecordSchema, schemas.invoicesRecordExample),
    example: null,
  },
  'POST /api/v1/app/invoices/preview': {
    statusCode: 200,
    schema: wrapSuccess(schemas.invoicePreviewSchema, schemas.invoicePreviewExample),
    example: null,
  },
  'POST /api/v1/app/invoices/{invoice_id}/preview': {
    statusCode: 200,
    schema: wrapSuccess(schemas.invoicePreviewSchema, schemas.invoicePreviewExample),
    example: null,
  },
  'GET /api/v1/app/invoices/{invoice_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.invoicesRecordSchema, schemas.invoicesRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/invoices/{invoice_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.invoicesRecordSchema, schemas.invoicesRecordExample),
    example: null,
  },
  'DELETE /api/v1/app/invoices/{invoice_id}': { statusCode: 204, schema: null, example: null },
  'POST /api/v1/app/invoices/{invoice_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.invoicesRecordSchema, schemas.invoicesRecordExample),
    example: null,
  },
  'GET /api/v1/app/patients/{patient_id}/offerings': {
    statusCode: 200,
    schema: wrapPaginated(schemas.patientOfferingsRecordSchema, [
      schemas.patientOfferingsRecordExample,
    ]),
    example: null,
  },
  'GET /api/v1/app/patients/{patient_id}/offerings/{patient_offering_id}': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.patientOfferingsRecordSchema,
      schemas.patientOfferingsRecordExample,
    ),
    example: null,
  },
  'PATCH /api/v1/app/patients/{patient_id}/offerings/{patient_offering_id}': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.patientOfferingsRecordSchema,
      schemas.patientOfferingsRecordExample,
    ),
    example: null,
  },
  'GET /api/v1/app/patients/{patient_id}/offering-suggestions': {
    statusCode: 200,
    schema: wrapPaginated(
      schemas.patientOfferingSuggestionsRecordSchema,
      [schemas.patientOfferingSuggestionsRecordExample],
      {
        plan_total: { type: 'number', description: 'The planned and accepted rows (PK9)' },
      },
    ),
    example: null,
  },
  'POST /api/v1/app/patients/{patient_id}/offering-suggestions': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.patientOfferingSuggestionsRecordSchema,
      schemas.patientOfferingSuggestionsRecordExample,
    ),
    example: null,
  },
  'GET /api/v1/app/patients/{patient_id}/offering-suggestions/{patient_offering_suggestion_id}': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.patientOfferingSuggestionsRecordSchema,
      schemas.patientOfferingSuggestionsRecordExample,
    ),
    example: null,
  },
  'PATCH /api/v1/app/patients/{patient_id}/offering-suggestions/{patient_offering_suggestion_id}': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.patientOfferingSuggestionsRecordSchema,
      schemas.patientOfferingSuggestionsRecordExample,
    ),
    example: null,
  },
  'DELETE /api/v1/app/patients/{patient_id}/offering-suggestions/{patient_offering_suggestion_id}':
    {
      statusCode: 204,
      schema: null,
      example: null,
    },
  'POST /api/v1/app/patients/{patient_id}/offering-suggestions/{patient_offering_suggestion_id}/restore':
    {
      statusCode: 200,
      schema: wrapSuccess(
        schemas.patientOfferingSuggestionsRecordSchema,
        schemas.patientOfferingSuggestionsRecordExample,
      ),
      example: null,
    },
  'GET /api/v1/app/payments': {
    statusCode: 200,
    schema: wrapPaginated(schemas.paymentsRecordSchema, [schemas.paymentsRecordExample]),
    example: null,
  },
  'GET /api/v1/app/payments/exports': {
    statusCode: 200,
    schema: wrapSuccess(schemas.recordExportSchema, schemas.recordExportExample),
    example: null,
  },
  'POST /api/v1/app/payments': {
    statusCode: 200,
    schema: wrapSuccess(schemas.paymentsRecordSchema, schemas.paymentsRecordExample),
    example: null,
  },
  'GET /api/v1/app/payments/{payment_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.paymentsRecordSchema, schemas.paymentsRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/payments/{payment_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.paymentsRecordSchema, schemas.paymentsRecordExample),
    example: null,
  },
  // The edits never count: no `meta.pagination.estimated_total` (SHELL-M2's class)
  'GET /api/v1/app/payments/{payment_id}/edits': {
    statusCode: 200,
    schema: wrapUncountedPaginated(schemas.paymentEditsRecordSchema, [
      schemas.paymentEditsRecordExample,
    ]),
    example: null,
  },
  'POST /api/v1/app/payments/{payment_id}/reverse': {
    statusCode: 200,
    schema: wrapSuccess(schemas.paymentsRecordSchema, schemas.paymentsRecordExample),
    example: null,
  },
  'DELETE /api/v1/app/payments/{payment_id}': { statusCode: 204, schema: null, example: null },
  'POST /api/v1/app/payments/{payment_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.paymentsRecordSchema, schemas.paymentsRecordExample),
    example: null,
  },
  'GET /api/v1/app/invoice-credit-notes': {
    statusCode: 200,
    schema: wrapPaginated(schemas.invoiceCreditNotesRecordSchema, [
      schemas.invoiceCreditNotesRecordExample,
    ]),
    example: null,
  },
  'GET /api/v1/app/invoices/{invoice_id}/credit-notes': {
    statusCode: 200,
    schema: wrapPaginated(schemas.invoiceCreditNotesRecordSchema, [
      schemas.invoiceCreditNotesRecordExample,
    ]),
    example: null,
  },
  'POST /api/v1/app/invoices/{invoice_id}/credit-notes': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.invoiceCreditNotesRecordSchema,
      schemas.invoiceCreditNotesRecordExample,
    ),
    example: null,
  },
  'GET /api/v1/app/invoices/{invoice_id}/credit-notes/{invoice_credit_note_id}': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.invoiceCreditNotesRecordSchema,
      schemas.invoiceCreditNotesRecordExample,
    ),
    example: null,
  },
  'GET /api/v1/app/pending-credits': {
    statusCode: 200,
    schema: wrapPaginated(schemas.pendingCreditsRecordSchema, [
      schemas.pendingCreditsRecordExample,
    ]),
    example: null,
  },
  'POST /api/v1/app/pending-credits': {
    statusCode: 200,
    schema: wrapSuccess(schemas.pendingCreditsRecordSchema, schemas.pendingCreditsRecordExample),
    example: null,
  },
  'GET /api/v1/app/pending-credits/{pending_credit_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.pendingCreditsRecordSchema, schemas.pendingCreditsRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/pending-credits/{pending_credit_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.pendingCreditsRecordSchema, schemas.pendingCreditsRecordExample),
    example: null,
  },
  'DELETE /api/v1/app/pending-credits/{pending_credit_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  'POST /api/v1/app/pending-credits/{pending_credit_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.pendingCreditsRecordSchema, schemas.pendingCreditsRecordExample),
    example: null,
  },
  'POST /api/v1/app/pending-credits/{pending_credit_id}/settle': {
    statusCode: 200,
    schema: wrapSuccess(schemas.pendingCreditsRecordSchema, schemas.pendingCreditsRecordExample),
    example: null,
  },
  'GET /api/v1/app/day-closes': {
    statusCode: 200,
    schema: wrapPaginated(schemas.dayClosesRecordSchema, [schemas.dayClosesRecordExample]),
    example: null,
  },
  'POST /api/v1/app/day-closes': {
    statusCode: 200,
    schema: wrapSuccess(schemas.dayClosesRecordSchema, schemas.dayClosesRecordExample),
    example: null,
  },
  'GET /api/v1/app/day-closes/{day_close_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.dayClosesRecordSchema, schemas.dayClosesRecordExample),
    example: null,
  },
  'POST /api/v1/app/day-closes/{day_close_id}/close': {
    statusCode: 200,
    schema: wrapSuccess(schemas.dayClosesRecordSchema, schemas.dayClosesRecordExample),
    example: null,
  },
  'POST /api/v1/app/day-closes/{day_close_id}/reopen': {
    statusCode: 200,
    schema: wrapSuccess(schemas.dayClosesRecordSchema, schemas.dayClosesRecordExample),
    example: null,
  },
  'GET /api/v1/app/patient-treatments': {
    statusCode: 200,
    schema: wrapPaginated(schemas.patientTreatmentsRecordSchema, [
      schemas.patientTreatmentsRecordExample,
    ]),
    example: null,
  },
  'GET /api/v1/app/patients/{patient_id}/treatments': {
    statusCode: 200,
    schema: wrapPaginated(schemas.patientTreatmentsRecordSchema, [
      schemas.patientTreatmentsRecordExample,
    ]),
    example: null,
  },
  'POST /api/v1/app/patients/{patient_id}/treatments': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.patientTreatmentsRecordSchema,
      schemas.patientTreatmentsRecordExample,
    ),
    example: null,
  },
  'GET /api/v1/app/patients/{patient_id}/treatments/{patient_treatment_id}': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.patientTreatmentsRecordSchema,
      schemas.patientTreatmentsRecordExample,
    ),
    example: null,
  },
  'PATCH /api/v1/app/patients/{patient_id}/treatments/{patient_treatment_id}': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.patientTreatmentsRecordSchema,
      schemas.patientTreatmentsRecordExample,
    ),
    example: null,
  },
  'POST /api/v1/app/patients/{patient_id}/treatments/{patient_treatment_id}/reverse': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.patientTreatmentsRecordSchema,
      schemas.patientTreatmentsRecordExample,
    ),
    example: null,
  },
  'GET /api/v1/app/patients/{patient_id}/check-ins': {
    statusCode: 200,
    schema: wrapPaginated(schemas.patientCheckInsRecordSchema, [
      schemas.patientCheckInsRecordExample,
    ]),
    example: null,
  },
  'POST /api/v1/app/patients/{patient_id}/check-ins': {
    statusCode: 200,
    schema: wrapSuccess(schemas.patientCheckInsRecordSchema, schemas.patientCheckInsRecordExample),
    example: null,
  },
  'GET /api/v1/app/patients/{patient_id}/check-ins/{patient_check_in_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.patientCheckInsRecordSchema, schemas.patientCheckInsRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/patients/{patient_id}/check-ins/{patient_check_in_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.patientCheckInsRecordSchema, schemas.patientCheckInsRecordExample),
    example: null,
  },
  'DELETE /api/v1/app/patients/{patient_id}/check-ins/{patient_check_in_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  'POST /api/v1/app/patients/{patient_id}/check-ins/{patient_check_in_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.patientCheckInsRecordSchema, schemas.patientCheckInsRecordExample),
    example: null,
  },
  'POST /api/v1/app/patients/{patient_id}/check-ins/{patient_check_in_id}/actions': {
    statusCode: 200,
    schema: wrapSuccess(schemas.patientCheckInsRecordSchema, schemas.patientCheckInsRecordExample),
    example: null,
  },
  'GET /api/v1/app/patients/{patient_id}/reviews': {
    statusCode: 200,
    schema: wrapPaginated(schemas.patientReviewsRecordSchema, [
      schemas.patientReviewsRecordExample,
    ]),
    example: null,
  },
  'POST /api/v1/app/patients/{patient_id}/reviews': {
    statusCode: 200,
    schema: wrapSuccess(schemas.patientReviewsRecordSchema, schemas.patientReviewsRecordExample),
    example: null,
  },
  'GET /api/v1/app/patients/{patient_id}/reviews/{patient_review_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.patientReviewsRecordSchema, schemas.patientReviewsRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/patients/{patient_id}/reviews/{patient_review_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.patientReviewsRecordSchema, schemas.patientReviewsRecordExample),
    example: null,
  },
  'DELETE /api/v1/app/patients/{patient_id}/reviews/{patient_review_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  'POST /api/v1/app/patients/{patient_id}/reviews/{patient_review_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.patientReviewsRecordSchema, schemas.patientReviewsRecordExample),
    example: null,
  },
  'POST /api/v1/app/patients/{patient_id}/reviews/{patient_review_id}/actions': {
    statusCode: 200,
    schema: wrapSuccess(schemas.patientReviewsRecordSchema, schemas.patientReviewsRecordExample),
    example: null,
  },
  'GET /api/v1/app/manufacturers': {
    statusCode: 200,
    schema: wrapPaginated(schemas.manufacturersRecordSchema, [schemas.manufacturersRecordExample]),
    example: null,
  },
  'POST /api/v1/app/manufacturers': {
    statusCode: 200,
    schema: wrapSuccess(schemas.manufacturersRecordSchema, schemas.manufacturersRecordExample),
    example: null,
  },
  'GET /api/v1/app/manufacturers/{manufacturer_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.manufacturersRecordSchema, schemas.manufacturersRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/manufacturers/{manufacturer_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.manufacturersRecordSchema, schemas.manufacturersRecordExample),
    example: null,
  },
  'DELETE /api/v1/app/manufacturers/{manufacturer_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  'POST /api/v1/app/manufacturers/{manufacturer_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.manufacturersRecordSchema, schemas.manufacturersRecordExample),
    example: null,
  },
  'GET /api/v1/app/suppliers': {
    statusCode: 200,
    schema: wrapPaginated(schemas.suppliersRecordSchema, [schemas.suppliersRecordExample], {
      payable_total: {
        type: 'number',
        description: 'What is owed to every supplier the filters match, over every page (MD30 (b))',
      },
    }),
    example: null,
  },
  'POST /api/v1/app/suppliers': {
    statusCode: 200,
    schema: wrapSuccess(schemas.suppliersRecordSchema, schemas.suppliersRecordExample),
    example: null,
  },
  'GET /api/v1/app/suppliers/{supplier_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.suppliersRecordSchema, schemas.suppliersRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/suppliers/{supplier_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.suppliersRecordSchema, schemas.suppliersRecordExample),
    example: null,
  },
  'DELETE /api/v1/app/suppliers/{supplier_id}': { statusCode: 204, schema: null, example: null },
  'POST /api/v1/app/suppliers/{supplier_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.suppliersRecordSchema, schemas.suppliersRecordExample),
    example: null,
  },
  'POST /api/v1/app/suppliers/{supplier_id}/payments': {
    statusCode: 200,
    schema: wrapSuccess(schemas.suppliersRecordSchema, schemas.suppliersRecordExample),
    example: null,
  },
  'GET /api/v1/app/supplier-credits': {
    statusCode: 200,
    schema: wrapPaginated(schemas.supplierCreditsRecordSchema, [
      schemas.supplierCreditsRecordExample,
    ]),
    example: null,
  },
  'POST /api/v1/app/supplier-credits': {
    statusCode: 200,
    schema: wrapSuccess(schemas.supplierCreditsRecordSchema, schemas.supplierCreditsRecordExample),
    example: null,
  },
  'GET /api/v1/app/supplier-credits/{supplier_credit_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.supplierCreditsRecordSchema, schemas.supplierCreditsRecordExample),
    example: null,
  },
  'GET /api/v1/app/medicines': {
    statusCode: 200,
    schema: wrapPaginated(schemas.medicinesRecordSchema, [schemas.medicinesRecordExample]),
    example: null,
  },
  'GET /api/v1/app/medicines/exports': {
    statusCode: 200,
    schema: wrapSuccess(schemas.recordExportSchema, schemas.recordExportExample),
    example: null,
  },
  'POST /api/v1/app/medicines': {
    statusCode: 200,
    schema: wrapSuccess(schemas.medicinesRecordSchema, schemas.medicinesRecordExample),
    example: null,
  },
  'GET /api/v1/app/medicines/{medicine_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.medicinesRecordSchema, schemas.medicinesRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/medicines/{medicine_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.medicinesRecordSchema, schemas.medicinesRecordExample),
    example: null,
  },
  'DELETE /api/v1/app/medicines/{medicine_id}': { statusCode: 204, schema: null, example: null },
  'POST /api/v1/app/medicines/{medicine_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.medicinesRecordSchema, schemas.medicinesRecordExample),
    example: null,
  },
  'POST /api/v1/app/medicines/near-expiry-discount': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.nearExpiryDiscountResultSchema,
      schemas.nearExpiryDiscountResultExample,
    ),
    example: null,
  },
  'GET /api/v1/app/medical-purchase-orders': {
    statusCode: 200,
    schema: wrapPaginated(schemas.medicalPurchaseOrdersRecordSchema, [
      schemas.medicalPurchaseOrdersRecordExample,
    ]),
    example: null,
  },
  'GET /api/v1/app/medical-purchase-orders/exports': {
    statusCode: 200,
    schema: wrapSuccess(schemas.recordExportSchema, schemas.recordExportExample),
    example: null,
  },
  'POST /api/v1/app/medical-purchase-orders': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.medicalPurchaseOrdersRecordSchema,
      schemas.medicalPurchaseOrdersRecordExample,
    ),
    example: null,
  },
  'GET /api/v1/app/medical-purchase-orders/{medical_purchase_order_id}': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.medicalPurchaseOrdersRecordSchema,
      schemas.medicalPurchaseOrdersRecordExample,
    ),
    example: null,
  },
  'PATCH /api/v1/app/medical-purchase-orders/{medical_purchase_order_id}': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.medicalPurchaseOrdersRecordSchema,
      schemas.medicalPurchaseOrdersRecordExample,
    ),
    example: null,
  },
  'DELETE /api/v1/app/medical-purchase-orders/{medical_purchase_order_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  'POST /api/v1/app/medical-purchase-orders/{medical_purchase_order_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.medicalPurchaseOrdersRecordSchema,
      schemas.medicalPurchaseOrdersRecordExample,
    ),
    example: null,
  },
  'POST /api/v1/app/medical-purchase-orders/{medical_purchase_order_id}/receive': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.medicalPurchaseOrdersRecordSchema,
      schemas.medicalPurchaseOrdersRecordExample,
    ),
    example: null,
  },
  'GET /api/v1/app/medical-reps': {
    statusCode: 200,
    schema: wrapPaginated(schemas.medicalRepsRecordSchema, [schemas.medicalRepsRecordExample]),
    example: null,
  },
  'POST /api/v1/app/medical-reps': {
    statusCode: 200,
    schema: wrapSuccess(schemas.medicalRepsRecordSchema, schemas.medicalRepsRecordExample),
    example: null,
  },
  'GET /api/v1/app/medical-reps/{medical_rep_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.medicalRepsRecordSchema, schemas.medicalRepsRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/medical-reps/{medical_rep_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.medicalRepsRecordSchema, schemas.medicalRepsRecordExample),
    example: null,
  },
  'DELETE /api/v1/app/medical-reps/{medical_rep_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  'POST /api/v1/app/medical-reps/{medical_rep_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.medicalRepsRecordSchema, schemas.medicalRepsRecordExample),
    example: null,
  },
  'GET /api/v1/app/medical-reps/{medical_rep_id}/visits': {
    statusCode: 200,
    schema: wrapPaginated(schemas.medicalRepVisitsRecordSchema, [
      schemas.medicalRepVisitsRecordExample,
    ]),
    example: null,
  },
  'POST /api/v1/app/medical-reps/{medical_rep_id}/visits': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.medicalRepVisitsRecordSchema,
      schemas.medicalRepVisitsRecordExample,
    ),
    example: null,
  },
  'GET /api/v1/app/medical-reps/{medical_rep_id}/visits/{medical_rep_visit_id}': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.medicalRepVisitsRecordSchema,
      schemas.medicalRepVisitsRecordExample,
    ),
    example: null,
  },
  'DELETE /api/v1/app/medical-reps/{medical_rep_id}/visits/{medical_rep_visit_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  'POST /api/v1/app/medical-reps/{medical_rep_id}/visits/{medical_rep_visit_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.medicalRepVisitsRecordSchema,
      schemas.medicalRepVisitsRecordExample,
    ),
    example: null,
  },
  'GET /api/v1/app/medical-sales': {
    statusCode: 200,
    schema: wrapPaginated(schemas.medicalSalesRecordSchema, [schemas.medicalSalesRecordExample]),
    example: null,
  },
  'GET /api/v1/app/medical-sales/exports': {
    statusCode: 200,
    schema: wrapSuccess(schemas.recordExportSchema, schemas.recordExportExample),
    example: null,
  },
  'POST /api/v1/app/medical-sales': {
    statusCode: 200,
    schema: wrapSuccess(schemas.medicalSalesRecordSchema, schemas.medicalSalesRecordExample),
    example: null,
  },
  'GET /api/v1/app/medical-sales/{medical_sale_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.medicalSalesRecordSchema, schemas.medicalSalesRecordExample),
    example: null,
  },
  'DELETE /api/v1/app/medical-sales/{medical_sale_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  'POST /api/v1/app/medical-sales/{medical_sale_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.medicalSalesRecordSchema, schemas.medicalSalesRecordExample),
    example: null,
  },
  'POST /api/v1/app/medical-sales/{medical_sale_id}/returns': {
    statusCode: 200,
    schema: wrapSuccess(schemas.medicalSalesRecordSchema, schemas.medicalSalesRecordExample),
    example: null,
  },
  'GET /api/v1/app/medical-payments': {
    statusCode: 200,
    schema: wrapPaginated(schemas.paymentsRecordSchema, [schemas.paymentsRecordExample]),
    example: null,
  },
  'GET /api/v1/app/stock-items': {
    statusCode: 200,
    schema: wrapPaginated(schemas.stockItemsRecordSchema, [schemas.stockItemsRecordExample]),
    example: null,
  },
  'GET /api/v1/app/stock-items/exports': {
    statusCode: 200,
    schema: wrapSuccess(schemas.recordExportSchema, schemas.recordExportExample),
    example: null,
  },
  'POST /api/v1/app/stock-items': {
    statusCode: 200,
    schema: wrapSuccess(schemas.stockItemsRecordSchema, schemas.stockItemsRecordExample),
    example: null,
  },
  'GET /api/v1/app/stock-items/{stock_item_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.stockItemsRecordSchema, schemas.stockItemsRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/stock-items/{stock_item_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.stockItemsRecordSchema, schemas.stockItemsRecordExample),
    example: null,
  },
  'DELETE /api/v1/app/stock-items/{stock_item_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  'POST /api/v1/app/stock-items/{stock_item_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.stockItemsRecordSchema, schemas.stockItemsRecordExample),
    example: null,
  },
  'GET /api/v1/app/stock-item-movements': {
    statusCode: 200,
    schema: wrapPaginated(schemas.stockItemMovementsRecordSchema, [
      schemas.stockItemMovementsRecordExample,
    ]),
    example: null,
  },
  'GET /api/v1/app/stock-items/{stock_item_id}/movements': {
    statusCode: 200,
    schema: wrapPaginated(schemas.stockItemMovementsRecordSchema, [
      schemas.stockItemMovementsRecordExample,
    ]),
    example: null,
  },
  'POST /api/v1/app/stock-items/{stock_item_id}/movements': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.stockItemMovementsRecordSchema,
      schemas.stockItemMovementsRecordExample,
    ),
    example: null,
  },
  'GET /api/v1/app/stock-items/{stock_item_id}/movements/{stock_item_movement_id}': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.stockItemMovementsRecordSchema,
      schemas.stockItemMovementsRecordExample,
    ),
    example: null,
  },
  'POST /api/v1/app/stock-items/{stock_item_id}/movements/{stock_item_movement_id}/revert': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.stockItemMovementsRecordSchema,
      schemas.stockItemMovementsRecordExample,
    ),
    example: null,
  },
  'GET /api/v1/app/stock-counts': {
    statusCode: 200,
    schema: wrapPaginated(schemas.stockCountsRecordSchema, [schemas.stockCountsRecordExample]),
    example: null,
  },
  'POST /api/v1/app/stock-counts': {
    statusCode: 200,
    schema: wrapSuccess(schemas.stockCountsRecordSchema, schemas.stockCountsRecordExample),
    example: null,
  },
  'GET /api/v1/app/stock-counts/{stock_count_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.stockCountsRecordSchema, schemas.stockCountsRecordExample),
    example: null,
  },
  'GET /api/v1/app/stock-purchases': {
    statusCode: 200,
    schema: wrapPaginated(
      schemas.stockPurchasesRecordSchema,
      [schemas.stockPurchasesRecordExample],
      {
        due_total: {
          type: 'number',
          description: 'The open dues of every purchase the filters match',
        },
      },
    ),
    example: null,
  },
  'GET /api/v1/app/stock-purchases/exports': {
    statusCode: 200,
    schema: wrapSuccess(schemas.recordExportSchema, schemas.recordExportExample),
    example: null,
  },
  'POST /api/v1/app/stock-purchases': {
    statusCode: 200,
    schema: wrapSuccess(schemas.stockPurchasesRecordSchema, schemas.stockPurchasesRecordExample),
    example: null,
  },
  'GET /api/v1/app/stock-purchases/{stock_purchase_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.stockPurchasesRecordSchema, schemas.stockPurchasesRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/stock-purchases/{stock_purchase_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.stockPurchasesRecordSchema, schemas.stockPurchasesRecordExample),
    example: null,
  },
  'DELETE /api/v1/app/stock-purchases/{stock_purchase_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  'POST /api/v1/app/stock-purchases/{stock_purchase_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.stockPurchasesRecordSchema, schemas.stockPurchasesRecordExample),
    example: null,
  },
  'GET /api/v1/app/stock-vendors': {
    statusCode: 200,
    schema: wrapPaginated(schemas.stockVendorsRecordSchema, [schemas.stockVendorsRecordExample], {
      payable_total: {
        type: 'number',
        description: 'The open dues of every vendor the filters match (D81)',
      },
    }),
    example: null,
  },
  'POST /api/v1/app/stock-vendors': {
    statusCode: 200,
    schema: wrapSuccess(schemas.stockVendorsRecordSchema, schemas.stockVendorsRecordExample),
    example: null,
  },
  'GET /api/v1/app/stock-vendors/{stock_vendor_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.stockVendorsRecordSchema, schemas.stockVendorsRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/stock-vendors/{stock_vendor_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.stockVendorsRecordSchema, schemas.stockVendorsRecordExample),
    example: null,
  },
  'DELETE /api/v1/app/stock-vendors/{stock_vendor_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  'POST /api/v1/app/stock-vendors/{stock_vendor_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.stockVendorsRecordSchema, schemas.stockVendorsRecordExample),
    example: null,
  },
  'GET /api/v1/app/tasks': {
    statusCode: 200,
    schema: wrapPaginated(schemas.tasksRecordSchema, [schemas.tasksRecordExample]),
    example: null,
  },
  'GET /api/v1/app/tasks/exports': {
    statusCode: 200,
    schema: wrapSuccess(schemas.recordExportSchema, schemas.recordExportExample),
    example: null,
  },
  'POST /api/v1/app/tasks': {
    statusCode: 200,
    schema: wrapSuccess(schemas.tasksRecordSchema, schemas.tasksRecordExample),
    example: null,
  },
  'GET /api/v1/app/tasks/{task_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.tasksRecordSchema, schemas.tasksRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/tasks/{task_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.tasksRecordSchema, schemas.tasksRecordExample),
    example: null,
  },
  'POST /api/v1/app/tasks/{task_id}/snooze': {
    statusCode: 200,
    schema: wrapSuccess(schemas.tasksRecordSchema, schemas.tasksRecordExample),
    example: null,
  },
  'POST /api/v1/app/tasks/{task_id}/resolve': {
    statusCode: 200,
    schema: wrapSuccess(schemas.tasksRecordSchema, schemas.tasksRecordExample),
    example: null,
  },
  'POST /api/v1/app/tasks/{task_id}/reassign': {
    statusCode: 200,
    schema: wrapSuccess(schemas.tasksRecordSchema, schemas.tasksRecordExample),
    example: null,
  },
  'DELETE /api/v1/app/tasks/{task_id}': { statusCode: 204, schema: null, example: null },
  'POST /api/v1/app/tasks/{task_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.tasksRecordSchema, schemas.tasksRecordExample),
    example: null,
  },
};

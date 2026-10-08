/** OpenAPI success responses — the app record tables (launch iteration, generated from the table specs). */
import type { ResponseDefinition } from '@tooling/openapi/response-map/building-blocks.js';
import { wrapPaginated, wrapSuccess } from '@tooling/openapi/response-map/building-blocks.js';
import * as schemas from '@tooling/openapi/response-map/resource-schemas.js';

export const appRecordRouteResponses: Record<string, ResponseDefinition> = {
  'GET /api/v1/app/saved-views': {
    statusCode: 200,
    schema: wrapPaginated(schemas.savedViewsRecordSchema, [schemas.savedViewsRecordExample]),
    example: null,
  },
  'POST /api/v1/app/saved-views': {
    statusCode: 200,
    schema: wrapSuccess(schemas.savedViewsRecordSchema, schemas.savedViewsRecordExample),
    example: null,
  },
  'GET /api/v1/app/saved-views/{saved_view_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.savedViewsRecordSchema, schemas.savedViewsRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/saved-views/{saved_view_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.savedViewsRecordSchema, schemas.savedViewsRecordExample),
    example: null,
  },
  'DELETE /api/v1/app/saved-views/{saved_view_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  'POST /api/v1/app/saved-views/{saved_view_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.savedViewsRecordSchema, schemas.savedViewsRecordExample),
    example: null,
  },
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
  'GET /api/v1/app/patients/{patient_id}/timeline': {
    statusCode: 200,
    schema: wrapSuccess({ type: 'object', additionalProperties: true }, {}),
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
  'POST /api/v1/app/leads/{lead_id}/convert': {
    statusCode: 200,
    schema: wrapSuccess(schemas.leadsRecordSchema, schemas.leadsRecordExample),
    example: null,
  },
  'POST /api/v1/app/leads/{lead_id}/reads': {
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
  'GET /api/v1/app/message-templates': {
    statusCode: 200,
    schema: wrapPaginated(schemas.messageTemplatesRecordSchema, [
      schemas.messageTemplatesRecordExample,
    ]),
    example: null,
  },
  'POST /api/v1/app/message-templates': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.messageTemplatesRecordSchema,
      schemas.messageTemplatesRecordExample,
    ),
    example: null,
  },
  'GET /api/v1/app/message-templates/{message_template_id}': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.messageTemplatesRecordSchema,
      schemas.messageTemplatesRecordExample,
    ),
    example: null,
  },
  'PATCH /api/v1/app/message-templates/{message_template_id}': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.messageTemplatesRecordSchema,
      schemas.messageTemplatesRecordExample,
    ),
    example: null,
  },
  'DELETE /api/v1/app/message-templates/{message_template_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  'POST /api/v1/app/message-templates/{message_template_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.messageTemplatesRecordSchema,
      schemas.messageTemplatesRecordExample,
    ),
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
  'POST /api/v1/app/appointments/{appointment_id}/status': {
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
  'GET /api/v1/app/visits': {
    statusCode: 200,
    schema: wrapPaginated(schemas.visitsRecordSchema, [schemas.visitsRecordExample]),
    example: null,
  },
  'GET /api/v1/app/visits/{visit_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.visitsRecordSchema, schemas.visitsRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/visits/{visit_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.visitsRecordSchema, schemas.visitsRecordExample),
    example: null,
  },
  'POST /api/v1/app/visits/{visit_id}/stage': {
    statusCode: 200,
    schema: wrapSuccess(schemas.visitsRecordSchema, schemas.visitsRecordExample),
    example: null,
  },
  'POST /api/v1/app/visits/{visit_id}/pause': {
    statusCode: 200,
    schema: wrapSuccess(schemas.visitsRecordSchema, schemas.visitsRecordExample),
    example: null,
  },
  'POST /api/v1/app/visits/{visit_id}/resume': {
    statusCode: 200,
    schema: wrapSuccess(schemas.visitsRecordSchema, schemas.visitsRecordExample),
    example: null,
  },
  'GET /api/v1/app/diagnoses': {
    statusCode: 200,
    schema: wrapPaginated(schemas.diagnosesRecordSchema, [schemas.diagnosesRecordExample]),
    example: null,
  },
  'POST /api/v1/app/diagnoses': {
    statusCode: 200,
    schema: wrapSuccess(schemas.diagnosesRecordSchema, schemas.diagnosesRecordExample),
    example: null,
  },
  'GET /api/v1/app/diagnoses/{diagnosis_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.diagnosesRecordSchema, schemas.diagnosesRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/diagnoses/{diagnosis_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.diagnosesRecordSchema, schemas.diagnosesRecordExample),
    example: null,
  },
  'DELETE /api/v1/app/diagnoses/{diagnosis_id}': { statusCode: 204, schema: null, example: null },
  'POST /api/v1/app/diagnoses/{diagnosis_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.diagnosesRecordSchema, schemas.diagnosesRecordExample),
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
  'GET /api/v1/app/patient-clinical-notes/{patient_clinical_note_id}': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.patientClinicalNotesRecordSchema,
      schemas.patientClinicalNotesRecordExample,
    ),
    example: null,
  },
  'DELETE /api/v1/app/patient-clinical-notes/{patient_clinical_note_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  'POST /api/v1/app/patient-clinical-notes/{patient_clinical_note_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.patientClinicalNotesRecordSchema,
      schemas.patientClinicalNotesRecordExample,
    ),
    example: null,
  },
  'GET /api/v1/app/patients/{patient_id}/prescriptions': {
    statusCode: 200,
    schema: wrapPaginated(schemas.prescriptionsRecordSchema, [schemas.prescriptionsRecordExample]),
    example: null,
  },
  'POST /api/v1/app/patients/{patient_id}/prescriptions': {
    statusCode: 200,
    schema: wrapSuccess(schemas.prescriptionsRecordSchema, schemas.prescriptionsRecordExample),
    example: null,
  },
  'GET /api/v1/app/prescriptions': {
    statusCode: 200,
    schema: wrapPaginated(schemas.prescriptionsRecordSchema, [schemas.prescriptionsRecordExample]),
    example: null,
  },
  'GET /api/v1/app/prescriptions/{prescription_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.prescriptionsRecordSchema, schemas.prescriptionsRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/prescriptions/{prescription_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.prescriptionsRecordSchema, schemas.prescriptionsRecordExample),
    example: null,
  },
  'POST /api/v1/app/prescriptions/{prescription_id}/approve': {
    statusCode: 200,
    schema: wrapSuccess(schemas.prescriptionsRecordSchema, schemas.prescriptionsRecordExample),
    example: null,
  },
  'DELETE /api/v1/app/prescriptions/{prescription_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  'POST /api/v1/app/prescriptions/{prescription_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.prescriptionsRecordSchema, schemas.prescriptionsRecordExample),
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
  'GET /api/v1/app/patients/{patient_id}/images': {
    statusCode: 200,
    schema: wrapPaginated(schemas.patientImagesRecordSchema, [schemas.patientImagesRecordExample]),
    example: null,
  },
  'POST /api/v1/app/patients/{patient_id}/images': {
    statusCode: 200,
    schema: wrapSuccess(schemas.patientImagesRecordSchema, schemas.patientImagesRecordExample),
    example: null,
  },
  'GET /api/v1/app/patient-images/{patient_image_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.patientImagesRecordSchema, schemas.patientImagesRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/patient-images/{patient_image_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.patientImagesRecordSchema, schemas.patientImagesRecordExample),
    example: null,
  },
  'DELETE /api/v1/app/patient-images/{patient_image_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  'POST /api/v1/app/patient-images/{patient_image_id}/restore': {
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
  'GET /api/v1/app/patient-reports/{patient_report_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.patientReportsRecordSchema, schemas.patientReportsRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/patient-reports/{patient_report_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.patientReportsRecordSchema, schemas.patientReportsRecordExample),
    example: null,
  },
  'DELETE /api/v1/app/patient-reports/{patient_report_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  'POST /api/v1/app/patient-reports/{patient_report_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.patientReportsRecordSchema, schemas.patientReportsRecordExample),
    example: null,
  },
  'GET /api/v1/app/patients/{patient_id}/notes': {
    statusCode: 200,
    schema: wrapPaginated(schemas.patientNotesRecordSchema, [schemas.patientNotesRecordExample]),
    example: null,
  },
  'POST /api/v1/app/patients/{patient_id}/notes': {
    statusCode: 200,
    schema: wrapSuccess(schemas.patientNotesRecordSchema, schemas.patientNotesRecordExample),
    example: null,
  },
  'GET /api/v1/app/patient-notes/{patient_note_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.patientNotesRecordSchema, schemas.patientNotesRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/patient-notes/{patient_note_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.patientNotesRecordSchema, schemas.patientNotesRecordExample),
    example: null,
  },
  'DELETE /api/v1/app/patient-notes/{patient_note_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  'POST /api/v1/app/patient-notes/{patient_note_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.patientNotesRecordSchema, schemas.patientNotesRecordExample),
    example: null,
  },
  'GET /api/v1/app/invoices': {
    statusCode: 200,
    schema: wrapPaginated(schemas.invoicesRecordSchema, [schemas.invoicesRecordExample]),
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
  'GET /api/v1/app/patients/{patient_id}/packages': {
    statusCode: 200,
    schema: wrapPaginated(schemas.patientPackagesRecordSchema, [
      schemas.patientPackagesRecordExample,
    ]),
    example: null,
  },
  'POST /api/v1/app/patients/{patient_id}/packages': {
    statusCode: 200,
    schema: wrapSuccess(schemas.patientPackagesRecordSchema, schemas.patientPackagesRecordExample),
    example: null,
  },
  'GET /api/v1/app/patient-packages/{patient_package_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.patientPackagesRecordSchema, schemas.patientPackagesRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/patient-packages/{patient_package_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.patientPackagesRecordSchema, schemas.patientPackagesRecordExample),
    example: null,
  },
  'DELETE /api/v1/app/patient-packages/{patient_package_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  'POST /api/v1/app/patient-packages/{patient_package_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.patientPackagesRecordSchema, schemas.patientPackagesRecordExample),
    example: null,
  },
  'GET /api/v1/app/patients/{patient_id}/offering-suggestions': {
    statusCode: 200,
    schema: wrapPaginated(schemas.offeringSuggestionsRecordSchema, [
      schemas.offeringSuggestionsRecordExample,
    ]),
    example: null,
  },
  'POST /api/v1/app/patients/{patient_id}/offering-suggestions': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.offeringSuggestionsRecordSchema,
      schemas.offeringSuggestionsRecordExample,
    ),
    example: null,
  },
  'GET /api/v1/app/offering-suggestions/{offering_suggestion_id}': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.offeringSuggestionsRecordSchema,
      schemas.offeringSuggestionsRecordExample,
    ),
    example: null,
  },
  'PATCH /api/v1/app/offering-suggestions/{offering_suggestion_id}': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.offeringSuggestionsRecordSchema,
      schemas.offeringSuggestionsRecordExample,
    ),
    example: null,
  },
  'DELETE /api/v1/app/offering-suggestions/{offering_suggestion_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  'POST /api/v1/app/offering-suggestions/{offering_suggestion_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.offeringSuggestionsRecordSchema,
      schemas.offeringSuggestionsRecordExample,
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
  'POST /api/v1/app/payments/{payment_id}/checked': {
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
  'GET /api/v1/app/credit-notes': {
    statusCode: 200,
    schema: wrapPaginated(schemas.creditNotesRecordSchema, [schemas.creditNotesRecordExample]),
    example: null,
  },
  'GET /api/v1/app/credit-notes/{credit_note_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.creditNotesRecordSchema, schemas.creditNotesRecordExample),
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
  'GET /api/v1/app/patients/{patient_id}/treatments': {
    statusCode: 200,
    schema: wrapPaginated(schemas.treatmentsRecordSchema, [schemas.treatmentsRecordExample]),
    example: null,
  },
  'POST /api/v1/app/patients/{patient_id}/treatments': {
    statusCode: 200,
    schema: wrapSuccess(schemas.treatmentsRecordSchema, schemas.treatmentsRecordExample),
    example: null,
  },
  'GET /api/v1/app/treatments': {
    statusCode: 200,
    schema: wrapPaginated(schemas.treatmentsRecordSchema, [schemas.treatmentsRecordExample]),
    example: null,
  },
  'GET /api/v1/app/treatments/{treatment_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.treatmentsRecordSchema, schemas.treatmentsRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/treatments/{treatment_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.treatmentsRecordSchema, schemas.treatmentsRecordExample),
    example: null,
  },
  'POST /api/v1/app/treatments/{treatment_id}/reverse': {
    statusCode: 200,
    schema: wrapSuccess(schemas.treatmentsRecordSchema, schemas.treatmentsRecordExample),
    example: null,
  },
  'GET /api/v1/app/patients/{patient_id}/check-ins': {
    statusCode: 200,
    schema: wrapPaginated(schemas.checkInsRecordSchema, [schemas.checkInsRecordExample]),
    example: null,
  },
  'POST /api/v1/app/patients/{patient_id}/check-ins': {
    statusCode: 200,
    schema: wrapSuccess(schemas.checkInsRecordSchema, schemas.checkInsRecordExample),
    example: null,
  },
  'GET /api/v1/app/check-ins/{check_in_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.checkInsRecordSchema, schemas.checkInsRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/check-ins/{check_in_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.checkInsRecordSchema, schemas.checkInsRecordExample),
    example: null,
  },
  'DELETE /api/v1/app/check-ins/{check_in_id}': { statusCode: 204, schema: null, example: null },
  'POST /api/v1/app/check-ins/{check_in_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.checkInsRecordSchema, schemas.checkInsRecordExample),
    example: null,
  },
  'GET /api/v1/app/patients/{patient_id}/reviews': {
    statusCode: 200,
    schema: wrapPaginated(schemas.reviewsRecordSchema, [schemas.reviewsRecordExample]),
    example: null,
  },
  'POST /api/v1/app/patients/{patient_id}/reviews': {
    statusCode: 200,
    schema: wrapSuccess(schemas.reviewsRecordSchema, schemas.reviewsRecordExample),
    example: null,
  },
  'GET /api/v1/app/reviews/{review_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.reviewsRecordSchema, schemas.reviewsRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/reviews/{review_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.reviewsRecordSchema, schemas.reviewsRecordExample),
    example: null,
  },
  'DELETE /api/v1/app/reviews/{review_id}': { statusCode: 204, schema: null, example: null },
  'POST /api/v1/app/reviews/{review_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.reviewsRecordSchema, schemas.reviewsRecordExample),
    example: null,
  },
  'GET /api/v1/app/feedback-actions': {
    statusCode: 200,
    schema: wrapPaginated(schemas.feedbackActionsRecordSchema, [
      schemas.feedbackActionsRecordExample,
    ]),
    example: null,
  },
  'POST /api/v1/app/feedback-actions': {
    statusCode: 200,
    schema: wrapSuccess(schemas.feedbackActionsRecordSchema, schemas.feedbackActionsRecordExample),
    example: null,
  },
  'GET /api/v1/app/feedback-actions/{feedback_action_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.feedbackActionsRecordSchema, schemas.feedbackActionsRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/feedback-actions/{feedback_action_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.feedbackActionsRecordSchema, schemas.feedbackActionsRecordExample),
    example: null,
  },
  'DELETE /api/v1/app/feedback-actions/{feedback_action_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  'POST /api/v1/app/feedback-actions/{feedback_action_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.feedbackActionsRecordSchema, schemas.feedbackActionsRecordExample),
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
    schema: wrapPaginated(schemas.suppliersRecordSchema, [schemas.suppliersRecordExample]),
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
  'GET /api/v1/app/medical-rep-visits/{medical_rep_visit_id}': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.medicalRepVisitsRecordSchema,
      schemas.medicalRepVisitsRecordExample,
    ),
    example: null,
  },
  'PATCH /api/v1/app/medical-rep-visits/{medical_rep_visit_id}': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.medicalRepVisitsRecordSchema,
      schemas.medicalRepVisitsRecordExample,
    ),
    example: null,
  },
  'DELETE /api/v1/app/medical-rep-visits/{medical_rep_visit_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  'POST /api/v1/app/medical-rep-visits/{medical_rep_visit_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.medicalRepVisitsRecordSchema,
      schemas.medicalRepVisitsRecordExample,
    ),
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
  'POST /api/v1/app/medical-purchase-orders/{medical_purchase_order_id}/receive': {
    statusCode: 200,
    schema: wrapSuccess(
      schemas.medicalPurchaseOrdersRecordSchema,
      schemas.medicalPurchaseOrdersRecordExample,
    ),
    example: null,
  },
  'POST /api/v1/app/medical-purchase-orders/{medical_purchase_order_id}/cancel': {
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
  'GET /api/v1/app/medical-contacts': {
    statusCode: 200,
    schema: wrapPaginated(schemas.medicalContactsRecordSchema, [
      schemas.medicalContactsRecordExample,
    ]),
    example: null,
  },
  'POST /api/v1/app/medical-contacts': {
    statusCode: 200,
    schema: wrapSuccess(schemas.medicalContactsRecordSchema, schemas.medicalContactsRecordExample),
    example: null,
  },
  'GET /api/v1/app/medical-contacts/{medical_contact_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.medicalContactsRecordSchema, schemas.medicalContactsRecordExample),
    example: null,
  },
  'PATCH /api/v1/app/medical-contacts/{medical_contact_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.medicalContactsRecordSchema, schemas.medicalContactsRecordExample),
    example: null,
  },
  'DELETE /api/v1/app/medical-contacts/{medical_contact_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  'POST /api/v1/app/medical-contacts/{medical_contact_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.medicalContactsRecordSchema, schemas.medicalContactsRecordExample),
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
  'POST /api/v1/app/medical-sales/{medical_sale_id}/void': {
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
  'DELETE /api/v1/app/supplier-credits/{supplier_credit_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  'POST /api/v1/app/supplier-credits/{supplier_credit_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.supplierCreditsRecordSchema, schemas.supplierCreditsRecordExample),
    example: null,
  },
  'GET /api/v1/app/stock-vendors': {
    statusCode: 200,
    schema: wrapPaginated(schemas.stockVendorsRecordSchema, [schemas.stockVendorsRecordExample]),
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
  'GET /api/v1/app/stock-purchases': {
    statusCode: 200,
    schema: wrapPaginated(schemas.stockPurchasesRecordSchema, [
      schemas.stockPurchasesRecordExample,
    ]),
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
  'DELETE /api/v1/app/stock-counts/{stock_count_id}': {
    statusCode: 204,
    schema: null,
    example: null,
  },
  'POST /api/v1/app/stock-counts/{stock_count_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.stockCountsRecordSchema, schemas.stockCountsRecordExample),
    example: null,
  },
  'GET /api/v1/app/stock-movements': {
    statusCode: 200,
    schema: wrapPaginated(schemas.stockMovementsRecordSchema, [
      schemas.stockMovementsRecordExample,
    ]),
    example: null,
  },
  'POST /api/v1/app/stock-movements': {
    statusCode: 200,
    schema: wrapSuccess(schemas.stockMovementsRecordSchema, schemas.stockMovementsRecordExample),
    example: null,
  },
  'GET /api/v1/app/stock-movements/{stock_movement_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.stockMovementsRecordSchema, schemas.stockMovementsRecordExample),
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
  'DELETE /api/v1/app/tasks/{task_id}': { statusCode: 204, schema: null, example: null },
  'POST /api/v1/app/tasks/{task_id}/restore': {
    statusCode: 200,
    schema: wrapSuccess(schemas.tasksRecordSchema, schemas.tasksRecordExample),
    example: null,
  },
  'GET /api/v1/app/messages': {
    statusCode: 200,
    schema: wrapPaginated(schemas.messagesRecordSchema, [schemas.messagesRecordExample]),
    example: null,
  },
  'POST /api/v1/app/messages': {
    statusCode: 200,
    schema: wrapSuccess(schemas.messagesRecordSchema, schemas.messagesRecordExample),
    example: null,
  },
  'GET /api/v1/app/messages/{message_id}': {
    statusCode: 200,
    schema: wrapSuccess(schemas.messagesRecordSchema, schemas.messagesRecordExample),
    example: null,
  },
  'POST /api/v1/app/messages/{message_id}/resend': {
    statusCode: 200,
    schema: wrapSuccess(schemas.messagesRecordSchema, schemas.messagesRecordExample),
    example: null,
  },
  'POST /api/v1/app/messages/batches': {
    statusCode: 200,
    schema: wrapSuccess({ type: 'array', items: schemas.messagesRecordSchema }, [
      schemas.messagesRecordExample,
    ]),
    example: null,
  },
};

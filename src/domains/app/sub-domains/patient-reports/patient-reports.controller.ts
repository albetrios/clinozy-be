import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { PatientReportsService } from './patient-reports.service.js';
import type { PatientReportOutput } from './patient-reports.types.js';

/** HTTP handlers for the `patient-reports` routes — {@link BaseRecordController} on {@link PatientReportsService}. */
export class PatientReportsController extends BaseRecordController<PatientReportOutput> {
  constructor(service: PatientReportsService) {
    super(service, {
      resource: 'patient_report',
      idParam: 'patient_report_id',
      parentParam: 'patient_id',
    });
  }
}

/** The `patient-reports` controller the routes register. */
export function createPatientReportsController(
  service: PatientReportsService,
): PatientReportsController {
  return new PatientReportsController(service);
}

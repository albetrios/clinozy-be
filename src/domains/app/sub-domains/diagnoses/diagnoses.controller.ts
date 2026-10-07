import { BaseRecordController } from '@/domains/app/base-record.controller.js';
import type { DiagnosesService } from './diagnoses.service.js';
import type { DiagnosisOutput } from './diagnoses.types.js';

/** HTTP handlers for the `diagnoses` routes — {@link BaseRecordController} on {@link DiagnosesService}. */
export class DiagnosesController extends BaseRecordController<DiagnosisOutput> {
  constructor(service: DiagnosesService) {
    super(service, { resource: 'diagnosis', idParam: 'diagnosis_id' });
  }
}

/** The `diagnoses` controller the routes register. */
export function createDiagnosesController(service: DiagnosesService): DiagnosesController {
  return new DiagnosesController(service);
}

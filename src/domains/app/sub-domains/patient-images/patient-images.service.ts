import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import type { PatientImagesRepository } from './patient-images.repository.js';
import { serializePatientImage } from './patient-images.serializer.js';
import type { PatientImageOutput } from './patient-images.types.js';
import {
  validateCreatePatientImage,
  validateListPatientImagesQuery,
  validateUpdatePatientImage,
} from './patient-images.validator.js';

/**
 * Patient images of the active organization (launch ROUTE #27): list, read, create, update,
 * soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Patient image')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class PatientImagesService extends BaseRecordService<PatientImageOutput> {
  constructor(organizationService: OrganizationService, repository: PatientImagesRepository) {
    super(organizationService, {
      label: 'Patient image',
      repository,
      parseCreate: validateCreatePatientImage,
      parseUpdate: validateUpdatePatientImage,
      parseList: validateListPatientImagesQuery,
      serialize: serializePatientImage,
      references: [
        { field: 'patient_id', table: patients, label: 'patient' },
        { field: 'appointment_id', table: appointments, label: 'appointment' },
      ],
      parent: { field: 'patient_id', table: patients, label: 'Patient' },
    });
  }
}

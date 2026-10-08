import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { ValidationError } from '@/shared/errors/index.js';
import { invoices } from '@/domains/app/sub-domains/billing/invoices/invoices.schema.js';
import { leads } from '@/domains/app/sub-domains/leads/leads.schema.js';
import { medical_contacts } from '@/domains/app/sub-domains/medical-contacts/medical-contacts.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { patient_prescriptions } from '@/domains/app/sub-domains/patients/patient-prescriptions/patient-prescriptions.schema.js';
import type { MedicalSalesRepository } from './medical-sales.repository.js';
import { serializeMedicalSale } from './medical-sales.serializer.js';
import type { MedicalSaleOutput } from './medical-sales.types.js';
import {
  validateCreateMedicalSale,
  validateListMedicalSalesQuery,
  validateUpdateMedicalSale,
} from './medical-sales.validator.js';

/**
 * Medical sales of the active organization (launch ROUTE #51): list, read, create, update,
 * soft-delete with a reason and restore, and the lifecycle actions `void`.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Medical sale')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class MedicalSalesService extends BaseRecordService<MedicalSaleOutput> {
  constructor(organizationService: OrganizationService, repository: MedicalSalesRepository) {
    super(organizationService, {
      label: 'Medical sale',
      repository,
      parseCreate: validateCreateMedicalSale,
      parseUpdate: validateUpdateMedicalSale,
      parseList: validateListMedicalSalesQuery,
      serialize: serializeMedicalSale,
      references: [
        { field: 'invoice_id', table: invoices, label: 'invoice' },
        { field: 'patient_id', table: patients, label: 'patient' },
        { field: 'medical_contact_id', table: medical_contacts, label: 'medical contact' },
        { field: 'prescription_id', table: patient_prescriptions, label: 'prescription' },
        { field: 'lead_id', table: leads, label: 'lead' },
      ],
      checkValues: (values) => {
        if (
          (values.patient_id === undefined || values.patient_id === null) &&
          (values.medical_contact_id === undefined || values.medical_contact_id === null)
        ) {
          throw new ValidationError(
            'errors:validation.recordFieldRule',
            { field: 'patient_id' },
            {
              patient_id: ['Name the patient or the walk-in customer'],
            },
          );
        }
      },
      transitions: {
        void: { from: ['sold'], set: { status: 'voided' }, stamp: ['voided_at'] },
      },
    });
  }
}

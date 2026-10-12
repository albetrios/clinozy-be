import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { invoice_items } from '@/domains/app/sub-domains/billing/invoices/invoices.schema.js';
import { offerings } from '@/domains/app/sub-domains/offerings/offerings.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import type { PatientOfferingsRepository } from './patient-offerings.repository.js';
import { patientOfferingsRules } from './patient-offerings.rules.js';
import { serializePatientOffering } from './patient-offerings.serializer.js';
import type { PatientOfferingOutput } from './patient-offerings.types.js';
import {
  refusePatientOfferingCreate,
  validateListPatientOfferingsQuery,
  validateUpdatePatientOffering,
} from './patient-offerings.validator.js';

/**
 * What a patient bought (launch ROUTE #135, routes-final 7.L): the list (the Packages tab with
 * `is_package=true`), read, and change the sessions or validity — bought only by invoicing it,
 * spent only by treatments (PK4, PK5).
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} nested under the patient (`patient_id` — a
 *   removed or unknown patient is a 404); the offering and the invoice line that sold it are references (its invoice read through the line). No create,
 *   delete or restore of its own — it comes and goes with its invoice (sub-domain 8). Reading needs
 *   `patient:read`, changing `payment:update` (the routes' gates).
 * - **Failure modes:** `NotFoundError('Patient offering')` / `('Patient')`; `ValidationError` for a
 *   bad body or query, `sessions_total` below what was spent or `valid_until` before the bill;
 *   `ConflictError` for a stale save.
 */
export class PatientOfferingsService extends BaseRecordService<PatientOfferingOutput> {
  constructor(organizationService: OrganizationService, repository: PatientOfferingsRepository) {
    super(organizationService, {
      label: 'Patient offering',
      repository,
      parseCreate: refusePatientOfferingCreate,
      parseUpdate: validateUpdatePatientOffering,
      parseList: validateListPatientOfferingsQuery,
      serialize: serializePatientOffering,
      references: [
        { field: 'patient_id', table: patients, label: 'patient' },
        { field: 'offering_id', table: offerings, label: 'offering' },
        { field: 'invoice_item_id', table: invoice_items, label: 'invoice line' },
      ],
      parent: { field: 'patient_id', table: patients, label: 'Patient' },
      ...patientOfferingsRules,
    });
  }
}

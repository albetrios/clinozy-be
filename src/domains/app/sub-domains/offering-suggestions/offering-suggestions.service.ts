import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { offerings } from '@/domains/app/sub-domains/offerings/offerings.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import type { OfferingSuggestionsRepository } from './offering-suggestions.repository.js';
import { serializeOfferingSuggestion } from './offering-suggestions.serializer.js';
import type { OfferingSuggestionOutput } from './offering-suggestions.types.js';
import {
  validateCreateOfferingSuggestion,
  validateListOfferingSuggestionsQuery,
  validateUpdateOfferingSuggestion,
} from './offering-suggestions.validator.js';

/**
 * Offering suggestions of the active organization (launch ROUTE #32): list, read, create, update,
 * soft-delete with a reason and restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} with this table's parsing, references and
 *   serializer; every call runs in the caller's organization context.
 * - **Failure modes:** `NotFoundError('Offering suggestion')`; `ValidationError` for a bad body or a
 *   reference that is no live record here; `ConflictError` for a stale save or a disallowed action.
 */
export class OfferingSuggestionsService extends BaseRecordService<OfferingSuggestionOutput> {
  constructor(organizationService: OrganizationService, repository: OfferingSuggestionsRepository) {
    super(organizationService, {
      label: 'Offering suggestion',
      repository,
      parseCreate: validateCreateOfferingSuggestion,
      parseUpdate: validateUpdateOfferingSuggestion,
      parseList: validateListOfferingSuggestionsQuery,
      serialize: serializeOfferingSuggestion,
      references: [
        { field: 'patient_id', table: patients, label: 'patient' },
        { field: 'offering_id', table: offerings, label: 'offering' },
        { field: 'appointment_id', table: appointments, label: 'appointment' },
      ],
      parent: { field: 'patient_id', table: patients, label: 'Patient' },
    });
  }
}

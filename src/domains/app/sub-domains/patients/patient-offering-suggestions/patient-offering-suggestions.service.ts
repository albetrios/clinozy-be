import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';
import type { OrganizationPrincipalDatabaseScope } from '@/infrastructure/database/contexts/database-context.js';
import { withAppDatabaseContext } from '@/infrastructure/database/contexts/database-context.js';
import { resolveRecordIds } from '@/domains/app/base-record.repository.js';
import { BaseRecordService } from '@/domains/app/base-record.service.js';
import type {
  BaseRecordListResult,
  BaseRecordVisibility,
} from '@/domains/app/base-record.types.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { offerings } from '@/domains/app/sub-domains/offerings/offerings.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { patient_check_ins } from '@/domains/app/sub-domains/patients/patient-check-ins/patient-check-ins.schema.js';
import type { PatientOfferingSuggestionsRepository } from './patient-offering-suggestions.repository.js';
import { createPatientOfferingSuggestionsRules } from './patient-offering-suggestions.rules.js';
import { serializePatientOfferingSuggestion } from './patient-offering-suggestions.serializer.js';
import type { PatientOfferingSuggestionOutput } from './patient-offering-suggestions.types.js';
import {
  validateCreatePatientOfferingSuggestion,
  validateListPatientOfferingSuggestionsQuery,
  validateUpdatePatientOfferingSuggestion,
} from './patient-offering-suggestions.validator.js';

/**
 * A patient's plan (launch ROUTE #135, routes-final 7.M): the offerings the team suggests — list
 * (with the plan's total), read, add, change quantity, price, status or reason, delete with a
 * reason, restore.
 *
 * @remarks
 * - **Algorithm:** the shared {@link BaseRecordService} nested under the patient (`patient_id` — a
 *   removed or unknown patient is a 404); the offering, the visit, the check-in and who suggested it
 *   are references. A list under the patient adds `meta.plan_total` — the live planned and accepted
 *   rows' price, or the offering's billed price × quantity (PK9). Reading needs `patient:read`,
 *   writing `patient:update` (the routes' gates).
 * - **Failure modes:** `NotFoundError('Patient offering suggestion')` / `('Patient')`;
 *   `ValidationError` for a bad body or query, an inactive offering or another contact's visit;
 *   `ConflictError` `suggestion_exists` (PK9), a stale save or a restore of a live row.
 */
export class PatientOfferingSuggestionsService extends BaseRecordService<PatientOfferingSuggestionOutput> {
  constructor(
    organizationService: OrganizationService,
    private readonly suggestionsRepository: PatientOfferingSuggestionsRepository,
  ) {
    super(organizationService, {
      label: 'Patient offering suggestion',
      repository: suggestionsRepository,
      parseCreate: validateCreatePatientOfferingSuggestion,
      parseUpdate: validateUpdatePatientOfferingSuggestion,
      parseList: validateListPatientOfferingSuggestionsQuery,
      serialize: serializePatientOfferingSuggestion,
      references: [
        { field: 'patient_id', table: patients, label: 'patient' },
        { field: 'offering_id', table: offerings, label: 'offering' },
        { field: 'appointment_id', table: appointments, label: 'appointment' },
        { field: 'patient_check_in_id', table: patient_check_ins, label: 'check-in' },
        { field: 'suggested_by_membership_id', table: memberships, label: 'team member' },
      ],
      parent: { field: 'patient_id', table: patients, label: 'Patient' },
      ...createPatientOfferingSuggestionsRules(suggestionsRepository),
    });
  }

  /** One page of the patient's plan, with `meta.plan_total` (PK9). */
  override async list(
    scope: OrganizationPrincipalDatabaseScope,
    query: unknown,
    options: {
      parentPublicId?: string | undefined;
      actingUserPublicId?: string | undefined;
      visibility?: BaseRecordVisibility | undefined;
      withTotal?: boolean | undefined;
      referenceIn?: Readonly<Record<string, readonly string[]>> | undefined;
    } = {},
  ): Promise<BaseRecordListResult<PatientOfferingSuggestionOutput>> {
    const page = await super.list(scope, query, options);
    if (options.parentPublicId === undefined) return page;
    const parentPublicId = options.parentPublicId;
    const planTotal = await withAppDatabaseContext(scope, async () => {
      const organizationId = await this.organizationId(scope);
      const patientId = (
        await resolveRecordIds({ table: patients, organizationId, publicIds: [parentPublicId] })
      ).get(parentPublicId);
      return patientId === undefined ? 0 : this.suggestionsRepository.planTotal(patientId);
    });
    return { ...page, meta: { plan_total: planTotal } };
  }
}

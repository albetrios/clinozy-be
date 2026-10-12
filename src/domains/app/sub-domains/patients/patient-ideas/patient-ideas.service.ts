import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import {
  type OrganizationPrincipalDatabaseScope,
  withAppDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import { NotFoundError } from '@/shared/errors/index.js';
import type { PatientIdeasRepository } from './patient-ideas.repository.js';
import { ruleIdeas } from './patient-ideas.rules.js';
import { serializePatientIdea } from './patient-ideas.serializer.js';
import type { PatientIdeasResult } from './patient-ideas.types.js';
import { validatePatientIdeasParams } from './patient-ideas.validator.js';

/**
 * A patient's offering ideas — "Ideas from history" in the plan (launch ROUTE #152, routes-final
 * 7.N).
 *
 * @remarks
 * - **Algorithm:** in one read context: the patient's live file, the organization's active
 *   offerings, the plan's offerings (any status but declined — never an idea) and the patient's
 *   history, through the prototype's rules ({@link ruleIdeas}).
 * - **Failure modes:** `ValidationError` for a malformed id; `NotFoundError('Patient')` for a
 *   patient not in the organization or deleted.
 * - **Side effects:** none — a read.
 */
export class PatientIdeasService {
  constructor(
    private readonly organizationService: OrganizationService,
    private readonly repository: PatientIdeasRepository,
  ) {}

  /** The plan's ideas for one patient. */
  async list({
    scope,
    params,
  }: {
    scope: OrganizationPrincipalDatabaseScope;
    params: unknown;
  }): Promise<PatientIdeasResult> {
    const { patient_id: patientPublicId } = validatePatientIdeasParams(params);
    return withAppDatabaseContext({
      scope,
      callback: async () => {
        const organization = await this.organizationService.requireOrganizationByPublicId(
          scope.organizationPublicId,
        );
        const patient = await this.repository.findPatient(organization.id, patientPublicId);
        if (!patient) throw new NotFoundError('Patient');
        const offerings = await this.repository.findActiveOfferings(organization.id);
        const excluded = new Set(await this.repository.findPlannedOfferingIds(patient.id));
        const history = await this.repository.findHistory(patient);
        return {
          data: ruleIdeas({ history, offerings, excluded }).map(serializePatientIdea),
        };
      },
    });
  }
}

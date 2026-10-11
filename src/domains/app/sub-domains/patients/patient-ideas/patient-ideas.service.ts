import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import {
  type OrganizationPrincipalDatabaseScope,
  withAppDatabaseContext,
} from '@/infrastructure/database/contexts/database-context.js';
import { isPatientIdeasAiEnabled } from '@/infrastructure/ai/anthropic-messages.config.js';
import { NotFoundError } from '@/shared/errors/index.js';
import { PATIENT_IDEA_SOURCE, PATIENT_IDEAS_ORIGIN } from './patient-ideas.constants.js';
import type { PatientIdeasRepository } from './patient-ideas.repository.js';
import { ruleIdeas } from './patient-ideas.rules.js';
import { serializePatientIdea } from './patient-ideas.serializer.js';
import type {
  IdeaOffering,
  PatientIdea,
  PatientIdeasResult,
  StoredPatientIdea,
} from './patient-ideas.types.js';
import { validatePatientIdeasParams } from './patient-ideas.validator.js';

/**
 * A patient's offering ideas — "Ideas from history" in the plan (launch ROUTE #152, routes-final
 * 7.N, D80).
 *
 * @remarks
 * - **Algorithm:** in one read context: the patient's live file, the organization's active
 *   offerings and the plan's offerings (any status but declined — never an idea). With Data
 *   consent and `PATIENT_IDEAS_AI_ENABLED`, the stored AI ideas that still name an active offering
 *   outside the plan answer (`meta.source` `ai`, `meta.ai_refreshed_at`); else the prototype's
 *   rules ({@link ruleIdeas}) on the patient's history (`meta.source` `rules`).
 * - **Failure modes:** `ValidationError` for a malformed id; `NotFoundError('Patient')` for a
 *   patient not in the organization or deleted.
 * - **Side effects:** none — a read.
 */
export class PatientIdeasService {
  constructor(
    private readonly organizationService: OrganizationService,
    private readonly repository: PatientIdeasRepository,
  ) {}

  /** The plan's ideas for one patient, with where they came from. */
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
        if (isPatientIdeasAiEnabled() && patient.hasDataConsent) {
          const stored = await this.repository.findStoredIdeas(patient.id);
          const aiIdeas = usableStoredIdeas({ stored, offerings, excluded });
          if (aiIdeas.length > 0) {
            const refreshedAt = stored.reduce(
              (latest, idea) => (idea.createdAt > latest ? idea.createdAt : latest),
              new Date(0),
            );
            return {
              data: aiIdeas.map(serializePatientIdea),
              meta: { source: PATIENT_IDEAS_ORIGIN.AI, ai_refreshed_at: refreshedAt.toISOString() },
            };
          }
        }
        const history = await this.repository.findHistory(patient);
        return {
          data: ruleIdeas({ history, offerings, excluded }).map(serializePatientIdea),
          meta: { source: PATIENT_IDEAS_ORIGIN.RULES, ai_refreshed_at: null },
        };
      },
    });
  }
}

/**
 * The stored AI ideas that still hold (PI2): an active offering, outside the plan — an offering
 * switched off or planned since the refresh drops out until the next one.
 */
function usableStoredIdeas(options: {
  stored: readonly StoredPatientIdea[];
  offerings: readonly IdeaOffering[];
  excluded: ReadonlySet<number>;
}): PatientIdea[] {
  const byId = new Map(options.offerings.map((offering) => [offering.id, offering]));
  const ideas: PatientIdea[] = [];
  for (const idea of options.stored) {
    const offering = byId.get(idea.offeringId);
    if (!offering || options.excluded.has(offering.id)) continue;
    ideas.push({ offering, reason: idea.reason, source: PATIENT_IDEA_SOURCE.AI });
  }
  return ideas;
}

import { runOrganizationScopedWorkerJob } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import { ProviderOutageError } from '@/infrastructure/queue/worker-runtime/provider-outage-pause.util.js';
import { createAnthropicMessage } from '@/infrastructure/ai/anthropic-messages.client.js';
import { findAnthropicApiError } from '@/infrastructure/ai/anthropic-error.util.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import { createWorkerPatientIdeasRepository } from '@/domains/app/sub-domains/patients/patient-ideas/patient-ideas.repository.js';
import {
  buildIdeasPrompt,
  parseIdeasAnswer,
} from '@/domains/app/sub-domains/patients/patient-ideas/patient-ideas.ai.js';
import {
  PATIENT_IDEAS_MAX_TOKENS,
  PATIENT_IDEAS_REFRESH_BATCH,
} from '@/domains/app/sub-domains/patients/patient-ideas/patient-ideas.constants.js';
import type {
  IdeaOffering,
  PatientIdea,
  PatientIdeasSummary,
  StalePatient,
} from '@/domains/app/sub-domains/patients/patient-ideas/patient-ideas.types.js';

/**
 * What one ideas job did (its return value, logged as `patient-ideas.completed`).
 *
 * @remarks
 * - **Notes:** `refreshedCount` — patients whose AI ideas were replaced; `removedCount` — patients
 *   without Data consent whose ideas were deleted; `unreadCount` — answers that were not the JSON
 *   asked for, or a request Anthropic refused (nothing stored, the rules stay shown);
 *   `supersededCount` — patients written to again meanwhile (taken again by the next run).
 */
export interface PatientIdeasRunCounts {
  refreshedCount: number;
  removedCount: number;
  unreadCount: number;
  supersededCount: number;
}

/** One stale patient as read for the refresh: consent, and for a consenting one its summary. */
interface RefreshItem {
  patient: StalePatient;
  summary: PatientIdeasSummary | null;
  excluded: ReadonlySet<number>;
}

/** The refresh's read: the organization, its menu and up to a batch of stale patients. */
async function readRefreshBatch(organizationPublicId: string): Promise<{
  organizationId: number;
  offerings: IdeaOffering[];
  items: RefreshItem[];
} | null> {
  return runOrganizationScopedWorkerJob({ organizationPublicId }, async (databaseHandle) => {
    const repository = createWorkerPatientIdeasRepository(databaseHandle);
    const organizationId = await repository.findOrganizationId(organizationPublicId);
    if (organizationId === null) return null;
    const offerings = await repository.findActiveOfferings(organizationId);
    const items: RefreshItem[] = [];
    for (const patient of await repository.findStalePatients(
      organizationId,
      PATIENT_IDEAS_REFRESH_BATCH,
    )) {
      if (!patient.hasDataConsent) {
        items.push({ patient, summary: null, excluded: new Set() });
        continue;
      }
      items.push({
        patient,
        summary: await repository.findSummary(patient),
        excluded: new Set(await repository.findPlannedOfferingIds(patient.id)),
      });
    }
    return { organizationId, offerings, items };
  });
}

/**
 * Claude's ideas for one consenting patient — outside any database context. `null` when the answer
 * is unreadable or Anthropic refused this one request; a throttle pauses the queue
 * (`ProviderOutageError`); any other failure propagates.
 */
async function askForIdeas(options: {
  summary: PatientIdeasSummary;
  offerings: readonly IdeaOffering[];
  excluded: ReadonlySet<number>;
}): Promise<PatientIdea[] | null> {
  if (options.offerings.length === 0) return [];
  const { system, prompt } = buildIdeasPrompt({
    summary: options.summary,
    offerings: options.offerings,
  });
  try {
    const text = await createAnthropicMessage({
      system,
      prompt,
      maxTokens: PATIENT_IDEAS_MAX_TOKENS,
    });
    return parseIdeasAnswer({ text, offerings: options.offerings, excluded: options.excluded });
  } catch (error) {
    const apiError = findAnthropicApiError(error);
    if (apiError?.isRateLimited) {
      throw new ProviderOutageError({
        provider: 'anthropic',
        cause: error,
        retryAfterMs: apiError.retryAfterMs,
      });
    }
    if (apiError?.isRequestRejection) {
      logger.warn(
        { statusCode: apiError.statusCode, errorType: apiError.errorType },
        'patient-ideas.request_refused',
      );
      return null;
    }
    throw error;
  }
}

/**
 * Refreshes one organization's AI offering ideas (WC-47, D80, routes-final 7.N PI5): the patients
 * marked stale, oldest mark first, up to a batch.
 *
 * @remarks
 * - **Algorithm:** one short read in the organization's context — the menu and each patient's
 *   consent, de-identified summary and planned offerings; then, outside any context, Claude per
 *   consenting patient ({@link askForIdeas}); then per patient a short write that clears the mark
 *   only if it still holds what was read (compare-and-clear) and, only then, replaces the stored
 *   ideas — Claude's, or none (no consent, an unreadable answer: the rules stay shown).
 * - **Failure modes:** an Anthropic throttle or outage pauses the queue (`anthropic` provider) and
 *   the job waits; other errors take BullMQ's retry/backoff. Patients already written keep their
 *   result; the rest stay marked.
 * - **Side effects:** Anthropic Messages API calls; `app.patient_ideas` replaced, the patients'
 *   `ideas_stale_since` cleared.
 */
export async function runPatientIdeasJob(
  organizationPublicId: string,
): Promise<PatientIdeasRunCounts> {
  const counts: PatientIdeasRunCounts = {
    refreshedCount: 0,
    removedCount: 0,
    unreadCount: 0,
    supersededCount: 0,
  };
  const batch = await readRefreshBatch(organizationPublicId);
  if (batch === null) return counts;
  for (const item of batch.items) {
    const ideas =
      item.summary === null
        ? []
        : await askForIdeas({
            summary: item.summary,
            offerings: batch.offerings,
            excluded: item.excluded,
          });
    const written = await runOrganizationScopedWorkerJob(
      { organizationPublicId },
      async (databaseHandle) => {
        const repository = createWorkerPatientIdeasRepository(databaseHandle);
        const cleared = await repository.clearStaleMark({
          patientId: item.patient.id,
          staleSince: item.patient.staleSince,
        });
        if (!cleared) return false;
        await repository.replaceIdeas({
          organizationId: batch.organizationId,
          patientId: item.patient.id,
          ideas: (ideas ?? []).map((idea) => ({
            offeringId: idea.offering.id,
            reason: idea.reason,
          })),
        });
        return true;
      },
    );
    if (!written) counts.supersededCount += 1;
    else if (item.summary === null) counts.removedCount += 1;
    else if (ideas === null) counts.unreadCount += 1;
    else counts.refreshedCount += 1;
  }
  logger.info({ organizationPublicId, ...counts }, 'patient-ideas.completed');
  return counts;
}

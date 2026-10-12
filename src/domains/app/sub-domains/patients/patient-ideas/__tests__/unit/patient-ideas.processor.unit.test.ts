import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  repository: {
    findOrganizationId: vi.fn(),
    findActiveOfferings: vi.fn(),
    findStalePatients: vi.fn(),
    findSummary: vi.fn(),
    findPlannedOfferingIds: vi.fn(),
    clearStaleMark: vi.fn(),
    replaceIdeas: vi.fn(),
  },
  createAnthropicMessage: vi.fn(),
  reserveIdeasCall: vi.fn(),
  contextDepth: 0,
}));

vi.mock('@/infrastructure/queue/worker-runtime/worker-processor.util.js', () => ({
  runOrganizationScopedWorkerJob: async ({
    processor,
  }: {
    processor: (handle: unknown, job: unknown) => Promise<unknown>;
  }) => {
    mocks.contextDepth += 1;
    try {
      return await processor({ kind: 'organization' }, {});
    } finally {
      mocks.contextDepth -= 1;
    }
  },
}));
vi.mock('@/domains/app/sub-domains/patients/patient-ideas/patient-ideas.repository.js', () => ({
  createWorkerPatientIdeasRepository: () => mocks.repository,
}));
vi.mock('@/infrastructure/ai/anthropic-messages.client.js', () => ({
  createAnthropicMessage: (options: unknown) => {
    // No database context is held across the call to Anthropic.
    expect(mocks.contextDepth).toBe(0);
    return mocks.createAnthropicMessage(options);
  },
}));
vi.mock('@/domains/app/sub-domains/patients/patient-ideas/patient-ideas.call-budget.js', () => ({
  reserveIdeasCall: mocks.reserveIdeasCall,
}));
vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { runPatientIdeasJob } from '@/domains/app/sub-domains/patients/patient-ideas/workers/patient-ideas.processor.js';
import {
  AnthropicApiError,
  AnthropicIncompleteAnswerError,
} from '@/infrastructure/ai/anthropic-error.util.js';
import { ProviderOutageError } from '@/infrastructure/queue/worker-runtime/provider-outage-pause.util.js';
import { ExternalServiceError } from '@/infrastructure/outbound/outbound-error.js';
import type { IdeaOffering } from '@/domains/app/sub-domains/patients/patient-ideas/patient-ideas.types.js';

const ORGANIZATION_PUBLIC_ID = 'org_aaaaaaaaaaaaaaaaaaaaa';
const OFFERINGS: IdeaOffering[] = [
  {
    id: 11,
    publicId: 'ofr_aaaaaaaaaaaaaaaaaaaab',
    name: 'Chemical peel',
    category: 'Skin',
    sessions: 1,
    price: '1500.00',
  },
  {
    id: 12,
    publicId: 'ofr_aaaaaaaaaaaaaaaaaaaac',
    name: 'PRP',
    category: 'Hair',
    sessions: 1,
    price: '4000.00',
  },
];
const STALE_SINCE = '2026-10-09T06:00:00.123456Z';

/** A stale patient the refresh takes. */
function stalePatient(id: number, hasDataConsent = true) {
  return { id, contactId: id * 10, hasDataConsent, staleSince: STALE_SINCE };
}

/** An Anthropic error answer wrapped as `outboundCall` throws it. */
function anthropicFailure(statusCode: number) {
  return new ExternalServiceError({
    integration: 'anthropic',
    category: statusCode >= 500 ? 'http_5xx' : 'http_4xx',
    status: statusCode,
    cause: new AnthropicApiError({
      statusCode,
      body: JSON.stringify({ error: { type: 'x', message: 'no' } }),
      retryAfterSeconds: '3',
    }),
  });
}

/** One organization's AI ideas refresh (WC-47, D80, PI5). */
describe('runPatientIdeasJob', () => {
  beforeEach(() => {
    mocks.contextDepth = 0;
    for (const method of Object.values(mocks.repository)) method.mockReset();
    mocks.createAnthropicMessage.mockReset();
    mocks.reserveIdeasCall.mockReset().mockResolvedValue(true);
    mocks.repository.findOrganizationId.mockResolvedValue(7);
    mocks.repository.findActiveOfferings.mockResolvedValue(OFFERINGS);
    mocks.repository.findSummary.mockResolvedValue({
      complaints: ['acne'],
      diagnoses: [],
      treatments: [],
      packages: [],
      completed_visits: 1,
      already_planned: [],
    });
    mocks.repository.findPlannedOfferingIds.mockResolvedValue([]);
    mocks.repository.clearStaleMark.mockResolvedValue(true);
    mocks.repository.replaceIdeas.mockResolvedValue(undefined);
  });

  it('I4: past the daily call budget the rest stay marked; a patient without consent is still cleared', async () => {
    mocks.repository.findStalePatients.mockResolvedValue([
      stalePatient(1),
      stalePatient(2),
      stalePatient(3, false),
      stalePatient(4),
    ]);
    mocks.reserveIdeasCall.mockResolvedValueOnce(true).mockResolvedValue(false);
    mocks.createAnthropicMessage.mockResolvedValue(JSON.stringify({ ideas: [] }));

    expect(await runPatientIdeasJob(ORGANIZATION_PUBLIC_ID)).toEqual({
      refreshedCount: 1,
      removedCount: 1,
      unreadCount: 0,
      supersededCount: 0,
      cappedCount: 2,
    });
    expect(mocks.createAnthropicMessage).toHaveBeenCalledOnce();
    expect(mocks.repository.clearStaleMark.mock.calls.map((call) => call[0].patientId)).toEqual([
      1, 3,
    ]);
    expect(mocks.reserveIdeasCall).toHaveBeenCalledTimes(2);
  });

  it("stores Claude's ideas for a consenting patient and clears the mark it read", async () => {
    mocks.repository.findStalePatients.mockResolvedValue([stalePatient(1)]);
    mocks.createAnthropicMessage.mockResolvedValue(
      JSON.stringify({ ideas: [{ offering_id: OFFERINGS[0]?.publicId, reason: 'Clears acne' }] }),
    );

    expect(await runPatientIdeasJob(ORGANIZATION_PUBLIC_ID)).toEqual({
      refreshedCount: 1,
      removedCount: 0,
      unreadCount: 0,
      supersededCount: 0,
      cappedCount: 0,
    });
    expect(mocks.repository.clearStaleMark).toHaveBeenCalledWith({
      patientId: 1,
      staleSince: STALE_SINCE,
    });
    expect(mocks.repository.replaceIdeas).toHaveBeenCalledWith({
      organizationId: 7,
      patientId: 1,
      ideas: [{ offeringId: 11, reason: 'Clears acne' }],
    });
  });

  it('deletes the ideas of a patient without Data consent — Claude is never asked', async () => {
    mocks.repository.findStalePatients.mockResolvedValue([stalePatient(2, false)]);

    expect((await runPatientIdeasJob(ORGANIZATION_PUBLIC_ID)).removedCount).toBe(1);
    expect(mocks.createAnthropicMessage).not.toHaveBeenCalled();
    expect(mocks.repository.findSummary).not.toHaveBeenCalled();
    expect(mocks.repository.replaceIdeas).toHaveBeenCalledWith({
      organizationId: 7,
      patientId: 2,
      ideas: [],
    });
  });

  it('stores nothing from an unreadable answer — the rules stay shown', async () => {
    mocks.repository.findStalePatients.mockResolvedValue([stalePatient(3)]);
    mocks.createAnthropicMessage.mockResolvedValue('I would suggest a peel.');

    expect((await runPatientIdeasJob(ORGANIZATION_PUBLIC_ID)).unreadCount).toBe(1);
    expect(mocks.repository.replaceIdeas).toHaveBeenCalledWith({
      organizationId: 7,
      patientId: 3,
      ideas: [],
    });
  });

  it('counts a request Anthropic refused as unread and carries on with the next patient', async () => {
    mocks.repository.findStalePatients.mockResolvedValue([stalePatient(4), stalePatient(5)]);
    mocks.createAnthropicMessage
      .mockRejectedValueOnce(anthropicFailure(400))
      .mockResolvedValueOnce('{"ideas":[]}');

    expect(await runPatientIdeasJob(ORGANIZATION_PUBLIC_ID)).toEqual({
      refreshedCount: 1,
      removedCount: 0,
      unreadCount: 1,
      supersededCount: 0,
      cappedCount: 0,
    });
  });

  it.each(['max_tokens', 'refusal'] as const)(
    'counts an answer that stopped on %s as unread and carries on with the next patient',
    async (stopReason) => {
      mocks.repository.findStalePatients.mockResolvedValue([stalePatient(4), stalePatient(5)]);
      mocks.createAnthropicMessage
        .mockRejectedValueOnce(new AnthropicIncompleteAnswerError(stopReason))
        .mockResolvedValueOnce('{"ideas":[]}');

      expect(await runPatientIdeasJob(ORGANIZATION_PUBLIC_ID)).toEqual({
        refreshedCount: 1,
        removedCount: 0,
        unreadCount: 1,
        supersededCount: 0,
        cappedCount: 0,
      });
    },
  );

  it('leaves a patient written to meanwhile for the next run', async () => {
    mocks.repository.findStalePatients.mockResolvedValue([stalePatient(6)]);
    mocks.createAnthropicMessage.mockResolvedValue('{"ideas":[]}');
    mocks.repository.clearStaleMark.mockResolvedValue(false);

    expect((await runPatientIdeasJob(ORGANIZATION_PUBLIC_ID)).supersededCount).toBe(1);
    expect(mocks.repository.replaceIdeas).not.toHaveBeenCalled();
  });

  it('pauses the queue on a throttle, keeping the patients already written', async () => {
    mocks.repository.findStalePatients.mockResolvedValue([stalePatient(7), stalePatient(8)]);
    mocks.createAnthropicMessage
      .mockResolvedValueOnce('{"ideas":[]}')
      .mockRejectedValueOnce(anthropicFailure(429));

    const error = await runPatientIdeasJob(ORGANIZATION_PUBLIC_ID).catch((caught) => caught);

    expect(error).toBeInstanceOf(ProviderOutageError);
    expect(mocks.repository.replaceIdeas).toHaveBeenCalledTimes(1);
  });

  it('lets an outage take BullMQ retry', async () => {
    mocks.repository.findStalePatients.mockResolvedValue([stalePatient(9)]);
    const outage = anthropicFailure(500);
    mocks.createAnthropicMessage.mockRejectedValueOnce(outage);

    await expect(runPatientIdeasJob(ORGANIZATION_PUBLIC_ID)).rejects.toBe(outage);
    expect(mocks.repository.clearStaleMark).not.toHaveBeenCalled();
  });

  it('stores no ideas without an active offering — nothing to ask', async () => {
    mocks.repository.findActiveOfferings.mockResolvedValue([]);
    mocks.repository.findStalePatients.mockResolvedValue([stalePatient(10)]);

    expect((await runPatientIdeasJob(ORGANIZATION_PUBLIC_ID)).refreshedCount).toBe(1);
    expect(mocks.createAnthropicMessage).not.toHaveBeenCalled();
  });

  it('does nothing for an organization that is gone', async () => {
    mocks.repository.findOrganizationId.mockResolvedValue(null);

    expect(await runPatientIdeasJob(ORGANIZATION_PUBLIC_ID)).toEqual({
      refreshedCount: 0,
      removedCount: 0,
      unreadCount: 0,
      supersededCount: 0,
      cappedCount: 0,
    });
    expect(mocks.repository.findStalePatients).not.toHaveBeenCalled();
  });
});

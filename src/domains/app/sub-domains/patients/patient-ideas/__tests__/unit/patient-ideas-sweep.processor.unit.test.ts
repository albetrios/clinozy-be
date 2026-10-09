import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findOrganizationsWithStaleIdeas: vi.fn(),
  enqueuePatientIdeas: vi.fn(),
}));

vi.mock('@/infrastructure/queue/worker-runtime/worker-processor.util.js', () => ({
  runGlobalRetentionWorkerJob: (work: (handle: unknown) => unknown) => work({ kind: 'retention' }),
}));
vi.mock('@/domains/app/sub-domains/patients/patient-ideas/patient-ideas.repository.js', () => ({
  findOrganizationsWithStaleIdeas: mocks.findOrganizationsWithStaleIdeas,
}));
vi.mock('@/domains/app/sub-domains/patients/patient-ideas/queues/patient-ideas.queue.js', () => ({
  enqueuePatientIdeas: mocks.enqueuePatientIdeas,
}));
vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { runPatientIdeasSweepJob } from '@/domains/app/sub-domains/patients/patient-ideas/workers/patient-ideas-sweep.processor.js';
import { PATIENT_IDEAS_SWEEP_BATCH } from '@/domains/app/sub-domains/patients/patient-ideas/patient-ideas.constants.js';

/** `count` organizations with ids from `firstId`. */
function organizations(firstId: number, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: firstId + index,
    publicId: `org_${String(firstId + index).padStart(21, 'a')}`,
  }));
}

/** The AI ideas sweep (WC-47, D80): one job per organization with stale patients, page by page. */
describe('runPatientIdeasSweepJob', () => {
  beforeEach(() => {
    mocks.findOrganizationsWithStaleIdeas.mockReset();
    mocks.enqueuePatientIdeas.mockReset().mockResolvedValue(undefined);
  });

  it('pages through the organizations in id order and adds each one job', async () => {
    mocks.findOrganizationsWithStaleIdeas
      .mockResolvedValueOnce(organizations(1, PATIENT_IDEAS_SWEEP_BATCH))
      .mockResolvedValueOnce(organizations(PATIENT_IDEAS_SWEEP_BATCH + 1, 1));

    expect(await runPatientIdeasSweepJob()).toEqual({
      enqueuedCount: PATIENT_IDEAS_SWEEP_BATCH + 1,
      failedCount: 0,
    });
    expect(mocks.findOrganizationsWithStaleIdeas.mock.calls.map((call) => call[1])).toEqual([
      0,
      PATIENT_IDEAS_SWEEP_BATCH,
    ]);
    expect(mocks.enqueuePatientIdeas).toHaveBeenCalledWith(organizations(1, 1)[0]?.publicId);
  });

  it('adds nothing when no patient is stale', async () => {
    mocks.findOrganizationsWithStaleIdeas.mockResolvedValueOnce([]);

    expect(await runPatientIdeasSweepJob()).toEqual({ enqueuedCount: 0, failedCount: 0 });
    expect(mocks.enqueuePatientIdeas).not.toHaveBeenCalled();
  });

  it('skips an add Redis refuses — the marks stay and the next sweep adds it again', async () => {
    mocks.findOrganizationsWithStaleIdeas.mockResolvedValueOnce(organizations(1, 3));
    mocks.enqueuePatientIdeas.mockRejectedValueOnce(new Error('redis down'));

    expect(await runPatientIdeasSweepJob()).toEqual({ enqueuedCount: 2, failedCount: 1 });
  });

  it('a read error propagates so BullMQ retries the sweep', async () => {
    mocks.findOrganizationsWithStaleIdeas.mockRejectedValueOnce(new Error('database down'));

    await expect(runPatientIdeasSweepJob()).rejects.toThrow('database down');
  });
});

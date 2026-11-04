import { UnrecoverableError } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { markPatientImageThumbnailJobFailed, fakeWorker } = vi.hoisted(() => {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  return {
    markPatientImageThumbnailJobFailed: vi.fn(),
    // The BullMQ worker's event surface, recording each listener
    fakeWorker: {
      on(event: string, listener: (...args: unknown[]) => void) {
        listeners.set(event, [...(listeners.get(event) ?? []), listener]);
        return this;
      },
      emit(event: string, ...args: unknown[]) {
        for (const listener of listeners.get(event) ?? []) listener(...args);
      },
    },
  };
});

vi.mock(
  '@/domains/app/sub-domains/patients/patient-images/workers/patient-image-thumbnail.processor.js',
  () => ({ markPatientImageThumbnailJobFailed, syncPatientImageThumbnail: vi.fn() }),
);
vi.mock('@/infrastructure/queue/worker-runtime/provider-outage-pause.util.js', () => ({
  createProviderPausableWorker: () => fakeWorker,
}));
vi.mock('@/infrastructure/queue/worker-runtime/worker-close.util.js', () => ({
  buildWorkerHandle: ({ worker, queueName }: { worker: unknown; queueName: string }) => ({
    worker,
    queueName,
    close: async () => undefined,
  }),
}));

import {
  createPatientImageThumbnailWorker,
  recordPatientImageThumbnailFinalFailure,
} from '@/domains/app/sub-domains/patients/patient-images/workers/patient-image-thumbnail.worker.js';
import { PATIENT_IMAGE_THUMBNAIL_RECONCILE_JOB_NAME } from '@/domains/app/sub-domains/patients/patient-images/workers/patient-image-thumbnail.constants.js';

const PHOTO = { organizationPublicId: 'org_abc', patientImagePublicId: 'pimg_abc' };
const STALLED_OUT = new UnrecoverableError('job stalled more than allowable limit');

/** A photo job as BullMQ hands it to `failed`. */
function photoJob(attemptsMade: number, data: unknown = PHOTO) {
  return { name: 'sync', data, opts: { attempts: 5 }, attemptsMade };
}

/**
 * A crash cannot loop: a photo whose job fails for good — it stalled past the limit (the worker
 * died under it) or used every attempt — is marked `job_failed`, so the sweep never re-queues it.
 */
describe('recordPatientImageThumbnailFinalFailure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markPatientImageThumbnailJobFailed.mockResolvedValue(true);
  });

  it('marks a photo whose job stalled past the limit (BullMQ fails it without running it)', async () => {
    await expect(
      recordPatientImageThumbnailFinalFailure({ job: photoJob(1), error: STALLED_OUT }),
    ).resolves.toBe(true);
    expect(markPatientImageThumbnailJobFailed).toHaveBeenCalledWith(PHOTO);
  });

  it('marks a photo whose job used its last attempt', async () => {
    await expect(
      recordPatientImageThumbnailFinalFailure({ job: photoJob(5), error: new Error('S3 503') }),
    ).resolves.toBe(true);
    expect(markPatientImageThumbnailJobFailed).toHaveBeenCalledWith(PHOTO);
  });

  it.each([
    ['a failure that will be retried', photoJob(2), new Error('S3 503')],
    [
      'the sweep’s own job',
      { ...photoJob(1), name: PATIENT_IMAGE_THUMBNAIL_RECONCILE_JOB_NAME, data: {} },
      STALLED_OUT,
    ],
    ['a malformed payload (already dead-lettered)', photoJob(1, { nope: true }), STALLED_OUT],
    ['no job at all', undefined, STALLED_OUT],
  ])('records nothing for %s', async (_label, job, error) => {
    await expect(recordPatientImageThumbnailFinalFailure({ job, error })).resolves.toBe(false);
    expect(markPatientImageThumbnailJobFailed).not.toHaveBeenCalled();
  });
});

describe('createPatientImageThumbnailWorker', () => {
  it('listens to failed: a stalled-out photo job is marked, a listener error is only logged', async () => {
    vi.clearAllMocks();
    createPatientImageThumbnailWorker({ createThumbnail: vi.fn(), deleteThumbnail: vi.fn() });
    markPatientImageThumbnailJobFailed.mockRejectedValueOnce(new Error('database down'));
    fakeWorker.emit('failed', photoJob(1), STALLED_OUT);
    markPatientImageThumbnailJobFailed.mockResolvedValueOnce(true);
    fakeWorker.emit('failed', photoJob(1), STALLED_OUT);
    await vi.waitFor(() => expect(markPatientImageThumbnailJobFailed).toHaveBeenCalledTimes(2));
  });
});

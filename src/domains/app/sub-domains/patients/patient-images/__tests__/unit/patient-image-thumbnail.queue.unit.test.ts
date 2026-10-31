import { beforeEach, describe, expect, it, vi } from 'vitest';

const addMock = vi.fn().mockResolvedValue(undefined);

vi.mock('bullmq', () => ({
  Queue: class {
    add = addMock;
    close = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock('@/infrastructure/queue/connection.js', () => ({
  getBullMQKeyPrefix: () => 'test:bull',
  getBullMQProducerConnectionOptions: () => ({}),
}));

vi.mock('@/infrastructure/observability/tracing/trace-context.util.js', () => ({
  captureTraceContextForPropagation: () => ({}),
}));

import {
  enqueuePatientImageThumbnailSync,
  requestPatientImageThumbnailSync,
} from '@/domains/app/sub-domains/patients/patient-images/queues/patient-image-thumbnail.queue.js';

const PHOTO = { organizationPublicId: 'org_abc', patientImagePublicId: 'pimg_abc' };

/**
 * The thumbnail job's identity: one waiting job per photo and one more while it runs — a delete
 * committed while its thumbnail is being made must still remove it.
 */
describe('patient image thumbnail queue', () => {
  beforeEach(() => {
    addMock.mockReset();
    addMock.mockResolvedValue(undefined);
  });

  it('keys each add to its photo, keeps the latest while one runs, and carries the organization', async () => {
    await enqueuePatientImageThumbnailSync(PHOTO);
    const [jobName, jobData, options] = addMock.mock.calls[0]! as [
      string,
      Record<string, unknown>,
      { jobId: string; deduplication: unknown },
    ];
    expect(jobName).toBe('sync-patient-image-thumbnail');
    expect(jobData).toMatchObject(PHOTO);
    expect(options.deduplication).toEqual({
      id: 'patient-image-thumbnail-pimg_abc',
      keepLastIfActive: true,
    });
    expect(options.jobId).toMatch(/^patient-image-thumbnail-pimg_abc-/);
  });

  it('gives every add a unique jobId, so a restore after a delete is never swallowed', async () => {
    await enqueuePatientImageThumbnailSync(PHOTO);
    await enqueuePatientImageThumbnailSync(PHOTO);
    const jobIds = addMock.mock.calls.map((call) => (call[2] as { jobId: string }).jobId);
    expect(new Set(jobIds).size).toBe(2);
  });

  it('never throws from a write: a Redis outage is logged and left to the sweep', async () => {
    addMock.mockRejectedValue(new Error('redis down'));
    await expect(requestPatientImageThumbnailSync(PHOTO)).resolves.toBeUndefined();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findMock, enqueueMock } = vi.hoisted(() => ({ findMock: vi.fn(), enqueueMock: vi.fn() }));

vi.mock('@/infrastructure/queue/worker-runtime/worker-processor.util.js', () => ({
  runGlobalRetentionWorkerJob: vi.fn(async (processor: (handle: unknown) => Promise<unknown>) =>
    processor({}),
  ),
}));
vi.mock(
  '@/domains/app/sub-domains/patients/patient-images/patient-image-thumbnail.repository.js',
  () => ({ findPatientImagesOutOfThumbnailSync: findMock }),
);
vi.mock(
  '@/domains/app/sub-domains/patients/patient-images/queues/patient-image-thumbnail.queue.js',
  () => ({ enqueuePatientImageThumbnailSync: enqueueMock }),
);

import { runPatientImageThumbnailReconcileJob } from '@/domains/app/sub-domains/patients/patient-images/workers/patient-image-thumbnail-reconcile.processor.js';
import {
  PATIENT_IMAGE_THUMBNAIL_SWEEP_BATCH,
  PATIENT_IMAGE_THUMBNAIL_SWEEP_GRACE_MS,
  PATIENT_IMAGE_THUMBNAIL_SWEEP_WINDOW_MS,
} from '@/domains/app/sub-domains/patients/patient-images/workers/patient-image-thumbnail.constants.js';

const photo = (id: number) => ({ id, publicId: `pimg_${id}`, organizationPublicId: 'org_abc' });

/** The thumbnail sweep re-adds photos whose enqueue was lost, page by page. */
describe('runPatientImageThumbnailReconcileJob', () => {
  beforeEach(() => {
    findMock.mockReset();
    enqueueMock.mockReset();
    enqueueMock.mockResolvedValue(undefined);
  });

  it('reads the grace-to-window range and re-adds each photo with its organization', async () => {
    const now = new Date('2026-10-31T12:00:00Z');
    findMock.mockResolvedValueOnce([photo(1), photo(2)]);
    await expect(runPatientImageThumbnailReconcileJob(now)).resolves.toEqual({
      enqueuedCount: 2,
      failedCount: 0,
    });
    expect(findMock).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        afterId: 0,
        createdBefore: new Date(now.getTime() - PATIENT_IMAGE_THUMBNAIL_SWEEP_GRACE_MS),
        createdAfter: new Date(now.getTime() - PATIENT_IMAGE_THUMBNAIL_SWEEP_WINDOW_MS),
      }),
    );
    expect(enqueueMock).toHaveBeenCalledWith({
      organizationPublicId: 'org_abc',
      patientImagePublicId: 'pimg_2',
    });
  });

  it('pages on by id after a full batch, and counts a failed add without stopping', async () => {
    const fullBatch = Array.from({ length: PATIENT_IMAGE_THUMBNAIL_SWEEP_BATCH }, (_, index) =>
      photo(index + 1),
    );
    findMock.mockResolvedValueOnce(fullBatch).mockResolvedValueOnce([photo(999)]);
    enqueueMock.mockRejectedValueOnce(new Error('redis down'));
    const result = await runPatientImageThumbnailReconcileJob();
    expect(findMock).toHaveBeenCalledTimes(2);
    expect(findMock.mock.calls[1]?.[1]).toMatchObject({
      afterId: PATIENT_IMAGE_THUMBNAIL_SWEEP_BATCH,
    });
    expect(result).toEqual({ enqueuedCount: PATIENT_IMAGE_THUMBNAIL_SWEEP_BATCH, failedCount: 1 });
  });
});

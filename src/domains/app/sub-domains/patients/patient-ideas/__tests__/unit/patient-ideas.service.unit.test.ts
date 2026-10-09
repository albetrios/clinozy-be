import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ aiEnabled: false }));

vi.mock('@/infrastructure/database/contexts/database-context.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/infrastructure/database/contexts/database-context.js')
  >()),
  withAppDatabaseContext: (_scope: unknown, work: () => unknown) => work(),
}));
vi.mock('@/infrastructure/ai/anthropic-messages.config.js', () => ({
  isPatientIdeasAiEnabled: () => mocks.aiEnabled,
}));

import type { OrganizationPrincipalDatabaseScope } from '@/infrastructure/database/contexts/database-context.js';
import { NotFoundError, ValidationError } from '@/shared/errors/index.js';
import { PatientIdeasService } from '@/domains/app/sub-domains/patients/patient-ideas/patient-ideas.service.js';
import type { PatientIdeasRepository } from '@/domains/app/sub-domains/patients/patient-ideas/patient-ideas.repository.js';
import type { IdeaOffering } from '@/domains/app/sub-domains/patients/patient-ideas/patient-ideas.types.js';

const SCOPE = {
  organizationPublicId: 'org_aaaaaaaaaaaaaaaaaaaaa',
} as unknown as OrganizationPrincipalDatabaseScope;
const PATIENT_PUBLIC_ID = 'pat_aaaaaaaaaaaaaaaaaaaaa';

/** An active offering of the menu. */
function offering(id: number, name: string): IdeaOffering {
  return {
    id,
    publicId: `ofr_${String(id).padStart(21, 'a')}`,
    name,
    category: 'Skin',
    sessions: 1,
    price: '999.50',
  };
}

const CONSULTATION = offering(1, 'Consultation');
const PEEL = offering(2, 'Chemical peel');
const PRP = offering(3, 'PRP');

/** A repository answering one patient with no history; each case overrides what it needs. */
function repository(overrides: Partial<Record<keyof PatientIdeasRepository, unknown>> = {}) {
  return {
    findPatient: vi.fn().mockResolvedValue({ id: 5, contactId: 50, hasDataConsent: true }),
    findActiveOfferings: vi.fn().mockResolvedValue([CONSULTATION, PEEL, PRP]),
    findPlannedOfferingIds: vi.fn().mockResolvedValue([]),
    findStoredIdeas: vi.fn().mockResolvedValue([]),
    findHistory: vi.fn().mockResolvedValue({
      treatmentSuggestions: [],
      complaints: [],
      diagnoses: [],
      visitCount: 0,
      lastServiceName: null,
      packagesAlmostUsedOfferingIds: [],
    }),
    ...overrides,
  } as unknown as PatientIdeasRepository;
}

/** Builds the service over a repository; the organization always resolves to id 7. */
function service(ideasRepository: PatientIdeasRepository) {
  const organizationService = {
    requireOrganizationByPublicId: vi.fn().mockResolvedValue({ id: 7 }),
  };
  return new PatientIdeasService(organizationService as never, ideasRepository);
}

/** A patient's offering ideas (routes-final 7.N, D80): AI ideas when fit, else the rules. */
describe('PatientIdeasService.list', () => {
  beforeEach(() => {
    mocks.aiEnabled = false;
  });

  it('refuses a missing or oversized patient id (400) before any database work', async () => {
    const ideasRepository = repository();
    await expect(service(ideasRepository).list(SCOPE, {})).rejects.toBeInstanceOf(ValidationError);
    await expect(
      service(ideasRepository).list(SCOPE, { patient_id: `pat_${'a'.repeat(40)}` }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(ideasRepository.findPatient).not.toHaveBeenCalled();
  });

  it('answers 404 for a patient not in the organization', async () => {
    const ideasRepository = repository({ findPatient: vi.fn().mockResolvedValue(null) });
    await expect(
      service(ideasRepository).list(SCOPE, { patient_id: PATIENT_PUBLIC_ID }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('answers the rules when the AI is off — stored ideas are not read', async () => {
    const ideasRepository = repository();

    const result = await service(ideasRepository).list(SCOPE, { patient_id: PATIENT_PUBLIC_ID });

    expect(result).toEqual({
      data: [
        {
          offering_id: CONSULTATION.publicId,
          offering_name: 'Consultation',
          category: 'Skin',
          sessions: 1,
          price: 999.5,
          reason: 'First visit · start with a consultation',
          source: 'first',
        },
      ],
      meta: { source: 'rules', ai_refreshed_at: null },
    });
    expect(ideasRepository.findStoredIdeas).not.toHaveBeenCalled();
  });

  it('answers the stored AI ideas that still hold, with the latest refresh time', async () => {
    mocks.aiEnabled = true;
    const ideasRepository = repository({
      findPlannedOfferingIds: vi.fn().mockResolvedValue([PRP.id]),
      findStoredIdeas: vi.fn().mockResolvedValue([
        {
          offeringId: PEEL.id,
          reason: 'Evens the tone',
          position: 1,
          createdAt: new Date('2026-10-01T10:00:00Z'),
        },
        // Planned since the refresh — dropped
        {
          offeringId: PRP.id,
          reason: 'Hair',
          position: 2,
          createdAt: new Date('2026-10-02T10:00:00Z'),
        },
        // Switched off since the refresh — dropped
        {
          offeringId: 99,
          reason: 'Gone',
          position: 3,
          createdAt: new Date('2026-10-01T10:00:00Z'),
        },
      ]),
    });

    const result = await service(ideasRepository).list(SCOPE, { patient_id: PATIENT_PUBLIC_ID });

    expect(result.meta).toEqual({ source: 'ai', ai_refreshed_at: '2026-10-02T10:00:00.000Z' });
    expect(result.data.map((idea) => [idea.offering_id, idea.reason, idea.source])).toEqual([
      [PEEL.publicId, 'Evens the tone', 'ai'],
    ]);
    expect(ideasRepository.findHistory).not.toHaveBeenCalled();
  });

  it('falls back to the rules when no stored AI idea still holds', async () => {
    mocks.aiEnabled = true;
    const ideasRepository = repository({
      findStoredIdeas: vi
        .fn()
        .mockResolvedValue([
          { offeringId: 99, reason: 'Gone', position: 1, createdAt: new Date('2026-10-01') },
        ]),
    });

    const result = await service(ideasRepository).list(SCOPE, { patient_id: PATIENT_PUBLIC_ID });

    expect(result.meta.source).toBe('rules');
  });

  it('never shows AI ideas for a patient without Data consent', async () => {
    mocks.aiEnabled = true;
    const ideasRepository = repository({
      findPatient: vi.fn().mockResolvedValue({ id: 5, contactId: 50, hasDataConsent: false }),
    });

    const result = await service(ideasRepository).list(SCOPE, { patient_id: PATIENT_PUBLIC_ID });

    expect(result.meta.source).toBe('rules');
    expect(ideasRepository.findStoredIdeas).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/infrastructure/database/contexts/database-context.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/infrastructure/database/contexts/database-context.js')
  >()),
  withAppDatabaseContext: ({ callback }: { callback: () => unknown }) => callback(),
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
    findPatient: vi.fn().mockResolvedValue({ id: 5, contactId: 50 }),
    findActiveOfferings: vi.fn().mockResolvedValue([CONSULTATION, PEEL, PRP]),
    findPlannedOfferingIds: vi.fn().mockResolvedValue([]),
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

/** A patient's offering ideas (routes-final 7.N): the prototype's rules on the history. */
describe('PatientIdeasService.list', () => {
  it('refuses a missing or oversized patient id (400) before any database work', async () => {
    const ideasRepository = repository();
    await expect(
      service(ideasRepository).list({ scope: SCOPE, params: {} }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      service(ideasRepository).list({
        scope: SCOPE,
        params: { patient_id: `pat_${'a'.repeat(40)}` },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(ideasRepository.findPatient).not.toHaveBeenCalled();
  });

  it('answers 404 for a patient not in the organization', async () => {
    const ideasRepository = repository({ findPatient: vi.fn().mockResolvedValue(null) });
    await expect(
      service(ideasRepository).list({ scope: SCOPE, params: { patient_id: PATIENT_PUBLIC_ID } }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("answers the rules on the patient's history", async () => {
    const ideasRepository = repository();

    const result = await service(ideasRepository).list({
      scope: SCOPE,
      params: { patient_id: PATIENT_PUBLIC_ID },
    });

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
    });
  });
});

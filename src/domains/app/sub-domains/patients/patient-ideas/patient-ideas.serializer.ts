import { toAmount } from '@/shared/utils/validation/record-fields.util.js';
import type { PatientIdea, PatientIdeaOutput } from './patient-ideas.types.js';

/** One idea as the API answers it (routes-final 7.N, PI1): the offering, the reason, the source. */
export function serializePatientIdea(idea: PatientIdea): PatientIdeaOutput {
  return {
    offering_id: idea.offering.publicId,
    offering_name: idea.offering.name,
    category: idea.offering.category,
    sessions: idea.offering.sessions,
    price: toAmount(idea.offering.price) as number,
    reason: idea.reason,
    source: idea.source,
  };
}

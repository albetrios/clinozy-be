import {
  PATIENT_IDEA_SOURCE,
  PATIENT_IDEAS_MAX,
  PATIENT_IDEAS_PACKAGE_VISITS,
  type PatientIdeaSource,
} from './patient-ideas.constants.js';
import type { IdeaOffering, PatientIdea, PatientIdeasHistory } from './patient-ideas.types.js';
import { concernLabels } from './patient-ideas.ai.js';

/** A doctor's suggestion note → the offerings it points at (the prototype's keyword map). */
const SUGGESTION_KEYWORDS: readonly { note: RegExp; offering: RegExp }[] = [
  { note: /lhr|laser hair/i, offering: /lhr/i },
  { note: /peel/i, offering: /peel/i },
  { note: /hydra/i, offering: /hydra|facial/i },
  { note: /prp/i, offering: /prp|hair/i },
];

/** The concerns the rules answer, in order, with the offerings that answer them. */
const CONCERN_OFFERINGS: readonly { concern: string; offering: RegExp }[] = [
  { concern: 'pigmentation', offering: /d-tan|peel/i },
  { concern: 'hair fall', offering: /prp|hair/i },
  { concern: 'acne', offering: /peel|acne/i },
];

/** The last service → the package family it belongs to (two or more visits). */
const PACKAGE_KEYWORDS: readonly { service: RegExp; offering: RegExp }[] = [
  { service: /lhr|laser/i, offering: /lhr/i },
  { service: /peel/i, offering: /peel/i },
  { service: /facial|hydra/i, offering: /facial|hydra/i },
];

/**
 * The plan's ideas from history by the prototype's rules (routes-final 7.N, PI1; H:4355–4367) —
 * what the patient file shows when there are no AI ideas.
 *
 * @remarks
 * - **Algorithm:** in order, each adding an offering at most once and never one in `excluded` (the
 *   plan's offerings that are not declined): the doctor's treatment suggestions by keyword; the
 *   complaints and diagnoses by their concerns ({@link concernLabels}: pigmentation → a de-tan or
 *   peel, hair fall → PRP, acne → a peel); two or more visits → a package (more than one session)
 *   of the last service's family; each package almost used up → the same offering, to renew; no
 *   visit and no idea yet → a consultation. The first {@link PATIENT_IDEAS_MAX}. An offering is
 *   found by name among the active ones, in catalogue order.
 * - **Failure modes:** none — pure.
 */
export function ruleIdeas(options: {
  history: PatientIdeasHistory;
  offerings: readonly IdeaOffering[];
  excluded: ReadonlySet<number>;
}): PatientIdea[] {
  const { history, offerings, excluded } = options;
  const ideas: PatientIdea[] = [];
  const isFree = (offering: IdeaOffering) =>
    !(excluded.has(offering.id) || ideas.some((idea) => idea.offering.id === offering.id));
  const find = ({
    pattern,
    packageOnly = false,
  }: {
    pattern: RegExp;
    packageOnly?: boolean | undefined;
  }) =>
    offerings.find(
      (offering) =>
        pattern.test(offering.name) && (!packageOnly || offering.sessions > 1) && isFree(offering),
    );
  const push = ({
    offering,
    reason,
    source,
  }: {
    offering: IdeaOffering | undefined;
    reason: string;
    source: PatientIdeaSource;
  }) => {
    if (offering && isFree(offering)) ideas.push({ offering, reason, source });
  };

  for (const note of history.treatmentSuggestions) {
    const keyword = SUGGESTION_KEYWORDS.find((entry) => entry.note.test(note));
    if (keyword)
      push({
        offering: find({ pattern: keyword.offering }),
        reason: `Doctor's note · “${note}”`,
        source: PATIENT_IDEA_SOURCE.NOTE,
      });
  }
  const concerns = new Set(
    concernLabels([...history.complaints, ...history.diagnoses, ...history.treatmentSuggestions]),
  );
  for (const entry of CONCERN_OFFERINGS) {
    if (!concerns.has(entry.concern)) continue;
    // The prototype names pigmentation by the first complaint
    const label =
      entry.concern === 'pigmentation' ? (history.complaints[0] ?? entry.concern) : entry.concern;
    push({
      offering: find({ pattern: entry.offering }),
      reason: `Complaint · ${label}`,
      source: PATIENT_IDEA_SOURCE.HISTORY,
    });
  }
  if (history.visitCount >= PATIENT_IDEAS_PACKAGE_VISITS && history.lastServiceName !== null) {
    const service = history.lastServiceName;
    const family = PACKAGE_KEYWORDS.find((entry) => entry.service.test(service));
    if (family) {
      push({
        offering: find({ pattern: family.offering, packageOnly: true }),
        reason: `${history.visitCount} visits so far · a package saves on each session`,
        source: PATIENT_IDEA_SOURCE.CONSISTENCY,
      });
    }
  }
  for (const offeringId of history.packagesAlmostUsedOfferingIds) {
    push({
      offering: offerings.find((offering) => offering.id === offeringId),
      reason: 'Package almost used up · renew',
      source: PATIENT_IDEA_SOURCE.RENEW,
    });
  }
  if (history.visitCount === 0 && ideas.length === 0) {
    push({
      offering: find({ pattern: /consult/i }),
      reason: 'First visit · start with a consultation',
      source: PATIENT_IDEA_SOURCE.FIRST,
    });
  }
  return ideas.slice(0, PATIENT_IDEAS_MAX);
}

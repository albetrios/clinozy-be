import { z } from 'zod';
import {
  PATIENT_IDEA_REASON_MAX,
  PATIENT_IDEA_SOURCE,
  PATIENT_IDEAS_CONCERN_LABELS,
  PATIENT_IDEAS_MAX,
} from './patient-ideas.constants.js';
import type { IdeaOffering, PatientIdea, PatientIdeasSummary } from './patient-ideas.types.js';

/** What Claude is asked to do — the clinic's job, the rules of the answer (D80, PI6). */
const IDEAS_SYSTEM_PROMPT = [
  'You suggest the next offerings for one patient of an aesthetic and dermatology clinic in India.',
  "You get a de-identified summary of the patient (complaints, diagnoses, past treatments, packages with sessions left, completed visits, what is already planned) and the clinic's active offerings.",
  `Choose at most ${PATIENT_IDEAS_MAX} offerings that would help this patient next, best first. Use only ids from the offerings list, never one already planned, and give each a short reason a clinic counsellor can read aloud (at most 120 characters, plain English, no medical claims).`,
  'Answer with JSON only, nothing else: {"ideas":[{"offering_id":"<id>","reason":"<reason>"}]}. If nothing fits, answer {"ideas":[]}.',
].join('\n');

/**
 * The concerns free-text notes name, as labels of {@link PATIENT_IDEAS_CONCERN_LABELS} (PI6) — each
 * once, in the vocabulary's order; a note naming none adds nothing.
 *
 * @remarks
 * - **Notes:** pure; the only way a complaint or an unlinked diagnosis reaches Claude.
 */
export function concernLabels(texts: readonly string[]): string[] {
  const joined = texts.join(' ');
  return PATIENT_IDEAS_CONCERN_LABELS.filter((concern) => concern.words.test(joined)).map(
    (concern) => concern.label,
  );
}

/** The answer Claude must give. */
const ideasAnswerSchema = z.object({
  ideas: z
    .array(
      z.object({
        offering_id: z.string().min(1),
        reason: z.string().min(1),
      }),
    )
    .max(20),
});

/**
 * The system prompt and the user turn for one patient's ideas (D80, PI6) — the summary and the
 * clinic's menu as JSON.
 *
 * @remarks
 * - **Notes:** pure. The summary carries nothing that names or reaches the patient — concern
 *   labels and catalogue names, never a note's text (the repository builds it so); offerings go by
 *   their public id, name, category, sessions and price.
 */
export function buildIdeasPrompt(options: {
  summary: PatientIdeasSummary;
  offerings: readonly IdeaOffering[];
}): { system: string; prompt: string } {
  return {
    system: IDEAS_SYSTEM_PROMPT,
    prompt: JSON.stringify({
      patient: options.summary,
      offerings: options.offerings.map((offering) => ({
        id: offering.publicId,
        name: offering.name,
        category: offering.category,
        sessions: offering.sessions,
        price_rupees: Number(offering.price),
      })),
    }),
  };
}

/** The first JSON object in a text — Claude may wrap it in a code fence. */
function jsonObjectIn(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

/**
 * Claude's answer as ideas (D80): only offerings from the menu, never one excluded (already
 * planned), each once, the reason trimmed to {@link PATIENT_IDEA_REASON_MAX}, at most
 * {@link PATIENT_IDEAS_MAX}. `null` when the answer is not the JSON asked for.
 *
 * @remarks
 * - **Failure modes:** none — an unreadable answer is `null`, the caller keeps the rule ideas.
 */
export function parseIdeasAnswer(options: {
  text: string;
  offerings: readonly IdeaOffering[];
  excluded: ReadonlySet<number>;
}): PatientIdea[] | null {
  const parsed = ideasAnswerSchema.safeParse(jsonObjectIn(options.text));
  if (!parsed.success) return null;
  const byPublicId = new Map(options.offerings.map((offering) => [offering.publicId, offering]));
  const ideas: PatientIdea[] = [];
  for (const answer of parsed.data.ideas) {
    const offering = byPublicId.get(answer.offering_id);
    if (!offering || options.excluded.has(offering.id)) continue;
    if (ideas.some((idea) => idea.offering.id === offering.id)) continue;
    const reason = answer.reason.trim().slice(0, PATIENT_IDEA_REASON_MAX);
    if (reason.length === 0) continue;
    ideas.push({ offering, reason, source: PATIENT_IDEA_SOURCE.AI });
    if (ideas.length === PATIENT_IDEAS_MAX) break;
  }
  return ideas;
}

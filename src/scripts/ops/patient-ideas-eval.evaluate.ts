import { parseIdeasAnswer } from '@/domains/app/sub-domains/patients/patient-ideas/patient-ideas.ai.js';
import type { IdeaOffering } from '@/domains/app/sub-domains/patients/patient-ideas/patient-ideas.types.js';
import type { PatientIdeasEvalCase } from './patient-ideas-eval.set.js';

/** One case's result: what Claude answered, scored. */
export interface PatientIdeasEvalResult {
  name: string;
  /** The answer was the JSON asked for. */
  isParsed: boolean;
  /** The ideas kept after the worker's own checks, as public ids in order. */
  keptPublicIds: string[];
  /** Kept ideas a counsellor would accept. */
  acceptedCount: number;
  /** The first kept idea is one a counsellor would accept. */
  isFirstAccepted: boolean;
  /** Raw answer ids that were planned already, inactive, or not on the menu at all. */
  violations: { planned: number; inactive: number; unknown: number };
}

/** The whole run, scored. */
export interface PatientIdeasEvalSummary {
  caseCount: number;
  /** Answers that were the JSON asked for, of all cases. */
  parseRate: number;
  /** Kept ideas a counsellor would accept, of all kept ideas. */
  relevance: number;
  /** Cases whose first idea a counsellor would accept, of the parsed cases with ideas. */
  firstIdeaHitRate: number;
  /** Raw ids naming a planned offering, an inactive one, or none on the menu — 0 is the target. */
  violationCount: number;
}

/** The ids the raw answer named, before any check — what the "never" scores read. */
function rawAnswerIds(text: string): string[] {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as {
      ideas?: { offering_id?: unknown }[];
    };
    return (parsed.ideas ?? [])
      .map((idea) => idea.offering_id)
      .filter((value): value is string => typeof value === 'string');
  } catch {
    return [];
  }
}

/**
 * Scores one answer for one case (task I2): parsed or not, the ideas the worker would keep, how
 * many a counsellor accepts, and what the raw answer named that it never may.
 *
 * @remarks
 * - **Algorithm:** the worker's own `parseIdeasAnswer` decides what is kept; the raw ids are read
 *   separately, so a planned or inactive id the parser drops still counts as a violation.
 * - **Failure modes:** none — an unreadable answer scores as not parsed.
 */
export function scorePatientIdeasAnswer(options: {
  evalCase: PatientIdeasEvalCase;
  menu: readonly IdeaOffering[];
  inactivePublicIds: readonly string[];
  answer: string;
}): PatientIdeasEvalResult {
  const { evalCase, menu, inactivePublicIds, answer } = options;
  const planned = new Set(evalCase.plannedPublicIds);
  const excluded = new Set(
    menu.filter((offering) => planned.has(offering.publicId)).map((offering) => offering.id),
  );
  const ideas = parseIdeasAnswer({ text: answer, offerings: menu, excluded });
  const kept = (ideas ?? []).map((idea) => idea.offering.publicId);
  const accepted = new Set(evalCase.acceptedPublicIds);
  const onMenu = new Set(menu.map((offering) => offering.publicId));
  const inactive = new Set(inactivePublicIds);
  const raw = rawAnswerIds(answer);
  return {
    name: evalCase.name,
    isParsed: ideas !== null,
    keptPublicIds: kept,
    acceptedCount: kept.filter((publicId) => accepted.has(publicId)).length,
    isFirstAccepted: kept[0] !== undefined && accepted.has(kept[0]),
    violations: {
      planned: raw.filter((publicId) => planned.has(publicId)).length,
      inactive: raw.filter((publicId) => inactive.has(publicId)).length,
      unknown: raw.filter((publicId) => !(onMenu.has(publicId) || inactive.has(publicId))).length,
    },
  };
}

/** The run's scores from its cases' results. */
export function summarisePatientIdeasEval(
  results: readonly PatientIdeasEvalResult[],
): PatientIdeasEvalSummary {
  const parsed = results.filter((result) => result.isParsed);
  const keptCount = parsed.reduce((total, result) => total + result.keptPublicIds.length, 0);
  const acceptedCount = parsed.reduce((total, result) => total + result.acceptedCount, 0);
  const withIdeas = parsed.filter((result) => result.keptPublicIds.length > 0);
  const firstHits = withIdeas.filter((result) => result.isFirstAccepted).length;
  const ratio = ({ part, whole }: { part: number; whole: number }) =>
    whole === 0 ? 0 : part / whole;
  return {
    caseCount: results.length,
    parseRate: ratio({ part: parsed.length, whole: results.length }),
    relevance: ratio({ part: acceptedCount, whole: keptCount }),
    firstIdeaHitRate: ratio({ part: firstHits, whole: withIdeas.length }),
    violationCount: results.reduce(
      (total, result) =>
        total + result.violations.planned + result.violations.inactive + result.violations.unknown,
      0,
    ),
  };
}

/** The run as a plain-text table and its scores, for the terminal. */
export function formatPatientIdeasEval(options: {
  results: readonly PatientIdeasEvalResult[];
  summary: PatientIdeasEvalSummary;
}): string {
  const percent = (value: number) => `${(value * 100).toFixed(0)}%`;
  const rows = options.results.map((result) => {
    const violations =
      result.violations.planned + result.violations.inactive + result.violations.unknown;
    return `${result.isParsed ? 'ok ' : 'BAD'}  ${String(result.acceptedCount).padStart(1)}/${result.keptPublicIds.length}  ${violations === 0 ? '-' : `${violations}!`}  ${result.name}`;
  });
  const { summary } = options;
  return [
    'parse  accepted/kept  violations  case',
    ...rows,
    '',
    `cases ${summary.caseCount} · parse rate ${percent(summary.parseRate)} · relevance ${percent(summary.relevance)} · first idea accepted ${percent(summary.firstIdeaHitRate)} · violations ${summary.violationCount}`,
  ].join('\n');
}

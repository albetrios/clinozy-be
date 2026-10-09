import { describe, expect, it } from 'vitest';
import {
  formatPatientIdeasEval,
  scorePatientIdeasAnswer,
  summarisePatientIdeasEval,
} from '@/scripts/ops/patient-ideas-eval.evaluate.js';
import {
  EVAL_INACTIVE_PUBLIC_IDS,
  EVAL_MENU,
  PATIENT_IDEAS_EVAL_SET,
} from '@/scripts/ops/patient-ideas-eval.set.js';

const PLANNED_CASE = PATIENT_IDEAS_EVAL_SET.find(
  (item) => item.name === 'hair fall, package planned',
);
const ACNE_CASE = PATIENT_IDEAS_EVAL_SET.find((item) => item.name === 'first visit, acne');

/** An answer naming these ids, as Claude is asked to write it. */
function answer(ids: string[]): string {
  return JSON.stringify({ ideas: ids.map((id) => ({ offering_id: id, reason: 'Fits' })) });
}

/** I2: the ideas evaluation's scores — what a re-run after a prompt or model change reads. */
describe('patient ideas evaluation', () => {
  it('has about twenty cases, each accepting only menu offerings, none of them planned', () => {
    expect(PATIENT_IDEAS_EVAL_SET.length).toBeGreaterThanOrEqual(20);
    const onMenu = new Set(EVAL_MENU.map((offering) => offering.publicId));
    for (const evalCase of PATIENT_IDEAS_EVAL_SET) {
      expect(evalCase.acceptedPublicIds.length, evalCase.name).toBeGreaterThan(0);
      for (const publicId of evalCase.acceptedPublicIds) {
        expect(onMenu.has(publicId), evalCase.name).toBe(true);
        expect(evalCase.plannedPublicIds, evalCase.name).not.toContain(publicId);
      }
    }
  });

  it('scores a planned, an inactive and an unknown id as violations — and keeps none of them', () => {
    const planned = PLANNED_CASE?.plannedPublicIds[0] ?? '';
    const result = scorePatientIdeasAnswer({
      evalCase: PLANNED_CASE!,
      menu: EVAL_MENU,
      inactivePublicIds: EVAL_INACTIVE_PUBLIC_IDS,
      answer: answer([
        planned,
        EVAL_INACTIVE_PUBLIC_IDS[0] ?? '',
        'ofr_madeup0000000000000',
        PLANNED_CASE!.acceptedPublicIds[0] ?? '',
      ]),
    });

    expect(result.violations).toEqual({ planned: 1, inactive: 1, unknown: 1 });
    expect(result.keptPublicIds).toEqual([PLANNED_CASE!.acceptedPublicIds[0]]);
    expect([result.isParsed, result.acceptedCount, result.isFirstAccepted]).toEqual([
      true,
      1,
      true,
    ]);
  });

  it('scores prose as not parsed, and a code-fenced answer as parsed', () => {
    const prose = scorePatientIdeasAnswer({
      evalCase: ACNE_CASE!,
      menu: EVAL_MENU,
      inactivePublicIds: EVAL_INACTIVE_PUBLIC_IDS,
      answer: 'I would suggest a chemical peel.',
    });
    const fenced = scorePatientIdeasAnswer({
      evalCase: ACNE_CASE!,
      menu: EVAL_MENU,
      inactivePublicIds: EVAL_INACTIVE_PUBLIC_IDS,
      answer: `\`\`\`json\n${answer([ACNE_CASE!.acceptedPublicIds[1] ?? ''])}\n\`\`\``,
    });

    expect([prose.isParsed, fenced.isParsed, fenced.acceptedCount]).toEqual([false, true, 1]);
  });

  it('summarises: parse rate over every case, relevance over kept ideas, first idea over parsed ones', () => {
    const consultation = EVAL_MENU[0]?.publicId ?? '';
    const botox =
      EVAL_MENU.find((offering) => offering.name === 'Botox — forehead')?.publicId ?? '';
    const results = [
      scorePatientIdeasAnswer({
        evalCase: ACNE_CASE!,
        menu: EVAL_MENU,
        inactivePublicIds: EVAL_INACTIVE_PUBLIC_IDS,
        answer: answer([botox, consultation]),
      }),
      scorePatientIdeasAnswer({
        evalCase: ACNE_CASE!,
        menu: EVAL_MENU,
        inactivePublicIds: EVAL_INACTIVE_PUBLIC_IDS,
        answer: 'no json',
      }),
    ];

    const summary = summarisePatientIdeasEval(results);

    expect(summary).toEqual({
      caseCount: 2,
      parseRate: 0.5,
      relevance: 0.5,
      firstIdeaHitRate: 0,
      violationCount: 0,
    });
    expect(formatPatientIdeasEval({ results, summary })).toContain(
      'cases 2 · parse rate 50% · relevance 50% · first idea accepted 0% · violations 0',
    );
  });
});

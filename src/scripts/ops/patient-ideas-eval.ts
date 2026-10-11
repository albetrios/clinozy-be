/**
 * The AI ideas evaluation (task I2, `pnpm tool:patient-ideas-eval`).
 *
 * Sends each de-identified case of `patient-ideas-eval.set.ts` to Claude with the ideas worker's
 * own prompt, then scores the answers: the parse rate, the relevance (kept ideas a counsellor
 * would accept), the first idea accepted, and the violations (a planned, inactive or unknown
 * offering named — the target is 0). Re-run it whenever the prompt or the model changes and record
 * the scores in docs/reviews/launch-confidence-plan-2026-10-09.md.
 *
 * Usage:
 *   pnpm tool:patient-ideas-eval            # needs ANTHROPIC_API_KEY (and PATIENT_IDEAS_AI_MODEL)
 *   pnpm tool:patient-ideas-eval --oracle   # answers each case with its accepted ideas — checks
 *                                           # the harness itself, no key, no call
 * Exits 1 when a violation is found or the parse rate is under 90%.
 */
import '@/shared/config/load-env-files.js';
import { createAnthropicMessage } from '@/infrastructure/ai/anthropic-messages.client.js';
import { buildIdeasPrompt } from '@/domains/app/sub-domains/patients/patient-ideas/patient-ideas.ai.js';
import { PATIENT_IDEAS_MAX_TOKENS } from '@/domains/app/sub-domains/patients/patient-ideas/patient-ideas.constants.js';
import {
  formatPatientIdeasEval,
  scorePatientIdeasAnswer,
  summarisePatientIdeasEval,
} from './patient-ideas-eval.evaluate.js';
import {
  EVAL_INACTIVE_PUBLIC_IDS,
  EVAL_MENU,
  PATIENT_IDEAS_EVAL_SET,
  type PatientIdeasEvalCase,
} from './patient-ideas-eval.set.js';

/** The lowest parse rate a run may have. */
const PARSE_RATE_FLOOR = 0.9;

/** The case's answer: Claude's, or with `--oracle` its accepted ideas as the JSON asked for. */
async function answerOf({
  evalCase,
  isOracle,
}: {
  evalCase: PatientIdeasEvalCase;
  isOracle: boolean;
}): Promise<string> {
  if (isOracle) {
    return JSON.stringify({
      ideas: evalCase.acceptedPublicIds
        .filter((publicId) => !evalCase.plannedPublicIds.includes(publicId))
        .map((publicId) => ({ offering_id: publicId, reason: 'Accepted by the counsellor' })),
    });
  }
  // The full menu, as the worker sends it: the planned names are in the summary, never to be chosen
  const { system, prompt } = buildIdeasPrompt({ summary: evalCase.summary, offerings: EVAL_MENU });
  return createAnthropicMessage({ system, prompt, maxTokens: PATIENT_IDEAS_MAX_TOKENS });
}

async function main(): Promise<void> {
  const isOracle = process.argv.includes('--oracle');
  const results = [];
  for (const evalCase of PATIENT_IDEAS_EVAL_SET) {
    const answer = await answerOf({ evalCase, isOracle });
    results.push(
      scorePatientIdeasAnswer({
        evalCase,
        menu: EVAL_MENU,
        inactivePublicIds: EVAL_INACTIVE_PUBLIC_IDS,
        answer,
      }),
    );
  }
  const summary = summarisePatientIdeasEval(results);
  process.stdout.write(`${formatPatientIdeasEval({ results, summary })}\n`);
  process.exitCode = summary.violationCount > 0 || summary.parseRate < PARSE_RATE_FLOOR ? 1 : 0;
}

main().catch((error: unknown) => {
  process.stderr.write(`patient-ideas-eval failed: ${String(error)}\n`);
  process.exitCode = 1;
});

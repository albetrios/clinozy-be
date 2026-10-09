import { env } from '@/shared/config/env.config.js';

/**
 * Whether patients' AI offering ideas are refreshed and shown on this deployment
 * (`PATIENT_IDEAS_AI_ENABLED`, launch D80).
 *
 * @remarks
 * - **Algorithm:** reads the one flag (the env layer requires `ANTHROPIC_API_KEY` when it is on).
 * - **Failure modes:** none.
 */
export function isPatientIdeasAiEnabled(): boolean {
  return env.PATIENT_IDEAS_AI_ENABLED;
}

import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  ChangeOnboardingSetupDto,
  type ChangeOnboardingSetupInput,
} from './onboarding-setup.dto.js';

/** Parses a change to the clinic's setup; throws `ValidationError` naming each bad field. */
export function validateChangeOnboardingSetup(data: unknown): ChangeOnboardingSetupInput {
  return parseWithSchema({ schema: ChangeOnboardingSetupDto, data });
}

import { z } from 'zod';
import { expectedUpdatedAtSchema } from '@/shared/utils/validation/record-fields.util.js';
import {
  ORGANIZATION_SETTINGS_SETUP_ANSWERED_STEP_VALUES,
  ORGANIZATION_SETTINGS_SETUP_SKIPPABLE_ITEM_VALUES,
} from '@/domains/tenancy/sub-domains/organization/organization-settings/organization-settings.constants.js';

/** True when every value in `values` appears once. */
function eachOnce(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

/** A list of single values to add or remove: 1 to `max`, each once. */
function valueList<T extends readonly [string, ...string[]]>(values: T) {
  return z
    .array(z.enum(values))
    .min(1)
    .max(values.length)
    .refine(eachOnce, { message: 'errors:validation.eachValueOnce' });
}

/**
 * Body of `PATCH /app/onboarding-setup` (routes-final §2.A.8, route 2): at least one of
 * `answered_steps_add` (`clinic_type`, `you`), `skipped_items_add` / `skipped_items_remove`
 * (`treatments`, `invite_team` — the first appointment cannot be skipped; never one item in both),
 * `deferred` (`true` only: "Explore first") and `guide_hidden` (hide or reopen the guide); optional
 * `expected_updated_at`.
 */
export const ChangeOnboardingSetupDto = z
  .object({
    answered_steps_add: valueList(ORGANIZATION_SETTINGS_SETUP_ANSWERED_STEP_VALUES).optional(),
    skipped_items_add: valueList(ORGANIZATION_SETTINGS_SETUP_SKIPPABLE_ITEM_VALUES).optional(),
    skipped_items_remove: valueList(ORGANIZATION_SETTINGS_SETUP_SKIPPABLE_ITEM_VALUES).optional(),
    deferred: z.literal(true).optional(),
    guide_hidden: z.boolean().optional(),
    expected_updated_at: expectedUpdatedAtSchema,
  })
  .strict()
  .refine(
    (body) =>
      body.answered_steps_add !== undefined ||
      body.skipped_items_add !== undefined ||
      body.skipped_items_remove !== undefined ||
      body.deferred !== undefined ||
      body.guide_hidden !== undefined,
    { message: 'errors:validation.sendAtLeastOneField' },
  )
  .refine(
    (body) => !body.skipped_items_remove?.some((item) => body.skipped_items_add?.includes(item)),
    { message: 'errors:validation.skipAndUnskipSameItem', path: ['skipped_items_remove'] },
  );

/** Parsed {@link ChangeOnboardingSetupDto}. */
export type ChangeOnboardingSetupInput = z.infer<typeof ChangeOnboardingSetupDto>;

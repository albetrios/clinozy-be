import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { MEMBERSHIP_PREFERENCE_RECENT_PICKS_PER_FIELD } from './membership-preferences.constants.js';
import {
  type UpdateMembershipPreferencesInput,
  updateMembershipPreferencesDto,
} from './membership-preferences.dto.js';

/** Parses a preferences save body; throws `ValidationError` naming each bad field. */
export function validateUpdateMembershipPreferences(
  data: unknown,
): UpdateMembershipPreferencesInput {
  return parseWithSchema(updateMembershipPreferencesDto, data);
}

/**
 * Keeps the newest {@link MEMBERSHIP_PREFERENCE_RECENT_PICKS_PER_FIELD} picks of each `room:field`
 * (launch U4), dropping repeats.
 *
 * @remarks The list is newest first, as the screens send it: the first entries of a `room:field`
 * win.
 */
export function trimRecentPicks(picks: readonly string[]): string[] {
  const keptPerField = new Map<string, number>();
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const pick of picks) {
    if (seen.has(pick)) continue;
    seen.add(pick);
    const field = pick.slice(0, pick.indexOf(':', pick.indexOf(':') + 1));
    const count = keptPerField.get(field) ?? 0;
    if (count >= MEMBERSHIP_PREFERENCE_RECENT_PICKS_PER_FIELD) continue;
    keptPerField.set(field, count + 1);
    kept.push(pick);
  }
  return kept;
}

import dotenv from 'dotenv';
import { TURNSTILE_ALWAYS_PASS_TEST_SECRET } from '@/shared/constants/security.constants.js';
import { upsertEnvAssignment } from './env-file.util.js';

/** The matching always-pass test site key — clinozy-fe's `VITE_TURNSTILE_SITE_KEY` locally. */
export const TURNSTILE_ALWAYS_PASS_TEST_SITE_KEY = '1x00000000000000000000AA';

/**
 * Turns CAPTCHA enforcement on or off in local env-file `content` (`pnpm setup:local
 * --with-captcha` / `--without-captcha`). Off is the default and stays the template's value.
 *
 * @remarks
 * - **On:** `CAPTCHA_PROVIDER=turnstile`; `CAPTCHA_SECRET` = {@link TURNSTILE_ALWAYS_PASS_TEST_SECRET}
 *   unless it already holds a value (one the developer set is kept); and `CAPTCHA_BYPASS_ALLOWED=true`
 *   so the k6 scenarios and the API smoke test — which send the dev `X-Captcha-Bypass` header on
 *   public auth forms — still get through. The env refine refuses the bypass in production.
 * - **Off:** `CAPTCHA_PROVIDER=disabled`; the secret and the bypass flag stay (inert while off).
 * - Pure: no file I/O.
 */
export function applyLocalCaptcha(content: string, enabled: boolean): string {
  if (!enabled) return upsertEnvAssignment(content, 'CAPTCHA_PROVIDER', 'disabled');
  let updated = upsertEnvAssignment(content, 'CAPTCHA_PROVIDER', 'turnstile');
  if (!dotenv.parse(updated).CAPTCHA_SECRET?.trim()) {
    updated = upsertEnvAssignment(updated, 'CAPTCHA_SECRET', TURNSTILE_ALWAYS_PASS_TEST_SECRET);
  }
  return upsertEnvAssignment(updated, 'CAPTCHA_BYPASS_ALLOWED', 'true');
}

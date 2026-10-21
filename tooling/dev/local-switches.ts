import dotenv from 'dotenv';
import { upsertEnvAssignment } from './env-file.util.js';

/**
 * The local-only switches `pnpm setup:local` turns on, each refused in production by the env schema:
 * - `TEST_MODE` — `POST /auth/email/send-code` echoes the code it sent as
 *   `debug_verification_code`, which clinozy-fe's code screen fills in and the k6 scenarios sign in
 *   with. `.env.example` keeps it off, so no hosted `.env.<environment>` scaffolded from the
 *   template carries the echo — on a reachable server it would hand any address's sign-in code to
 *   whoever asks for it.
 * - `MAIL_RESERVED_DOMAIN_SKIP_ENABLED` — the mail worker drops `example.com` (and other reserved-
 *   domain) recipients instead of sending them to Resend, which refuses each with a 422. The
 *   template ships it on, but a `.env.local` scaffolded before it existed lacks it.
 */
export const LOCAL_SWITCHES = ['TEST_MODE', 'MAIL_RESERVED_DOMAIN_SKIP_ENABLED'] as const;

/**
 * Turns each of {@link LOCAL_SWITCHES} on in local env-file `content` (`pnpm setup:local`, every
 * run) unless the file sets it already, and names the ones it turned on.
 *
 * @remarks
 * - **Kept:** a switch the developer set, `true` or `false`, stays as it is.
 * - Pure: no file I/O.
 */
export function applyLocalSwitches(content: string): {
  content: string;
  turnedOn: (typeof LOCAL_SWITCHES)[number][];
} {
  const assigned = dotenv.parse(content);
  const turnedOn = LOCAL_SWITCHES.filter((key) => assigned[key] === undefined);
  return {
    content: turnedOn.reduce((updated, key) => upsertEnvAssignment(updated, key, 'true'), content),
    turnedOn,
  };
}

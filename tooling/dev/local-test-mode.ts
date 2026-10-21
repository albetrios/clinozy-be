import dotenv from 'dotenv';
import { upsertEnvAssignment } from './env-file.util.js';

/**
 * Turns `TEST_MODE` on in local env-file `content` (`pnpm setup:local`, every run) unless the file
 * sets it already: `POST /auth/email/send-code` then echoes the code it sent as
 * `debug_verification_code`, which clinozy-fe's code screen fills in and the k6 scenarios sign in
 * with.
 *
 * @remarks
 * - **Kept:** a `TEST_MODE` the developer set, `true` or `false`, stays as it is.
 * - **Local only:** `.env.example` keeps it off, so no hosted `.env.<environment>` scaffolded from
 *   the template carries the echo — on a reachable server it would hand any address's sign-in code
 *   to whoever asks for it. The env refine refuses it in production.
 * - Pure: no file I/O.
 */
export function applyLocalTestMode(content: string): string {
  if (dotenv.parse(content).TEST_MODE !== undefined) return content;
  return upsertEnvAssignment(content, 'TEST_MODE', 'true');
}

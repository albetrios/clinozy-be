/**
 * Email verification-code send result.
 *
 * The raw verification code is intentionally absent — it is dispatched only via
 * `AUTH_EVENT.EMAIL_VERIFICATION_CODE_REQUESTED` and the resulting email. Tests use
 * `captureNextVerificationCode` (src/tests/helpers/verification-code.helper.ts) to read it.
 *
 * `messageKey` is translated by the HTTP handler via `translateMessageKeyPayload`
 * before reaching the API response.
 */
export interface EmailSendCodeResult {
  messageKey: string;
  expires_in_minutes: number;
  /**
   * TEST_MODE-only affordance: the plaintext verification code, echoed so an out-of-process client
   * (a k6 load test; clinozy-fe's code screen on a dev box) can complete the passwordless flow without
   * reading the email. Populated ONLY when `env.TEST_MODE` is on — a `.refine()` forbids
   * `TEST_MODE=true` in production, and no deployed env file sets it (only `pnpm setup:local`, in
   * `.env.local`), so this is always `undefined` outside a test/load run or a dev box. In-process
   * tests should prefer `captureNextVerificationCode`.
   */
  debug_verification_code?: string;
}

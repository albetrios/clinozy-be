import type { SupportedLanguage } from '@/shared/constants/i18n.constants.js';

/** Event-bus topic codes emitted by the auth-method service so the email handlers can enqueue the corresponding transactional emails. */
export const AUTH_EVENT = {
  EMAIL_VERIFICATION_CODE_REQUESTED: 'auth.email_verification_code.requested',
  PASSWORD_RESET_REQUESTED: 'auth.password_reset.requested',
  ACCOUNT_SECURITY_NOTICE_REQUESTED: 'auth.account_security_notice.requested',
} as const;

/** Union of valid event-bus topic codes in {@link AUTH_EVENT}. */
export type AuthEventType = (typeof AUTH_EVENT)[keyof typeof AUTH_EVENT];

/** Payload of `AUTH_EVENT.EMAIL_VERIFICATION_CODE_REQUESTED`; carries the passwordless sign-in verification code (persisted only as a keyed hash) and the TTL minutes the email displays. */
export interface EmailVerificationCodePayload {
  email: string;
  verification_code: string;
  expires_in_minutes: number;
  /** The language of the request that asked for the code — the email is written in it. */
  locale: SupportedLanguage;
}

/** Payload of `AUTH_EVENT.PASSWORD_RESET_REQUESTED`; carries the raw reset token and TTL minutes used to build the password reset link. */
export interface PasswordResetEmailPayload {
  email: string;
  reset_token: string;
  expires_in_minutes: number;
  /** The language of the request that asked for the reset — the email is written in it. */
  locale: SupportedLanguage;
}

/**
 * The account changes the owner is emailed about, each with a "this wasn't me" line (A-1): a new
 * second factor or passkey, every other session signed out, a password changed or reset.
 */
export const ACCOUNT_SECURITY_NOTICE = {
  FACTOR_ENROLLED: 'factor_enrolled',
  SESSIONS_REVOKED: 'sessions_revoked',
  PASSWORD_CHANGED: 'password_changed',
} as const;

/** One of {@link ACCOUNT_SECURITY_NOTICE}'s values. */
export type AccountSecurityNotice =
  (typeof ACCOUNT_SECURITY_NOTICE)[keyof typeof ACCOUNT_SECURITY_NOTICE];

/** Payload of `AUTH_EVENT.ACCOUNT_SECURITY_NOTICE_REQUESTED`; names the change the owner is told about. */
export interface AccountSecurityNoticePayload {
  email: string;
  notice: AccountSecurityNotice;
  /** The language of the request that made the change — the email is written in it. */
  locale: SupportedLanguage;
}

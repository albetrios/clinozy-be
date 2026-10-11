import { DEFAULT_LANGUAGE, type SupportedLanguage } from '@/shared/constants/i18n.constants.js';
import { baseTemplate, translateMailText } from './base.template.js';
import { escapeHtml } from './escape-html.util.js';

/** Template variables for {@link verificationCodeTemplate} — the alphanumeric passwordless sign-in code, its TTL in minutes and the recipient's language. */
export interface VerificationCodeTemplateData {
  code: string;
  expiresInMinutes: number;
  locale?: SupportedLanguage;
}

/**
 * Renders the passwordless email verification-code HTML email (wrapped in `baseTemplate`).
 * Emitted from the auth-method event handlers when a sign-in code is requested.
 *
 * @remarks
 * The sign-in code is a server-generated alphanumeric code, but it is still passed through
 * {@link escapeHtml} as defence-in-depth in case the code source ever changes. The code is displayed
 * for the user to type into the login form — it is delivered as a one-time code (never a clickable
 * link), and its guess-resistance comes from the large keyspace + short TTL + single-use consume +
 * per-user attempt cap.
 */
export function verificationCodeTemplate(data: VerificationCodeTemplateData): string {
  const locale = data.locale ?? DEFAULT_LANGUAGE;
  const code = escapeHtml(data.code);
  const expiresInMinutes = data.expiresInMinutes;

  return baseTemplate({
    locale,
    title: translateMailText({ key: 'verificationCodeHeading', locale }),
    preheader: translateMailText({
      key: 'verificationCodePreheader',
      locale,
      values: {
        code: data.code,
        expiresInMinutes,
      },
    }),
    body: `
      <h1>${translateMailText({ key: 'verificationCodeHeading', locale })}</h1>
      <p>${translateMailText({ key: 'verificationCodeBody', locale, values: { expiresInMinutes } })}</p>
      <p style="text-align: center; margin: 32px 0;">
        <span style="display: inline-block; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #111827;">${code}</span>
      </p>
      <p style="font-size: 13px; color: #6b7280;">${translateMailText({ key: 'ignoreIfNotRequested', locale })}</p>
    `,
  });
}

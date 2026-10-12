import { DEFAULT_LANGUAGE, type SupportedLanguage } from '@/shared/constants/i18n.constants.js';
import { baseTemplate, translateMailText } from './base.template.js';
import { escapeHtml } from './escape-html.util.js';

/** Template variables for {@link invitationTemplate} — inviter, target organization, accept URL, TTL and the recipient's language. */
export interface InvitationTemplateData {
  inviterName: string;
  organizationName: string;
  acceptUrl: string;
  expiresInDays: number;
  locale?: SupportedLanguage;
}

/**
 * Renders the membership-invitation HTML email (wrapped in `baseTemplate`). Emitted
 * from `membership-invitation.events` handlers; the `acceptUrl` must already include
 * the signed invitation token so the recipient can complete acceptance.
 *
 * @remarks
 * All user/tenant-controlled and URL values are passed through {@link escapeHtml}
 * before interpolation. `inviterName` and `organizationName` carry display names;
 * `acceptUrl` is server-generated but escaping ensures `&` query-string delimiters
 * are correctly encoded as `&amp;` in HTML attributes and prevents injection if the
 * URL-construction code ever changes.
 */
export function invitationTemplate(data: InvitationTemplateData): string {
  const locale = data.locale ?? DEFAULT_LANGUAGE;
  const inviterName = escapeHtml(data.inviterName);
  const organizationName = escapeHtml(data.organizationName);
  const acceptUrl = escapeHtml(data.acceptUrl);

  return baseTemplate({
    locale,
    title: translateMailText({
      key: 'invitationTitle',
      locale,
      values: {
        organizationName: data.organizationName,
      },
    }),
    preheader: translateMailText({
      key: 'invitationPreheader',
      locale,
      values: {
        inviterName: data.inviterName,
        organizationName: data.organizationName,
      },
    }),
    body: `
      <h1>${translateMailText({ key: 'invitationHeading', locale })}</h1>
      <p>${translateMailText({ key: 'invitationBody', locale, values: { inviterName, organizationName } })}</p>
      <p>${translateMailText({ key: 'invitationExpiry', locale, values: { expiresInDays: data.expiresInDays } })}</p>
      <p style="text-align: center; margin: 32px 0;">
        <a href="${acceptUrl}" class="button">${translateMailText({ key: 'invitationAccept', locale })}</a>
      </p>
      <p style="font-size: 13px; color: #6b7280;">${translateMailText({ key: 'invitationIgnore', locale })}</p>
      <p style="font-size: 13px; color: #6b7280;">${translateMailText({ key: 'copyUrlPrompt', locale })}</p>
      <p style="font-size: 12px; color: #9ca3af; word-break: break-all;">${acceptUrl}</p>
    `,
  });
}

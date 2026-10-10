import { DEFAULT_LANGUAGE, type SupportedLanguage } from '@/shared/constants/i18n.constants.js';
import { baseTemplate, translateMailText } from '@/infrastructure/mail/templates/base.template.js';
import { escapeHtml } from '@/shared/utils/text/html-escape.util.js';

/**
 * Returns an HTML-escaped action URL only when it is a well-formed absolute `http(s)` URL;
 * otherwise `undefined`. HTML-escaping alone does not neutralize a hostile scheme such as
 * `javascript:` (it contains no characters that {@link escapeHtml} rewrites), so the scheme is
 * validated explicitly before the link is rendered.
 */
function sanitizeActionUrl(actionUrl: string | null | undefined): string | undefined {
  if (!actionUrl) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(actionUrl);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return undefined;
  }
  return escapeHtml(actionUrl);
}

/**
 * Render a notification row into the shared transactional email template, HTML-escaping every
 * untrusted field (title, message) and dropping any action URL that is not a safe `http(s)` link,
 * so the worker can safely hand the resulting `subject` + `html` pair to the mail outbox.
 *
 * @remarks
 * The returned `subject` is the raw title because an email `Subject:` header is plain text (not an
 * HTML context); the title is escaped only where it is interpolated into the HTML body.
 */
export function buildNotificationEmailHtml(notification: {
  title: string;
  message: string;
  actionUrl?: string | null;
  /** The recipient's language for the email's own copy (the title and message come translated). */
  locale?: SupportedLanguage;
}): { subject: string; html: string } {
  const locale = notification.locale ?? DEFAULT_LANGUAGE;
  const safeTitle = escapeHtml(notification.title);
  const safeMessage = escapeHtml(notification.message);
  const safeActionUrl = sanitizeActionUrl(notification.actionUrl);

  const html = baseTemplate({
    locale,
    title: notification.title,
    preheader: notification.message,
    body: `
                <h1>${safeTitle}</h1>
                <p>${safeMessage}</p>
                ${safeActionUrl ? `<p style="text-align: center; margin: 32px 0;"><a href="${safeActionUrl}" class="button">${translateMailText('notificationViewDetails', locale)}</a></p>` : ''}
              `,
  });

  return { subject: notification.title, html };
}

import type { MetaWhatsAppTemplate } from '@/infrastructure/messaging/meta-graph.client.js';
import {
  CONTACT_ACTIVITY_AUTOMATION_KIND,
  type ContactActivityAutomationKind,
} from './contact-activities.constants.js';

/** The language every notice template is approved in — the notices are English (launch D78). */
export const WHATSAPP_TEMPLATE_LANGUAGE = 'en';

/** How long after the person's last message a free-text WhatsApp message is still delivered. */
export const WHATSAPP_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** An approved template: its name and language, and the text submitted in Meta Business Manager. */
export interface WhatsAppNoticeTemplate extends MetaWhatsAppTemplate {
  /** The body with its `{{1}}`, `{{2}}`, … parameters, in Meta's syntax. */
  text: string;
}

/** A template in English, named as its notice. */
function template(name: string, text: string): WhatsAppNoticeTemplate {
  return { name, languageCode: WHATSAPP_TEMPLATE_LANGUAGE, text };
}

/**
 * The template of each automated notice (launch D32, D78) — what goes out when the person has not
 * messaged the clinic in 24 hours. Utility templates: submit each name and text in Meta Business
 * Manager before `WHATSAPP_TEMPLATES_ENABLED` is turned on.
 */
export const WHATSAPP_NOTICE_TEMPLATES: Readonly<
  Record<ContactActivityAutomationKind, WhatsAppNoticeTemplate>
> = {
  [CONTACT_ACTIVITY_AUTOMATION_KIND.BOOKING_CONFIRM]: template(
    'booking_confirm',
    'Hi {{1}}, please confirm your visit on {{2}} at {{3}}. Reply YES to confirm.',
  ),
  [CONTACT_ACTIVITY_AUTOMATION_KIND.BOOKING_REMINDER]: template(
    'booking_reminder',
    'Hi {{1}}, a reminder of your visit at {{2}} tomorrow, {{3}} at {{4}}. Reply YES to confirm, or reply here to change it.',
  ),
  [CONTACT_ACTIVITY_AUTOMATION_KIND.PAYMENT_RECEIPT]: template(
    'payment_receipt',
    'Hi {{1}}, we have received {{2}} for {{3}} on {{4}}. Thank you!',
  ),
  [CONTACT_ACTIVITY_AUTOMATION_KIND.PAYMENT_REMINDER]: template(
    'payment_reminder',
    'Hi {{1}}, {{2}} is still due on invoice {{3}}. You can pay at your next visit, or reply here and we will help.',
  ),
  [CONTACT_ACTIVITY_AUTOMATION_KIND.FEEDBACK_REQUEST]: template(
    'feedback_request',
    'Hi {{1}}, thank you for visiting us. How was your visit? Reply with a number from 1 (poor) to 5 (great).',
  ),
};

/**
 * The admins' day-close summary (launch D78, WC-10) as a template — sent as one always when
 * templates are on: the admins' 24-hour window is not known.
 */
export const WHATSAPP_DAY_CLOSE_SUMMARY_TEMPLATE: WhatsAppNoticeTemplate = template(
  'day_close_summary',
  'Day closed at {{1}} on {{2}}. Net {{3}}: cash {{4}}, UPI {{5}}, card {{6}}. Cash counted {{7}} against {{8}} expected ({{9}}). {{10}}, {{11}}. This summary goes to the clinic admins.',
);

/** How many parameters a template takes — its highest `{{n}}`. */
export function templateParameterCount(notice: WhatsAppNoticeTemplate): number {
  let highest = 0;
  for (const match of notice.text.matchAll(/\{\{(\d+)\}\}/g)) {
    highest = Math.max(highest, Number(match[1]));
  }
  return highest;
}

/**
 * A value as a template parameter: Meta refuses new lines, tabs, four spaces in a row and an empty
 * parameter — the value on one line, else `fallback`.
 */
export function templateParameter(value: string | null | undefined, fallback: string): string {
  const flat = (value ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > 0 ? flat : fallback;
}

/** The template's text with its parameters in — what the person reads, and what the stream keeps. */
export function renderWhatsAppTemplate(
  notice: WhatsAppNoticeTemplate,
  parameters: readonly string[],
): string {
  return notice.text.replace(/\{\{(\d+)\}\}/g, (placeholder, position: string) => {
    return parameters[Number(position) - 1] ?? placeholder;
  });
}

/**
 * Whether a notice to someone whose last message came at `lastReceivedAt` goes as its template:
 * never messaged, or not in the last 24 hours (Meta delivers free text only inside that window).
 */
export function isOutsideServiceWindow(lastReceivedAt: Date | null, now = new Date()): boolean {
  return (
    lastReceivedAt === null ||
    now.getTime() - lastReceivedAt.getTime() >= WHATSAPP_SERVICE_WINDOW_MS
  );
}

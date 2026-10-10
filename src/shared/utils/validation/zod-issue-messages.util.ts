import i18next from 'i18next';
import { z } from 'zod';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/shared/constants/i18n.constants.js';

/**
 * Zod's own message catalog per language the API answers in. English is also Zod's default, which
 * is how a schema-set message is told apart.
 */
const ZOD_MESSAGE_CATALOGS: Record<SupportedLanguage, z.core.$ZodErrorMap> = {
  en: z.locales.en().localeError,
  es: z.locales.es().localeError,
};

/** One validation message, rendered in every {@link SupportedLanguage}. */
export type LocalizedMessages = Record<SupportedLanguage, string>;

function renderWithCatalog(
  catalog: z.core.$ZodErrorMap,
  issue: z.core.$ZodIssue,
): string | undefined {
  const rendered = catalog(issue as unknown as Parameters<z.core.$ZodErrorMap>[0]);
  return typeof rendered === 'string' ? rendered : rendered?.message;
}

/**
 * Renders one Zod issue in every response language.
 *
 * @remarks
 * - **Algorithm:** a message Zod wrote itself (it equals the English catalog's) is rendered from
 *   each language's catalog; a message the schema set is a translation key (`errors:…`, translated
 *   with the i18next singleton) or, when not a key, kept as written.
 * - **Why:** `errors[].message` used to be Zod's English for every caller — the one part of an
 *   error response that ignored `Accept-Language`.
 * - **Notes:** the catalogs name the received type from the issue's `input`, so the parse must run
 *   with `reportInput: true`; the input is used here and never stored on the error.
 */
export function renderZodIssueMessages(issue: z.core.$ZodIssue): LocalizedMessages {
  const zodWroteIt = renderWithCatalog(ZOD_MESSAGE_CATALOGS.en, issue) === issue.message;
  const rendered = {} as LocalizedMessages;
  for (const language of SUPPORTED_LANGUAGES) {
    if (zodWroteIt && (issue.code !== 'invalid_type' || 'input' in issue)) {
      rendered[language] =
        renderWithCatalog(ZOD_MESSAGE_CATALOGS[language], issue) ?? issue.message;
    } else if (issue.message.startsWith('errors:') && i18next.isInitialized) {
      rendered[language] = i18next.t(issue.message, { lng: language });
    } else {
      rendered[language] = issue.message;
    }
  }
  return rendered;
}

/** The entry of `messages` for `language`, English for any other (or when it has none). */
export function pickLocalizedMessage(
  messages: Readonly<Record<string, string>>,
  language: string | undefined,
): string {
  return (language !== undefined ? messages[language] : undefined) ?? messages.en ?? '';
}

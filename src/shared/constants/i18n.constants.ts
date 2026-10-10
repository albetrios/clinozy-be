/**
 * The languages the API answers in — one translation set per entry under `src/shared/locales/`.
 * Requests (`Accept-Language`), organization defaults and every rendered email or validation
 * message choose from this list.
 */
export const SUPPORTED_LANGUAGES = ['en', 'es'] as const;

/** One of {@link SUPPORTED_LANGUAGES}. */
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** The language used when a request, user or organization names none. */
export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

/** Narrows an arbitrary string to a {@link SupportedLanguage}, {@link DEFAULT_LANGUAGE} otherwise. */
export function toSupportedLanguage(value: string | null | undefined): SupportedLanguage {
  return SUPPORTED_LANGUAGES.find((language) => language === value) ?? DEFAULT_LANGUAGE;
}

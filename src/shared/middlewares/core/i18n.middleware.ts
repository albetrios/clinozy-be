/**
 * i18n middleware: initializes i18next with the fs backend and gives every request one supported
 * language — `request.language`, a `request.t()` bound to it, and a `Content-Language` header.
 * English is the default and fallback locale.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fp from 'fastify-plugin';
import Backend from 'i18next-fs-backend';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import i18next from 'i18next';
import type { InitOptions } from 'i18next';
import { env } from '@/shared/config/env.config.js';
import { captureMessage } from '@/infrastructure/observability/sentry/sentry.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
  toSupportedLanguage,
} from '@/shared/constants/i18n.constants.js';

const LOCALES_DIR = join(process.cwd(), 'src', 'shared', 'locales');
const LOCALES_LOAD_PATH = join(LOCALES_DIR, '{{lng}}', '{{ns}}.json');

const REQUIRED_NAMESPACES = ['common', 'errors', 'success', 'mail'] as const;

/**
 * Resolves the effective locale for a request: prefers the first 2-letter
 * `Accept-Language` segment, falls back to the organization default locale,
 * then to {@link DEFAULT_LANGUAGE}; only the {@link SUPPORTED_LANGUAGES} are recognized.
 */
export function resolveRequestLanguageFromHeader({
  acceptLanguageHeader,
  organizationDefaultLocale,
}: {
  acceptLanguageHeader: string | string[] | undefined;
  organizationDefaultLocale?: SupportedLanguage | null | undefined;
}): SupportedLanguage {
  if (!acceptLanguageHeader) {
    return toSupportedLanguage(organizationDefaultLocale);
  }
  return toSupportedLanguage(String(acceptLanguageHeader).split(',')[0]?.trim().slice(0, 2));
}

/**
 * Decorates the Fastify `request` with the resolved {@link SupportedLanguage} and a `t()` fixed to it.
 *
 * @remarks
 * - **Algorithm:** {@link resolveRequestLanguageFromHeader} picks the language (`Accept-Language`,
 *   then the organization default, then {@link DEFAULT_LANGUAGE}); `request.t` is
 *   `i18next.getFixedT(language)` — a bound translator over the one shared instance.
 * - **Failure modes:** none — an unknown language maps to {@link DEFAULT_LANGUAGE}.
 * - **Side effects:** sets `request.language` and `request.t`; safe to call twice (the auth
 *   middleware calls it again with the organization default locale).
 * - **Notes:** D-1 — the request never names a language i18next loads. The previous
 *   `i18next-http-middleware` handler accepted any `?lng=`, `i18next` cookie or `Accept-Language`
 *   value, cloned the instance per request and called `loadLanguages` with it, which appended each
 *   new code to `i18next.options.preload` for good and reloaded the whole list: a stream of
 *   anonymous requests with random codes grew that list without bound and blocked the event loop.
 */
export function attachRequestI18nHelpers({
  request,
  organizationDefaultLocale,
}: {
  request: FastifyRequest;
  organizationDefaultLocale?: SupportedLanguage | null | undefined;
}): void {
  const language = resolveRequestLanguageFromHeader({
    acceptLanguageHeader: request.headers['accept-language'],
    organizationDefaultLocale,
  });
  request.language = language;
  request.t = i18next.getFixedT(language);
}

/**
 * Asserts that `src/shared/locales/en/{common,errors,success,mail}.json` exist
 * on disk before i18next initializes. In production deployments these files
 * must be copied into the image.
 */
export function verifyLocalesAvailable(): void {
  if (!existsSync(LOCALES_DIR)) {
    throw new Error(
      `Locales directory not found at ${LOCALES_DIR}. In production ensure src/shared/locales is copied (e.g. in Dockerfile).`,
    );
  }
  for (const namespace of REQUIRED_NAMESPACES) {
    const filePath = join(LOCALES_DIR, DEFAULT_LANGUAGE, `${namespace}.json`);
    if (!existsSync(filePath)) {
      throw new Error(
        `Required locale file not found: ${DEFAULT_LANGUAGE}/${namespace}.json at ${filePath}`,
      );
    }
  }
}

/**
 * i18next's init options — one set for the API and the worker.
 *
 * @remarks
 * `supportedLngs` + `nonExplicitSupportedLngs` + `load: 'languageOnly'` keep i18next itself on
 * {@link SUPPORTED_LANGUAGES}: a code outside the list is never loaded, whatever path asks for it.
 */
function buildI18nInitOptions(): InitOptions {
  return {
    preload: [...SUPPORTED_LANGUAGES],
    supportedLngs: [...SUPPORTED_LANGUAGES],
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    ns: [...REQUIRED_NAMESPACES],
    defaultNS: 'common',
    fallbackLng: [DEFAULT_LANGUAGE],
    returnNull: false,
    returnEmptyString: false,
    parseMissingKeyHandler: (key, language) => {
      if (env.I18N_REPORT_MISSING_KEYS && language !== DEFAULT_LANGUAGE) {
        captureMessage({
          message: `i18n missing key: ${key} (${language})`,
          options: { level: 'warning' },
        });
      } else if (!env.I18N_REPORT_MISSING_KEYS) {
        logger.debug({ key, language }, 'i18n.missing_key');
      }
      return key;
    },
    backend: {
      loadPath: LOCALES_LOAD_PATH,
    },
  };
}

/**
 * Initializes the i18next singleton in a process that renders text outside a request — the worker,
 * for notification emails. Idempotent; the API initializes it in {@link i18nMiddleware}.
 */
export async function initializeI18nextForBackgroundWork(): Promise<void> {
  if (i18next.isInitialized) return;
  verifyLocalesAvailable();
  await i18next.use(Backend).init(buildI18nInitOptions());
}

const i18nMiddleware: FastifyPluginAsync = async (app) => {
  verifyLocalesAvailable();
  await i18next.use(Backend).init(buildI18nInitOptions());

  // onRequest so request.t is set for every request (including the 404 not-found handler).
  app.addHook('onRequest', async (request) => {
    attachRequestI18nHelpers({ request });
  });

  // onSend, not onRequest: the auth middleware may switch the language to the organization
  // default after this hook ran, and the header must name the language the body is in.
  app.addHook('onSend', async (request, reply, payload) => {
    if (request.language) reply.header('content-language', request.language);
    return payload;
  });

  // Organization default-locale application moved to the auth middleware
  // (claim-driven) when the pre-auth X-Organization-Id header was removed.
};

// fp(): i18nMiddleware registers global onRequest/preHandler hooks that set request.t /
// request.language. Without fastify-plugin, app.register() encapsulates the plugin in a child
// scope and those hooks never fire for sibling-registered routes, so Accept-Language is silently
// ignored and every response falls back to English. Every other global-hook middleware here is
// fp()-wrapped for exactly this reason (see compress.middleware.ts).
export default fp(i18nMiddleware, { name: 'i18n-middleware' });

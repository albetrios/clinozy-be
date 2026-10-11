/**
 * i18n middleware: initializes i18next with fs-backend and language detection,
 * adds a preHandler so every request gets request.t(), request.language, request.i18n.
 * English is the default and fallback locale.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fp from 'fastify-plugin';
import Backend from 'i18next-fs-backend';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { handle as i18nextHandle, LanguageDetector } from 'i18next-http-middleware';
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

const I18N_IGNORE_ROUTES = ['/livez', '/readyz', '/api/v1/mcp'];

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

type I18nRequest = {
  language?: string;
  t?: (key: string, opts?: object) => string;
};

function applyResolvedLanguage({
  request,
  req,
  language,
}: {
  request: FastifyRequest;
  req: I18nRequest;
  language: SupportedLanguage;
}): void {
  req.language = language;
  (request as { language?: string }).language = language;
  const requestWithTranslation = request as I18nRequest;
  requestWithTranslation.t =
    req.t ??
    ((key: string, opts?: object) =>
      i18next.t(key, { lng: requestWithTranslation.language ?? DEFAULT_LANGUAGE, ...opts }));
}

/**
 * Decorates the Fastify `request` with `language` and `t()` helpers using the
 * locale resolved from `Accept-Language` and the organization default locale.
 * Called from i18n middleware hooks; safe to invoke twice (re-applies language).
 */
export function attachRequestI18nHelpers({
  request,
  req,
  organizationDefaultLocale,
}: {
  request: FastifyRequest;
  req: I18nRequest;
  organizationDefaultLocale?: SupportedLanguage | null | undefined;
}): void {
  const language = resolveRequestLanguageFromHeader({
    acceptLanguageHeader: request.headers['accept-language'],
    organizationDefaultLocale,
  });
  applyResolvedLanguage({ request, req, language });
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

/** i18next's init options — one set for the API and the worker. */
function buildI18nInitOptions(): InitOptions {
  return {
    preload: [...SUPPORTED_LANGUAGES],
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
  await i18next.use(Backend).use(LanguageDetector).init(buildI18nInitOptions());

  const handler = i18nextHandle(i18next, { ignoreRoutes: I18N_IGNORE_ROUTES });
  // Use onRequest so request.t is set for every request (including 404 not-found).
  app.addHook('onRequest', (request, reply, done) => {
    const req = request as unknown as Parameters<typeof handler>[0] & {
      language?: string;
      t?: (key: string, opts?: object) => string;
    };
    const res = reply;
    handler(req, res, (err?: Error) => {
      if (err) return done(err);
      attachRequestI18nHelpers({ request, req });
      done();
    });
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

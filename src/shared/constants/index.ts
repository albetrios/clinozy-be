export { GLOBAL_ROLES } from './roles.constants.js';
export type { GlobalRole } from './roles.constants.js';

/** Generic message returned to clients for any 500 response; internal details go to Sentry only. */
export const EXTERNAL_ERROR_MESSAGE = 'Something went wrong! Please try again later.';

/** Local-dev fallback base URL for the SPA when `FRONTEND_URL` is unset (email links, OAuth redirect URIs). Matches clinozy-fe's Vite dev server (`pnpm dev` on 5173) — NOT this API's own port. */
export const DEFAULT_FRONTEND_URL = 'http://localhost:5173';

/** Lowercase kebab-case slug (organization slugs, role slugs, public identifiers). */
export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/; // eslint-disable-line security/detect-unsafe-regex

/** Standard 8-4-4-4-12 UUID v1–v5 format (case-insensitive). */
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The HTTP methods that write — every one but `GET`, `HEAD` and `OPTIONS`. The one list behind the
 * idempotency claim, the queue dashboard's mutation gate, a read-only clinic's write refusal and the
 * route-coverage tooling.
 */
export const WRITE_HTTP_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export * from './ttl.constants.js';
export * from './limits.constants.js';
export * from './pagination.constants.js';
export * from './security.constants.js';
export * from './billing.constants.js';
export * from './notification.constants.js';
export * from './i18n.constants.js';

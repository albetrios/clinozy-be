# Shared — clinozy-be

Claude Code loads this file when it works in `src/shared/`. It holds sections moved out of the root [`CLAUDE.md`](../../CLAUDE.md), which keeps a pointer to each; the root rules apply here too.

## Shared

```text
src/shared/
  config/
    env.config.ts             # Environment validation entry (Zod)
    env-schema.ts             # Split Zod env schema
    load-env-files.ts         # .env.<NODE_ENV> then .env.local override loader
    worker-concurrency.util.ts
  errors/
    app.error.ts              # Base AppError + ERROR_CODE_TO_SNAKE
    auth.error.ts             # NotFoundError, UnauthorizedError, ForbiddenError, etc.
    validation.error.ts       # ValidationError
    configuration.error.ts    # ConfigurationError
    index.ts                  # Re-exports all
  types/
    index.ts                  # AuthContext, PaginatedResult (minimal by design)
  constants/                  # index.ts + billing, i18n, limits, notification, pagination,
                              # project-identity, query-limits, roles, security, ttl
  utils/                      # sub-categorized helpers (import full paths below)
    auth/ http/ i18n/ idempotency/ identity/ infrastructure/ security/ text/ validation/
    infrastructure/logger.util.ts   # Pino logger
    http/response.util.ts           # successResponse, paginatedResponse
    http/request.util.ts            # getRequestIdentifier, requireAuth
    http/api-versioning.util.ts     # buildPublicApiPrefix; applyPublicApiVersionHeader
  middlewares/                # registered via middlewares/index.ts → registerMiddleware()
    core/                     # auth, error-handler, idempotency, compression, i18n, metrics, health
    rate-limit/               # global + per-route limits
    security/                 # cors, helmet, captcha, api-key-auth, encryption
    session/                  # cookie session + CSRF origin pre-handler
  locales/
    en/, es/                  # common.json, errors.json, mail.json, success.json, openapi.json
```

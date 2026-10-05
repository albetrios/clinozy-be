# API versioning

Public HTTP APIs are **path-versioned** by major version only: `/api/v1/...`. Response envelopes follow [domains-and-public-api-design.md](../architecture/domains-and-public-api-design.md); versioning is independent of Paddle-style `data` / `meta` shaping.

---

## Versioning model

- **Major version** is the first segment after `/api/` (`v1`, `v2`, …). It signals **breaking** contract changes (URL, request/response shape, status semantics, auth requirements).
- **Non-breaking** fixes and additive fields ship on the **same** major path without a new version.
- When a **breaking** change is unavoidable, introduce **`/api/v{major}/...`** alongside the prior major for an overlap period; see [Adding a new major version](#adding-a-new-major-version).

---

## Adding a new major version

There is **no** separate `/api/v2` tree until a breaking release actually needs it. When it does:

1. Keep **one codebase path** per domain (`src/domains/<domain>/…`); versions differ by **mounted URL prefix**, not duplicated domain folders.
2. In [`src/routes.ts`](../../../src/routes.ts), register the same Fastify plugins again with a second prefix. Example:

   ```typescript
   await app.register(authRoutes(auth), {
     prefix: `${buildPublicApiPrefix('v2')}/auth`,
   });
   ```

3. Regenerate route and OpenAPI artifacts per project skills (`be-route-catalog`, `be-openapi-route-sync`) when routes change.

Constants and helpers live in **`src/shared/utils/http/api-versioning.util.ts`** (`PUBLIC_API_VERSION_SEGMENT_V1`, `buildPublicApiPrefix`, `applyPublicApiVersionHeader`).

---

## Runtime behavior (clinozy-be)

| Surface | Headers | Mechanism |
| ------- | ------- | --------- |
| All `/api/v1/*` responses | `API-Version: 1` | `api-versioning.middleware` (`onSend`) via `applyPublicApiVersionHeader` |

**Cursor list pagination:** All paginated list endpoints (organizations, memberships, member roles, member invitations, organization API keys, audit logs, webhooks, webhook delivery attempts, notifications, users) use cursor pagination only. Pass `limit` and optional `after` (opaque cursor from `meta.pagination.next`). The cursor is encrypted server-side (it carries the keyset position, never readable): pass it back unchanged — an edited or foreign cursor reads as the first page.

There is no `page` parameter: list query schemas are strict, so `page` (like any unknown parameter) is a **400** `validation_error`.

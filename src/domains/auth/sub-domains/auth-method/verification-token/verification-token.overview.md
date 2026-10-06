`src/domains/auth/sub-domains/auth-method/verification-token/`

# Verification tokens (nested implementation)

Parent: [auth-method](../auth-method.overview.md)

## Purpose

Internal persistence module for one-shot, type-scoped verification tokens in `auth.verification_tokens` (email verification codes, password-reset links, …). Not an API resource — no controller, routes, or serializer; auth-method services consume it directly.

## Layout

- `verification-token.service.ts` — thin wrapper over the repository (`create`, `consumeIfValid`)
- `verification-token.repository.ts` — atomic consume + cleanup queries
- `verification-token.schema.ts` — the `auth.verification_tokens` table
- `__tests__/unit/` — service/repository behavior suites

## Key invariants

- `consumeIfValid` enforces single-use replay protection with one atomic `UPDATE … WHERE used_at IS NULL AND expires_at > NOW() AND token_type = $2` — concurrent consumers cannot both succeed.
- Missing, expired, already-used, and wrong-type tokens are indistinguishable to the caller (`null` result) — no oracle for probing token state.
- **Role-gated, not row-gated**: FORCE RLS with `verification_tokens_deny_all` plus `verification_tokens_app_access`, granted to both runtime roles (`clinozy_be_app`, `clinozy_be_maintenance`). Safety within those roles rests on the lookup-by-hash invariants in the schema TSDoc (sec-D9).
- **Retention**: the audit-retention worker deletes rows 7 days past `expires_at`, on the maintenance pool.

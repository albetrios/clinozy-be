# Audit logs

Clinozy-be records security-relevant mutations in `audit.logs` via `recordScopedAuditEvent` (controllers) and `recordAuditEvent` (infrastructure). Writes are **best-effort**: failures are logged and must not fail the HTTP request.

## Query API

- `GET /api/v1/tenancy/organization/audit-logs` — requires `audit-log:read`, scoped to the active organization carried by the access token's `org` claim (`withAppDatabaseContext`, organization scope).
- `GET /api/v1/audit/logs` — global `SUPER_ADMIN` only; cross-tenant listing runs under `withMaintenanceDatabaseContext(MAINTENANCE_SCOPE.GLOBAL_ADMIN)` (`app.global_admin = true`) so FORCE RLS / `clinozy_be_app` see all tenants explicitly.

## Action naming

Actions use dot-separated names: `<domain>.<resource>.<verb>`.

| Action | Resource type | When |
| ------ | ------------- | ---- |
| `auth.login` | `session` | Successful login on any surface — password, email code, WebAuthn, OAuth, MFA second factor (`metadata.source`) |
| `auth.login_failure` | `session` | Failed login on any surface — anonymous actor (see [Actors](#actors)) |
| `auth.password.reset` | `user` | Completed password reset (`WARNING`) |
| `auth.mfa.recovery_code_used` | `mfa_method` | Login completed with an MFA recovery code (`WARNING`) |
| `auth.permission.denied` | `route` | A role, organization-permission, API-key-scope or organization-MFA check refused the request (`WARNING`) |
| `auth.super_admin.token_issued` | `session` | A `super_admin` access token was minted (`WARNING`) |
| `auth.logout` | `session` | Bearer logout |
| `auth.password.change` | `user` | Authenticated password change |
| `auth.auth_method.create` | `auth_method` | Link auth method |
| `auth.auth_method.delete` | `auth_method` | Remove auth method |
| `auth.mfa.enroll` | `mfa_method` | MFA enrollment |
| `auth.mfa.delete` | `mfa_method` | MFA removal |
| `auth.session.revoke` | `session` | Revoke one session |
| `auth.session.revoke_all` | `session` | Revoke all sessions |
| `tenancy.organization_settings.update` | `organization_settings` | PATCH organization settings |
| `tenancy.role.create` | `role` | Create member role |
| `tenancy.role.update` | `role` | Update member role |
| `tenancy.role.delete` | `role` | Delete member role |
| `tenancy.role_permissions.put` | `role` | Replace role permissions |
| `tenancy.membership.create` | `membership` | Add member |
| `tenancy.membership.update` | `membership` | Update membership |
| `tenancy.membership.delete` | `membership` | Remove member |
| `tenancy.membership.leave` | `membership` | Member leaves organization |
| `tenancy.membership.transfer_ownership` | `organization` | Ownership transfer |
| `tenancy.member_invitation.create` | `member_invitation` | Send invitation |
| `tenancy.member_invitation.resend` | `member_invitation` | Resend invitation |
| `tenancy.member_invitation.revoke` | `member_invitation` | Revoke invitation |
| `tenancy.api_key.create` | `api_key` | Create API key |
| `tenancy.api_key.update` | `api_key` | Update API key |
| `tenancy.api_key.delete` | `api_key` | Delete API key |
| `tenancy.api_key.rotate` | `api_key` | Rotate API key |
| `billing.subscription.create` | `subscription` | New subscription |
| `billing.subscription.update` | `subscription` | Update subscription |
| `billing.subscription.change_plan` | `subscription` | Plan change |
| `billing.subscription.cancel` | `subscription` | Cancel subscription |
| `billing.subscription.resume` | `subscription` | Resume subscription |
| `notify.webhook.create` | `webhook` | Create outbound webhook |
| `notify.webhook.update` | `webhook` | Update webhook |
| `notify.webhook.delete` | `webhook` | Delete webhook |
| `user.settings.update` | `user_settings` | PATCH user settings |
| `queue.pause` | `queue` | Bull Board queue pause (super admin) |

## Row shape

- `public_id` — the row's own public id (`aud_…`), minted by every writer; the list API returns it as `id` and the S3 export writes it as each line's `id`. The bigserial `id` never leaves the database.
- `actor_user_id` / `actor_api_key_id` — the acting user or organization API key, resolved by the drain from the public id the request carried; both NULL only for an anonymous row (see [Actors](#actors)).
- `organization_id` — set when the mutation is organization-scoped (resolved from the access token's `org` claim).
- `metadata` — public ids and non-PII context (no passwords or tokens). The list API and the export run `sanitizeAuditMetadata` (`audit.serializer.ts`): the internal-id keys `auth_method_id` / `mfa_method_id` are dropped, and a value under a credential-like key (`password`, `secret`, `token`, `api_key`, …, but never a `*public_id` key) is replaced by `[REDACTED]`.

## Actors

Every row written through `AuditService.record` names exactly one actor:

| Actor | Input field | Stored as |
| ----- | ----------- | --------- |
| User | `actorUserPublicId` | `actor_user_id` |
| Organization API key | `actorApiKeyPublicId` | `actor_api_key_id` |
| Anonymous — pre-authentication events only (`auth.login_failure`) | `anonymousActor: true` | both actor columns NULL, `metadata.actor_kind = 'anonymous'` |

`buildAuditActorFields(auth)` picks the user or key field for a request principal. An anonymous row
never names the account the caller tried (that would confirm the account exists); the IP address and
user agent are what an investigator queries on.

Three layers hold the rule. The `AuditActor` type ([`audit.types.ts`](../../../src/domains/audit/audit.types.ts))
makes an actorless call fail to compile. The outbox CHECK `chk_audit_outbox_actor_present` admits an
actorless row only when it is declared anonymous. `AuditService.record` logs `audit.record.missingActor`
at `error` and drops a value that bypassed the type. Before the actor was a type, actorless calls
compiled and were dropped at runtime — failed logins, password resets, recovery-code uses and API-key
permission denials never reached `audit.logs`.

## Storage & partitioning

`audit.logs` is created by the migrations as a **plain table** (`id bigserial PRIMARY KEY`) — this
is the committed schema, and a fresh clone or deploy reproduces it exactly.

High-volume **hosted** environments may RANGE-partition `audit.logs` by `created_at` (e.g. monthly
partitions) for cheaper retention pruning and time-windowed scans. That partitioning is applied
**out-of-band** (infra / DBA) and is intentionally **not** in the repo migrations, because it would
change the table shape everywhere: a partitioned table must include the partition key in its
primary key (`(id, created_at)` instead of `id`) and needs an ongoing partition-creation mechanism.

The application works with **either** shape:

- Reads and writes are keyed on `created_at` + `id` (the keyset-pagination indexes already cover this).
- Retention cleanup deletes by `created_at` window — equally valid against a plain table or by dropping old partitions.
- The FK migration [`20260601120000_audit_logs_actor_api_key.sql`](../../../migrations/20260601120000_audit_logs_actor_api_key.sql) adds its foreign key already-validated (not `NOT VALID`), because Postgres rejects `ADD FOREIGN KEY … NOT VALID` on a partitioned table (error 42809).

If you operate at a scale that needs partitioning, apply it in your environment's provisioning
(composite PK + initial partitions + a partition-creation job); the repo does not manage it.

## Export

Daily NDJSON export to S3 is documented in [audit-export.md](./audit-export.md).

## Tests

- `src/tests/security/infrastructure/mutation-audit.security.test.ts` — login, logout, user settings.
- `src/domains/auth/__tests__/integration/auth-audit-trail.integration.test.ts` — failed login, password reset, recovery-code login and API-key permission denial, end to end into `audit.logs` (real routes, real drain).
- `src/tests/integration/queue/audit-outbox-drain.integration.test.ts` — the drain: anonymous rows, the actor CHECK, unresolvable actors, concurrent drainers, per-row savepoints.
- `src/tests/security/infrastructure/queue-dashboard-audit.security.test.ts` — Bull Board mutations.

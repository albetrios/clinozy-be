# Audit logs

Clinozy-be records security-relevant mutations in `audit.logs` via `recordScopedAuditEvent` (controllers) and `recordAuditEvent` (infrastructure). Writes are **best-effort**: failures are logged and must not fail the HTTP request.

## Query API

- `GET /api/v1/tenancy/organization/audit-logs` — requires `audit-log:read`, scoped to the active organization carried by the access token's `org` claim (`withAppDatabaseContext`, organization scope).
- `GET /api/v1/audit/logs` — global `SUPER_ADMIN` only; cross-tenant listing runs under `withMaintenanceDatabaseContext(MAINTENANCE_SCOPE.GLOBAL_ADMIN)` (`app.global_admin = true`) so FORCE RLS / `clinozy_be_app` see all tenants explicitly.

## Action catalog

Actions are named `<domain>.<resource>.<verb>` (the API-key actions keep their `organization.`
prefix). This catalog and the code are one set: `audit-action-catalog.policy.unit.test.ts` fails when
a row names an action no code emits, or the code emits an action with no row.

**Severity.** `WARNING` marks a change to how an organization or account can be reached or used — a
credential minted, rotated or revoked; ownership transferred; an organization deleted or its status
changed; a security-policy change; a new webhook destination — plus every denial and break-glass use
(recovery code, `super_admin` token, admin action on a user). Everything else is `INFO`.

**Organization log.** A row carries `organization_id` — and so appears in that organization's own
`GET /tenancy/organization/audit-logs` — when the change belongs to an organization: everything under
Tenancy, Billing and Notify below. Auth, User and operations rows are tenantless. A deleted
organization's pending rows still land: the `audit.logs` insert policy resolves the organization
through a resolver that sees deleted organizations.

### Auth

| Action | Resource type | When |
| ------ | ------------- | ---- |
| `auth.login` | `session` | Successful login on any surface — password, email code, WebAuthn, OAuth, MFA second factor (`metadata.source`) |
| `auth.login_failure` | `session` | Failed login on any surface — anonymous actor (see [Actors](#actors)) |
| `auth.logout` | `session` | Bearer logout |
| `auth.organization.switch` | `session` | Active organization switched (`metadata.target`) |
| `auth.session.revoke` | `session` | One session revoked |
| `auth.session.revoke_all` | `session` | All sessions revoked |
| `auth.password.change` | `user` | Authenticated password change |
| `auth.password.reset` | `user` | Completed password reset (`WARNING`) |
| `auth.step_up` | `user` | Step-up re-authentication passed (`metadata.factor`) |
| `auth.auth_method.create` | `auth_method` | Sign-in method linked |
| `auth.auth_method.delete` | `auth_method` | Sign-in method removed |
| `auth.mfa.enroll_init` | `mfa_method` | MFA enrollment started |
| `auth.mfa.enroll_confirm` | `mfa_method` | MFA enrollment confirmed — recovery codes issued |
| `auth.mfa.delete` | `mfa_method` | MFA method removed |
| `auth.mfa.step_up` | `mfa_method` | MFA step-up passed |
| `auth.mfa.step_up_failure` | `mfa_method` | MFA step-up failed |
| `auth.mfa.recovery_code_used` | `mfa_method` | Login completed with an MFA recovery code (`WARNING`) |
| `auth.webauthn.register` | `webauthn_credential` | Passkey registered |
| `auth.webauthn.revoke` | `webauthn_credential` | Passkey revoked |
| `auth.permission.denied` | `route` | A role, organization-permission, API-key-scope or organization-MFA check refused the request (`WARNING`) |
| `auth.super_admin.token_issued` | `session` | A `super_admin` access token was minted (`WARNING`) |

### Tenancy

| Action | Resource type | When |
| ------ | ------------- | ---- |
| `tenancy.organization.create` | `organization` | Organization created — recorded in the new organization's log |
| `tenancy.organization.update` | `organization` | Name, slug or status changed (`metadata.changed_fields`; a status change at `WARNING`) |
| `tenancy.organization.delete` | `organization` | Organization deleted (`WARNING`) |
| `tenancy.organization_settings.update` | `organization_settings` | Settings changed (`metadata.changed_fields`; a `security_policy` change at `WARNING`) |
| `tenancy.membership.create` | `membership` | Member added — an invitation is sent |
| `tenancy.membership.update` | `membership` | Member's role or status changed (the member in `target_user_id`) |
| `tenancy.membership.delete` | `membership` | Member removed |
| `tenancy.membership.leave` | `membership` | Member left the organization |
| `tenancy.membership.transfer_ownership` | `organization` | Ownership transferred — the new owner in `target_user_id` (`WARNING`) |
| `tenancy.member_invitation.accept` | `member_invitation` | Invitation accepted — recorded in the joined organization's log |
| `tenancy.member_invitation.resend` | `member_invitation` | Invitation resent |
| `tenancy.member_invitation.revoke` | `member_invitation` | Invitation revoked |
| `tenancy.role.create` | `role` | Role created |
| `tenancy.role.update` | `role` | Role renamed or redescribed |
| `tenancy.role.delete` | `role` | Role deleted |
| `tenancy.role_permissions.put` | `role` | Role's permission set replaced (`metadata.permission_codes`) |
| `tenancy.notification_policy.create` | `notification_policy` | Notification policy created |
| `tenancy.notification_policy.update` | `notification_policy` | Notification policy changed |
| `tenancy.notification_policy.delete` | `notification_policy` | Notification policy deleted |
| `organization.api_key.create` | `organization_api_key` | API key minted (`WARNING`) |
| `organization.api_key.update` | `organization_api_key` | API key renamed, re-scoped or re-activated |
| `organization.api_key.revoke` | `organization_api_key` | API key revoked (`WARNING`) |
| `organization.api_key.rotate` | `organization_api_key` | API key secret rotated (`WARNING`) |

### Billing

| Action | Resource type | When |
| ------ | ------------- | ---- |
| `billing.subscription.create` | `subscription` | Subscription started (`metadata.plan_public_id`) |
| `billing.subscription.change_plan` | `subscription` | Plan changed (`metadata.plan_public_id` is the new plan) |
| `billing.subscription.cancel` | `subscription` | Cancellation requested |
| `billing.subscription.resume` | `subscription` | Cancellation withdrawn |

### Notify

| Action | Resource type | When |
| ------ | ------------- | ---- |
| `notify.webhook.create` | `webhook` | Webhook created — a new outbound destination (`WARNING`, `metadata.url_origin`) |
| `notify.webhook.update` | `webhook` | Webhook changed (`metadata.changed_fields`; a URL change at `WARNING` with its origin) |
| `notify.webhook.delete` | `webhook` | Webhook deleted |

A webhook URL is recorded as its origin only — the path and query can carry the receiver's secret.

### User

| Action | Resource type | When |
| ------ | ------------- | ---- |
| `user.settings.update` | `user_settings` | User settings changed |
| `user.self.delete` | `user` | Account deleted by its owner (`WARNING`) |
| `user.data_export.request` | `user_data_export` | Personal-data export requested |
| `user.data_export.url_minted` | `user_data_export` | Export download link issued |
| `user.admin.update` | `user` | A super admin changed a user |
| `user.admin.delete` | `user` | A super admin deleted a user (`WARNING`) |
| `user.admin.suspend` | `user` | A super admin suspended a user (`WARNING`) |
| `user.admin.unsuspend` | `user` | A super admin unsuspended a user (`WARNING`) |

### Audit and operations

| Action | Resource type | When |
| ------ | ------------- | ---- |
| `audit.admin.read` | `audit_log` | Cross-tenant audit listing by a super admin (`WARNING`) |
| `queue.pause` | `queue` | Bull Board: one queue paused |
| `queue.resume` | `queue` | Bull Board: one queue resumed |
| `queue.pause_all` | `queue` | Bull Board: every queue paused |
| `queue.resume_all` | `queue` | Bull Board: every queue resumed |
| `queue.clean` | `queue` | Bull Board: a queue's jobs in one state removed |
| `queue.retry` | `queue` | Bull Board: a queue's jobs in one state retried |
| `queue.promote` | `queue` | Bull Board: a queue's delayed jobs promoted |
| `queue.empty` | `queue` | Bull Board: queue emptied |
| `queue.obliterate` | `queue` | Bull Board: queue obliterated |
| `queue.concurrency` | `queue` | Bull Board: worker concurrency changed |
| `queue.job.add` | `queue` | Bull Board: job added |
| `queue.job.retry` | `queue` | Bull Board: one job retried |
| `queue.job.clean` | `queue` | Bull Board: one job removed |
| `queue.job.promote` | `queue` | Bull Board: one delayed job promoted |
| `queue.job.update_data` | `queue` | Bull Board: one job's data edited |
| `queue.unknown` | `queue` | Bull Board: an unrecognised mutating request (method and URL in `metadata`) |
| `queue.dlq.replayed` | `bullmq_dead_letter_job` | A dead-lettered job replayed by an operator (`pnpm tool:dlq-replay`) |
| `queue.dlq.auto_retried` | `bullmq_dead_letter_job` | A dead-lettered job retried by the DLQ sweeper — system actor (see [Actors](#actors)) |

## Row shape

- `public_id` — the row's own public id (`aud_…`), minted by every writer; the list API returns it as `id` and the S3 export writes it as each line's `id`. The bigserial `id` never leaves the database.
- `actor_user_id` / `actor_api_key_id` — the acting user or organization API key, resolved by the drain from the public id the request carried; both NULL only for an anonymous row (see [Actors](#actors)).
- `organization_id` — set when the mutation is organization-scoped (resolved from the access token's `org` claim).
- `metadata` — public ids and non-PII context (no passwords or tokens). The list API and the export run `sanitizeAuditMetadata` (`audit.serializer.ts`): the internal-id keys `auth_method_id` / `mfa_method_id` are dropped, and a value under a credential-like key (`password`, `secret`, `token`, `api_key`, …, but never a `*public_id` key) is replaced by `[REDACTED]`.

## Actors

Every row names exactly one actor:

| Actor | Input field | Stored as |
| ----- | ----------- | --------- |
| User | `actorUserPublicId` | `actor_user_id` |
| Organization API key | `actorApiKeyPublicId` | `actor_api_key_id` |
| Anonymous — pre-authentication events only (`auth.login_failure`) | `anonymousActor: true` | both actor columns NULL, `metadata.actor_kind = 'anonymous'` |
| System — the DLQ sweeper's automatic retry (`queue.dlq.auto_retried`, written straight to `audit.logs`) | — | both actor columns NULL, `metadata.actor_kind = 'system'` |

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
- `src/domains/tenancy/__tests__/integration/tenancy-audit-trail.integration.test.ts`, `src/domains/billing/__tests__/integration/billing-audit-trail.integration.test.ts`, `src/domains/notify/__tests__/integration/notify-audit-trail.integration.test.ts` — every organization governance change (membership, invitation, ownership, settings, role permissions, notification policies, API keys, subscriptions, webhooks, organization create and delete) staged with its actor and organization, then drained.
- `src/domains/audit/__tests__/unit/audit-action-catalog.policy.unit.test.ts` — this catalog and the emitted actions are one set.
- `src/tests/security/infrastructure/queue-dashboard-audit.security.test.ts` — Bull Board mutations.

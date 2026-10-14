`src/domains/tenancy/sub-domains/organization/organization-settings/`

# Organization settings (nested resource)

Parent: [organization](../organization.overview.md)

## Purpose

Read/write service for the per-organization settings row — default locale and the MFA-required flag — exposed under the active-organization resource (`/tenancy/organization/settings`). Also provides two unscoped helpers consumed during authentication, before any tenant context exists.

## Layout

- `organization-settings.controller.ts` / `organization-settings.service.ts` — thin HTTP + application layer
- `organization-settings.repository.ts` / `organization-settings.schema.ts` — persistence for the settings row
- `organization-settings.dto.ts` / `organization-settings.validator.ts` / `organization-settings.serializer.ts` / `organization-settings.types.ts` — request/response shaping
- `i18n-locale.cache.ts` — cached default-locale lookup used by the i18n middleware
- `organization-mfa-policy.ts` — cached (60 s Redis, falls back to Postgres on a Redis error) "does this organization require MFA?" lookup, read at organization switch, refresh and every organization-permission check
- `seed/` — seed contribution for settings rows
- `__tests__/unit/` — validator/serializer/service unit suites

## Key invariants

- PATCH semantics: only provided fields change (`omitUndefined` in the service); the settings row is lazily upserted on first write, so an organization without a row behaves as all-defaults.
- **Operating settings (launch D34, D35, D38)**: `default_day_float` (₹2,000.00), `lead_hold_days` (3), `reminder_hour` (16, 0–23), `retarget_after_days` (90), `deleted_record_purge_days` (7). Defaults live in `organization-settings.constants.ts` and in the columns; a reader with no row uses the constants. CHECKs hold structural bounds only — business limits belong to the validator.
- **Setup progress (feat-clinic-setup, routes-final §2.A.3)**: seven `setup_*` columns hold what a clinic's setup cannot read back from its records — the answered steps (`clinic_type`, `you`), the skipped guide items (`treatments`, `invite_team`), and when setup was deferred, went live (and which member took it live — a key inside the organization, `ON DELETE RESTRICT`), the guide was hidden and its items were first all done. Only the app's onboarding-setup routes write them, through this service's `getSetupProgress` / `changeSetupProgress` (one `INSERT … ON CONFLICT` that merges the arrays, so two admins never overwrite each other) / `completeSetup` and `markSetupGuideDone` (each sets its time once); `GET`/`PATCH /tenancy/organization/settings` neither show nor take them (the serializer names its fields, the DTO is strict). Migration `20261013112241_organization_settings_setup_progress.sql` also marked live every clinic that already had an active main branch and an active service.
- `resolveDefaultLocaleForOrganization` (falls back to `'en'`), `userHasOrganizationRequiringMfa` and `organizationRequiresMfa` intentionally run **without** organization RLS context — they execute at login/i18n/authorization time before the tenant GUC is set (the MFA ones through the SECURITY DEFINER resolvers `tenancy.user_has_organization_requiring_mfa` / `tenancy.organization_requires_mfa`); every other read/write is organization-scoped.
- **`mfa_required` holds after login, not only at it**: an organization requiring MFA admits only a session that has proved a second factor (`auth.sessions.mfa_verified_at`, mirrored in the access token's `amr: ['mfa']`). Organization switch refuses an unverified session (403, reason `mfa_required`), refresh stops minting that organization into its token, and `requireOrganizationPermission` refuses an unverified token on every organization route. A PATCH of `security_policy` drops the cached policy, so turning `mfa_required` on applies to existing sessions on their next request.

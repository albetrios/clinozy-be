`src/domains/user/sub-domains/user-settings/`

# User settings

Parent: [user](../../user.overview.md)

## Purpose

Per-user feature toggles and presentation preferences (locale override, theme, dashboard widgets, etc.). The row is optional: if a user has no settings row, the API serializes the platform default. Writes upsert.

## Key invariants

- **Default-on semantics**: a missing row implies the platform default, never "feature disabled".
- **One row per user**: `user_id` is unique; writes upsert.
- **Settings are user-private**: nothing here is organization-scoped or visible to other users.
- **Locale override is the auth source for i18n**: when set, it overrides `Accept-Language` for response translation.
- **The analytics consent fields are a receipt** (launch D85, re-scoped by iteration
  `change-cookie-consent-2026-10-13-fmal` CC1–CC4): the browser owns the answer in its own cookie
  (claude.com's model — signing out never forgets it, signing in never replaces it), and the
  account keeps a receipt of the last answer given **while signed in**: `analytics_consent`
  (`granted` / `denied`), the `analytics_consent_version` it answered and `analytics_consent_at` —
  null until first given, written together (`chk_user_settings_analytics_consent`). A `PATCH`
  sends the decision and the version together (either alone is a 400 on
  `analytics_consent_version`); the database stamps the time. Each decision is also its own audit
  row, `user.settings.analytics_consent.update`, with the decision, version and time — the proof of
  consent. Nothing reads the receipt back to decide what runs, and `POST /auth/logout` leaves it as
  it was (pinned by `consent-receipt-survives-logout.integration.test.ts`).

## Lifecycle

```mermaid
stateDiagram-v2
  [*] --> default: user has no row → API returns platform defaults
  default --> customized: PATCH /users/me/settings (upsert row)
  customized --> customized: subsequent PATCH updates fields
  customized --> default: explicit reset (DELETE row)
```

## Failure modes

- **Unknown setting key** → 400 Validation error.
- **A consent decision without its policy version, or the reverse** → 400 on `analytics_consent_version`.
- **Locale value not in supported list** → 400.

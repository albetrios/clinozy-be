`src/domains/app/sub-domains/onboarding-setup/`

# Onboarding setup

Parent: [app](../../app.overview.md)

## Purpose

The server side of a new clinic's setup (iteration `feat-clinic-setup-2026-10-13-sltd`, routes-final §2): the
status of the 3-tap setup drawer and of the short guide behind the profile icon, the answers and skips a manager
saves, and going live. `GET` / `PATCH /api/v1/app/onboarding-setup` and `POST /api/v1/app/onboarding-setup/complete`,
each `organization:update` (Owner, Admin) and team-only.

## Layout

- `onboarding-setup.routes.ts` / `onboarding-setup.controller.ts` — the three routes and their thin handlers
- `onboarding-setup.service.ts` — works out the status (live checks, `next_step`, the guide's ticks) and runs the
  change and going live
- `onboarding-setup.dto.ts` / `onboarding-setup.validator.ts` — the `PATCH` body
- `onboarding-setup.serializer.ts` / `onboarding-setup.types.ts` / `onboarding-setup.constants.ts` — the Onboarding
  setup object, the steps, the guide items and the live checks
- No schema and no repository of its own.

## Key invariants

- **No table of its own (D5, OS2):** the stored progress — the answered steps (`clinic_type`, `you`), the skipped guide
  items (`treatments`, `invite_team`) and the times — lives in seven `setup_*` fields of
  `tenancy.organization_settings`, read and written only through the organization-settings service.
- **Ticks are read, never stored (OS3):** a main branch is the active `is_main` branch; "services" is at least one
  active offering (two tick "Add your treatments"); "Invite your team" is anyone besides the owner, invited or active;
  "Book your first appointment" is any live appointment; "someone to book" is an active member holding the Doctor or
  Therapist system role (`APP_BOOKABLE_ROLE_NAMES`), main or extra.
- **Merges, never overwrites (OS5):** a `PATCH` adds or removes single values in one statement, so two admins
  answering at once keep both answers; `deferred` is set once; `guide_hidden` sets or clears its time.
- **Going live is checked by the server (OS6):** the clinic type answered, an active main branch and an active
  service; otherwise `409` with reason `onboarding_setup_incomplete`, its message naming each missing check. A
  second call answers as it stands — the first completer stays. The Consultations are the client's to create first.
- **"All done" is stored once (OS7):** the first read that finds a live clinic's three guide items done or skipped
  writes `setup_guide_done_at`; it never clears.
- **Team-only (OS4):** a personal workspace is refused with reason `team_organization_required` — `404` on the read (it has no clinic setup; 422 is for writes only — D35), `422` on the two writes.
- **Existing clinics (OS8):** marked live by migration `20261013112241_organization_settings_setup_progress.sql`.

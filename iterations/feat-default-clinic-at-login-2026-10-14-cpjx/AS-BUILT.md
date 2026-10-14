# feat-default-clinic-at-login-2026-10-14-cpjx — as built

Baseline: none · KICKOFF.md approved 2026-10-14 ([DC12](plans/decisions.md))

## Rows

| #   | Planned | Actually built | Difference | Why | Decision | Commit |
| --- | --- | --- | --- | --- | --- | --- |
| #1  | ROUTE 1 — remember the clinic on `switch-to-organization`, restore it in the login default | **Write:** `UserRepository.rememberLastActiveOrganization` (one owner-scoped `UPDATE … WHERE last_active_organization_id IS DISTINCT FROM $1`, returns whether a row changed) and `UserService.rememberLastActiveOrganization` (`PRINCIPAL_SCOPE.VERIFIED`); `AuthService.switchToOrganization` calls it after `mintForActiveOrganization` re-binds the session, catching any failure into `logger.warn('auth.switch_to_organization.remember_failed')`. **Read:** `OrganizationRepository.findDefaultActiveOrganizationPublicId(user_id, includePersonalOrganizations, preferTeamOrganizations)` joins the caller's `auth.users` row and orders by personal-last (team organizations on) or personal-first (off), then `organizations.id IS NOT DISTINCT FROM users.last_active_organization_id`, then `joined_at`; `resolveDefaultActiveOrganizationPublicId` passes `env.TEAM_ORGANIZATION_ENABLED`. The `switch-to-organization` route description says the organization is remembered. **Tests:** `default-active-organization.db.unit.test.ts` (5 — remembered beats newer + personal; newest beats personal; inactive remembered skipped down to personal; B2C keeps personal first; write only on change), `login-restores-last-clinic.integration.test.ts` (2 — login → switch → login ×2; suspended remembered clinic skipped), `auth.service.unit.test.ts` (+2 — remembered after the re-bind; a failed remember still returns the token; the MFA refusal remembers nothing); `refresh-preserves-active-organization.integration.test.ts` creates its team after the login (it relied on "personal first") | the repository gained a third positional parameter instead of an options object | repositories are exempt from the options-object rule and the existing two were positional | DC5 – DC8 | (this commit) |
| #2  | ROUTE 2 — docs, acceptance, frontend route map, gates | `personal-vs-team-organizations.md` (login-default column per mode + a paragraph on the remembered clinic; token-model rows), `frontend-auth-guide.md` (switching remembers the login default), `src/FLOWS.md` (organization-switch side effects), `auth.overview.md` (a "Login default organization" invariant); `plans/acceptance.md`; `plans/frontend-route-map.md` (§ 1, § 2, § 4 by hand, § 3 generated, `--check` ✓) | § 3 keeps the generated catalog | nothing to trim to — no route changed shape | DC15 | (this commit) |

## Summary

- **Built:** sign-in opens the clinic the person last switched to; with nothing remembered, the
  newest clinic; the personal workspace only when there is no clinic ([DC4](plans/decisions.md) –
  [DC6](plans/decisions.md)). No migration, route, policy or job ([DC8](plans/decisions.md)).
- **Verified end to end** on the local stack with clinozy-fe (its `AS-BUILT.md` #1): before — three
  sign-ins, three clinic pickers; after — three sign-ins straight into a clinic, the second into the
  clinic switched to in between.
- **Planned, not built:** none. **Built, not planned:** none.
- **Acceptance:** [plans/acceptance.md](plans/acceptance.md) — A-1 – A-6 pass.
- **Gates:** `lint` ✓ · `typecheck` ✓ · `tsdoc:check` ✓ (0/0) · `knip` ✓ · `test:unit` ✓ (688 files / 5394 tests) · `test:unit-db` (tenancy, user, auth) ✓ (28 / 137) · `test:global` ✓ (34 / 142) · e2e + integration for auth, tenancy and user ✓ (54 / 584) · the same for auth and the organization sub-domain under `test:rls-role` ✓ (28 / 275) · `routes:catalog:check` ✓ · `docs:check` ✓ · `validate:route-schema-docs` ✓ · `validate:domain` ✓ · `docs:lint` ✓ · `iteration:frontend-map --check` ✓.
- **Reported, not built:** no environment file or setup manifest in this repository sets
  `PERSONAL_ORGANIZATION_ENABLED`, so it runs on its default, `true` (hybrid), although
  `personal-vs-team-organizations.md` says Clinozy runs B2B. With this iteration that no longer
  sends anyone to the picker. Setting `PERSONAL_ORGANIZATION_ENABLED=false` in the hosted
  environments (GitHub Environment variables) would still make them match the documented mode;
  that is an operator decision, left open.

## Standing deviations

None. This iteration has no design input.

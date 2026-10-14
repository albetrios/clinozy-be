# feat-default-clinic-at-login-2026-10-14-cpjx — acceptance

One row per acceptance criterion in `KICKOFF.md` § 6; the screen-level check is clinozy-fe's
(F-1 – F-3 in its iteration).

| Item | Source | Result | Evidence |
| --- | --- | --- | --- |
| A-1 After `switch-to-organization` to clinic B, the next login's token carries B — ahead of a clinic joined later and of the personal workspace | DC5, DC6 | pass | `login-restores-last-clinic.integration.test.ts` (login → switch to the older clinic → two more logins carry it) · `default-active-organization.db.unit.test.ts` (remembered beats newer + personal) · local stack, clinozy-fe `AS-BUILT.md` #1 (2nd sign-in opens the clinic switched to) — [AS-BUILT #1](../AS-BUILT.md) |
| A-2 With nothing remembered, the login opens the most recently joined clinic, not the personal workspace | DC6 | pass | `login-restores-last-clinic.integration.test.ts` (first login → newest clinic) · `default-active-organization.db.unit.test.ts` — [AS-BUILT #1](../AS-BUILT.md) |
| A-3 A remembered clinic the person no longer belongs to is skipped: the next clinic, else the personal workspace | DC6 | pass | `default-active-organization.db.unit.test.ts` (suspended → other clinic → personal) · `login-restores-last-clinic.integration.test.ts` (suspended remembered clinic) · `refresh-preserves-active-organization.integration.test.ts` (refresh fallback) — [AS-BUILT #1](../AS-BUILT.md) |
| A-4 With team organizations disabled, the personal workspace stays first | DC6 | pass | `default-active-organization.db.unit.test.ts` (B2C) — [AS-BUILT #1](../AS-BUILT.md) |
| A-5 A failure to remember never fails the switch; a repeat switch to the remembered clinic writes nothing | DC5, DC7 | pass | `auth.service.unit.test.ts` (remember after re-bind; a rejected remember still returns the token; the MFA refusal remembers nothing) · `default-active-organization.db.unit.test.ts` (second identical remember updates no row) — [AS-BUILT #1](../AS-BUILT.md) |
| A-6 Docs and mirrors describe the new default; the gates pass | DC8, DC15 | pass | Docs: [AS-BUILT #2](../AS-BUILT.md). Gates: `lint` ✓ · `typecheck` ✓ · `tsdoc:check` ✓ (0/0) · `knip` ✓ · `test:unit` ✓ (688 files / 5394 tests) · `test:unit-db` (tenancy, user, auth) ✓ (28 / 137) · `test:global` ✓ (34 / 142) · e2e + integration for auth, tenancy and user ✓ (54 / 584) · the same for auth and the organization sub-domain under `test:rls-role` ✓ (28 / 275) · `routes:catalog:check` ✓ · `docs:check` ✓ · `validate:route-schema-docs` ✓ · `validate:domain` ✓ · `docs:lint` ✓ · `iteration:frontend-map --check` ✓ |

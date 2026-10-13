# Acceptance — feat-clinic-setup-2026-10-13-sltd

One row per acceptance criterion this repository proves; Result and Evidence stay empty until built
(`be-kickoff-iteration` › Close). Criteria only the frontend can prove are listed under the frontend with the backend
part they rely on.

| Item | Source | Result | Evidence |
| --- | --- | --- | --- |
| A1 — A clinic's first branch becomes main even when the request does not say so | BRIEF.md:277 · BR1 | | |
| A2 — After step 2 the clinic has exactly one open main branch; repeating the step creates no second branch (a second main is a `409` the client reads back) | BRIEF.md:259–260 · BR2, BR3 | | |
| A3 — Two first branches at once leave one main and no error for the request that did not ask | BR3 | | |
| A4 — The server refuses to go live while the clinic type, the main branch or a service is missing, naming each | BRIEF.md:276 · OS6 | | |
| A5 — Going live twice returns the same object; the first completer stays recorded | OS6 · `quality.safe-to-repeat` | | |
| A6 — The status reads the three live checks and the three guide items from the records (each, done and not done) | BRIEF.md:269–270 · OS3 | | |
| A7 — `invite_team` and `treatments` can be skipped and un-skipped; `first_appointment` cannot (`400`) | D28 · 2.A.9 | | |
| A8 — The first read with all three items done or skipped records `guide_done_at`; it never resets | BRIEF.md:271–272 · OS7 | | |
| A9 — Two concurrent `PATCH`es (different answers) both land | OS5 · `quality.no-lost-answers` | | |
| A10 — A member without `organization:update` gets `403`; a personal workspace gets `422 team_organization_required` | BRIEF.md:217–219, 239, 273 · OS4 | | |
| A11 — A clinic with an active main branch and an active service before the change reads live after the migration, with no completer | BRIEF.md:275 · OS8 | | |
| A12 — `GET`/`PATCH /tenancy/organization/settings` neither show nor take a `setup_*` field; Settings › Clinic's values save as before | BRIEF.md:279 · OS2 | | |
| A13 — The owner can add Doctor or Therapist as an extra role and the branch's hours as their own (built route, relied on) | BRIEF.md:261–262 · `access.owner-extra-role` | | |
| A14 — The setup routes are in the route catalog with scope `team`, their OpenAPI summaries in en and es, and every new error message in en and es | OSC5 · `quality.errors-translated` | | |
| A15 — The RLS-role lane passes for the setup routes and the migration's fill | `quality.tenant-isolation` | | |

Frontend-proved (clinozy-fe `KICKOFF.md` §8), relying on the routes above: the drawer on any room and its address
(BRIEF.md:251–255), three steps unlocking in order (256), PIN autofill (258), "Go live" creating the Consultations
(263), "Explore first" and "Finish setup" (265), the create-action guard (267), the ring and the menu rows (269–272), the
members' notice (273), Places & days (278), Settings › Clinic (279), the shortened /onboarding (280), keyboard and
390px (281).

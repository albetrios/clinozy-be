# Decisions — change-shell-polish-and-sign-in-2026-10-13-ojjp

Every blocking answer and every scope decision, add-only: a changed mind is a new row that supersedes
an old one (and says so). Kind is `RED` (answered — here by delegation, D1), `AMBER` (a safe default,
still open) or `SCOPE` (a scope decision). Row numbers are cited by [coverage.md](coverage.md), the
story and `KICKOFF.md`.

Related context: the same-named clinozy-fe iteration plans the frontend half of the same `BRIEF.md`
(byte-identical, Intake hash `bc5d68b3628f` in both repositories); its decisions D1–D15 are cited
where they bear on a question here.

| # | Question | Options | Decision | Date | Who | Kind |
| --- | --- | --- | --- | --- | --- | --- |
| D1 | How is the iteration run? | ask at every step · run it on the recommendations | The user asked to plan both sides, "go ahead with your recommendation", "finalize and approve the iteration according to you" and to deliver two branches with no PR until they confirm. Every step runs without a stop; every RED takes the recommended option and says so. | 2026-10-13 | user | SCOPE |
| D2 | Baseline | `launch-2026-09-30-jxmr` · `none` | `launch-2026-09-30-jxmr` — the only iteration with an intake (no `done` / `frozen` one exists, so there is no default). Saved with `pnpm iteration:baseline`. | 2026-10-13 | Claude (D1) | RED |
| D3 | Intake mode | full · overlay · brief | `brief` — the change arrived as a written request. `pnpm iteration:diff` shows only `BRIEF.md` added. | 2026-10-13 | Claude (D1) | RED |
| D4 | Branch | `change/shell-polish-and-sign-in` · the session branch | `claude/determined-rubin-c9i935` (the session pins pushes to it). | 2026-10-13 | Claude (D1) | SCOPE |
| D5 | Does the brief need anything from the backend? | a route, table, job, seed or permission · nothing | Nothing. Every change is presentation: the room frame's motion, tab labels, the colour of a picked badge, the sign-in screen's layout and copy (`BRIEF.md:5–34`); the brief rules out any API, data or background change (`BRIEF.md:57–58`, `:88`). | 2026-10-13 | Claude (D1) | RED |
| D6 | Should the backend serve the sign-in screen's marketing copy (a public "product facts" route)? | a public route with copy and live counts · static copy in the frontend's locales | Static copy in the frontend (its D11): no invented numbers, so there is nothing live to serve, and a public unauthenticated route would add attack surface for no gain. | 2026-10-13 | Claude (D1) | RED |
| D7 | Should the demo organization be seeded with clinic records so the picked badges show in a fresh stack? | extend `db:seed:full` · leave the seeds | Leave them — out of scope (`BRIEF.md:88`); the bulk seed already fills leads and contacts for its own organizations, and the frontend verifies the badges on Filters, drawers and the Today lanes, which need no records. A demo-clinic seed is a candidate for its own iteration. | 2026-10-13 | Claude (D1) | RED |
| D8 | The route review | sub-domain sections · none | None in scope: no sub-domain is added or changed, so `routes-final.md` records an empty review and the contract the frontend relies on. | 2026-10-13 | Claude (D1) | SCOPE |
| D9 | Approval | — | Approved by delegation (D1) after the Step 7 self-check passed. | 2026-10-13 | Claude (D1) | SCOPE |
| D10 | Kickoff wants a `done` or `frozen` Baseline; the launch reads `implementing` | wait for the launch to close · build on the merged launch code | Build: the launch is merged on `main` (`7f150a6`), so this builds on built code; the launch's Status is its owner's to close and is not edited here. | 2026-10-13 | Claude (D1) | SCOPE |

# Decisions — feat-clinic-setup-2026-10-13-sltd

Every blocking answer and every scope decision, add-only: a changed mind is a new row that supersedes
an old one (and says so). Kind is `RED` (answered by the user), `AMBER` (a safe default, still open)
or `SCOPE` (a scope decision during implementation). Row numbers (`D1`, `D2`, …) are cited by
[coverage.md](coverage.md), the stories and `KICKOFF.md`.

The same-named clinozy-fe iteration records the same answers in its own `plans/decisions.md` (same
numbers for the shared rows D1–D10).

| # | Question | Options | Decision | Date | Who | Kind |
| --- | --- | --- | --- | --- | --- | --- |
| D1 | What shape should the clinic setup take? | full-screen steps on their own page · steps in a drawer over Today · checklist only | **Steps in a drawer over Today** ("On today screen drawer would be good"). The recommendation was full-screen steps; the user chose the drawer. | 2026-10-13 | Nikunj Mavani | RED |
| D2 | May the owner skip setup and look around first? | yes, "Explore first" · no, essentials first | **Yes, "Explore first"** — Today with the setup guide pinned; "New booking" reopens setup until a branch exists. | 2026-10-13 | Nikunj Mavani | RED |
| D3 | How wide is this iteration? | complete · lean | **Complete** — also the screens that exist only in the API today: rooms, machines and holidays in the branch drawer, and a Clinic section in Settings. | 2026-10-13 | Nikunj Mavani | RED |
| D4 | What happens to the existing /onboarding wizard? | shorten it · keep it as is | **Shorten it** — Welcome → Your name → Clinic name → Done; invitations move into setup with real roles and the main branch; the generic questions go ("How did you hear about us?" moves to the Ready step). | 2026-10-13 | Nikunj Mavani | RED |
| D5 | Where is a clinic's setup progress stored? | a new `app.clinic_setups` table · columns on `tenancy.organization_settings` | **Columns on `tenancy.organization_settings`** (already one row per clinic). The recommendation was a new table; the user chose the settings row. The ticks themselves stay read from the clinic's real records. | 2026-10-13 | Nikunj Mavani | RED |
| D6 | How does "What do you offer?" start? | suggested per specialty · blank form | **Suggested per specialty** — a starter list with typical name, minutes, price and GST to edit; Consultation ticked; at least one required. The list itself is confirmed at Step 4. | 2026-10-13 | Nikunj Mavani | RED |
| D7 | What about clinics created before this ships? | mark set up if ready · show them the guide | **Mark set up if ready** — a clinic with an open main branch and an active service counts as set up: no drawer, no guide unless opened. | 2026-10-13 | Nikunj Mavani | RED |
| D8 | How does this design enter the iteration? | a brief on the launch · wait for a design drop | **A brief on the launch** — `BRIEF.md` placed with `--mode brief --both` on Baseline `launch-2026-09-30-jxmr`. Planning goes ahead now; kickoff waits until the launch is `done` (be-kickoff-iteration › Step 0). | 2026-10-13 | Nikunj Mavani | RED |
| D9 | Which route document is the truth for what exists? | the launch's `plans/routes-final.md` · `schema-routes.md` | **The route review is the final one** ("Final routes is final one" · "Consider that one") — every existing route is planned against the launch's `plans/routes-final.md` (§1–§12, with §12's revisions D81, D82), not the older `schema-routes.md` wording; this iteration's own `plans/routes-final.md` (Step 5) is the binding design, built ditto. | 2026-10-13 | Nikunj Mavani | RED |
| D10 | Inside the drawer, how is "one detail at a time" shown? | the design's step cards (`_patterns.md` › Step cards) · one screen per question with its own Back / Next | **The design's step cards** — one step open at a time, finished steps folded into a ✓ peek, "Next: <step> →" saves the step (BRIEF.md:34–41). Reuses the house drawer pattern; still open for the user to change. | 2026-10-13 | Claude (from the brief) | AMBER |

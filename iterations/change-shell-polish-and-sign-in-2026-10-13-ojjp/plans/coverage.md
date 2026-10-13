# Coverage — change-shell-polish-and-sign-in-2026-10-13-ojjp

Status: ready — every row is `covered` or `out-of-scope` with the decision that put it there.

Mode: incremental (Baseline `launch-2026-09-30-jxmr`) · Intake mode `brief` · Intake hash `bc5d68b3628f`
· Schema-routes `5f90325208e1` (unchanged).

## Coverage

One row per item of `BRIEF.md` (the change list in brief mode).

| Source (file:line) | Item | Requirement | Feature | Acceptance | Status |
| --- | --- | --- | --- | --- | --- |
| `BRIEF.md:5–9` | Room switch without a scrollbar flash | — (frontend) | [sign-in-and-shell-polish](features/sign-in-and-shell-polish/story.md) | A3 | out-of-scope — frontend only ([D5](decisions.md)) |
| `BRIEF.md:10–14` | Tabs keep their place | — (frontend) | sign-in-and-shell-polish | A3 | out-of-scope — frontend only ([D5](decisions.md)) |
| `BRIEF.md:15–21` | Soft picked badges | — (frontend) | sign-in-and-shell-polish | A3 | out-of-scope — frontend only ([D5](decisions.md)) |
| `BRIEF.md:22–34` | New sign-in screen | `quality.contract-unchanged` | sign-in-and-shell-polish | A1, A2 | covered — its auth routes are confirmed unchanged |
| `BRIEF.md:52` | Entities: none | `data.none` | sign-in-and-shell-polish | A1 | covered |
| `BRIEF.md:53` | Routes: none; `/login` keeps its URL | `quality.contract-unchanged` | sign-in-and-shell-polish | A1, A2 | covered |
| `BRIEF.md:57–58` | No API, data or background change | `quality.contract-unchanged` | sign-in-and-shell-polish | A1 | covered |
| `BRIEF.md:59` | Strings are translation keys | — (frontend locales) | sign-in-and-shell-polish | A3 | out-of-scope — no backend message changes ([D5](decisions.md)) |
| `BRIEF.md:64` | No invented numbers in the copy | — | sign-in-and-shell-polish | A3 | out-of-scope — no backend copy route ([D6](decisions.md)) |
| `BRIEF.md:68–83` | Acceptance criteria 1–10 | — (frontend) | sign-in-and-shell-polish | A3 | out-of-scope — proved by the frontend ([D5](decisions.md)) |
| `BRIEF.md:84` | "the backend's gates pass" | `quality.contract-unchanged` | sign-in-and-shell-polish | A4 | covered |
| `BRIEF.md:88` | No backend route, table, job, seed or permission | `quality.contract-unchanged` | sign-in-and-shell-polish | A1 | covered |
| `BRIEF.md:89–93` | Other out-of-scope items | — | — | — | out-of-scope ([D5](decisions.md)) |

## Reconciliation

Brief mode has no new design source: the brief is reconciled against the carried-forward `PRD.md` /
`schema-routes.md` and the code.

| # | Item | PRD says (file:line) | schema-routes says (file:line) | Verdict | Action |
| --- | --- | --- | --- | --- | --- |
| R1 | The sign-in surface | the app's users sign in before the clinic shell (`PRD.md:9`) | `/login` is the frontend route; the auth operations are the platform's, not the clinic API's (`_index.md:20` points to it) | no conflict | none — no route changes ([D5](decisions.md)) |
| R2 | Marketing claims on the sign-in screen | the product description (`PRD.md:9`) and adjectives (`PRD.md:214`) | — | the copy states only what the PRD says | the frontend's D11; no backend copy ([D6](decisions.md)) |

## Delta (incremental)

`pnpm iteration:diff launch-2026-09-30-jxmr change-shell-polish-and-sign-in-2026-10-13-ojjp`: files —
added `BRIEF.md`, nothing removed or changed; screens, PRD, schema-routes and the prototype unchanged;
entities, fields, enums, routes and operations — none added, removed or changed. The diff and the
brief agree: no finding.

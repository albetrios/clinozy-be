# fix-cookie-consent-freeze-2026-10-13-dhpr — kickoff

## 1. Header

| Field     | Value                                                               |
| --------- | ------------------------------------------------------------------- |
| Iteration | `fix-cookie-consent-freeze-2026-10-13-dhpr`                         |
| Type      | fix                                                                 |
| Baseline  | none ([FZ6](plans/decisions.md))                                    |
| Intake    | none — a status fix has no design input ([FZ6](plans/decisions.md)) |
| Branch    | `fix/cookie-consent-freeze`                                         |

## 2. Goal and scope

Freeze `change-cookie-consent-2026-10-13-fmal`, which merged to `main` at `done`
([FZ1](plans/decisions.md)). In scope: that iteration's Status row and one History line, through
`pnpm iteration:status`. Out of scope: every other file of that iteration, `launch-2026-09-30-jxmr`
([FZ2](plans/decisions.md)), and all code, schema, routes and documents.

## 3. ROUTE

| #   | Work item                                                            | Kind    | Depends on | Skill/driver            | Acceptance               | Assignee | Status |
| --- | -------------------------------------------------------------------- | ------- | ---------- | ----------------------- | ------------------------ | -------- | ------ |
| 1   | `pnpm iteration:status change-cookie-consent-2026-10-13-fmal frozen` | process | —          | `pnpm iteration:status` | § 4, the first two lines | Claude   | done   |

## 4. Definition of done

- The cookie-consent iteration reads `frozen`, with its History line `done → frozen`.
- `git diff origin/main -- iterations/change-cookie-consent-2026-10-13-fmal/` shows only that
  README's Status row and the new History line.
- This iteration reads `frozen` in the PR's last commit ([FZ5](plans/decisions.md)).

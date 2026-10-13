# Route changes — change-shell-polish-and-sign-in-2026-10-13-ojjp

The iteration's proposed routes, in one file (`be-iteration-planning` › Route changes). Mode
incremental (Baseline `launch-2026-09-30-jxmr`) · Intake hash `bc5d68b3628f` · 2026-10-13.

| Area | NEW | CHANGED | REMOVED |
| --- | --- | --- | --- |
| Auth (sign-in, MFA, the sign-in hand-off) | 0 | 0 | 0 |
| Clinic rooms (`/api/v1/app/*`) | 0 | 0 | 0 |
| **Total** | **0** | **0** | **0** |

**No route is added, changed or removed** ([D5](decisions.md), [D6](decisions.md)). The new sign-in
screen keeps calling the routes it calls today; `docs/routes.txt` is the truth and stays byte-for-byte
the same (`pnpm routes:catalog:check`).

## Auth — the routes the sign-in screen keeps using (KEPT)

| # | Change | Method | Path | Access | Operation | Source |
| --- | --- | --- | --- | --- | --- | --- |
| RC-1 | KEPT | POST | `/api/v1/auth/email/send-code` | public (captcha) | email code request | `docs/routes.txt` |
| RC-2 | KEPT | POST | `/api/v1/auth/email/login` | public (captcha) | email code sign-in | `docs/routes.txt` |
| RC-3 | KEPT | GET | `/api/v1/auth/oauth/providers` | public | the OAuth buttons shown | `docs/routes.txt` |
| RC-4 | KEPT | POST | `/api/v1/auth/mfa/login` | public (MFA ticket) | the MFA step | `docs/routes.txt` |
| RC-5 | KEPT | POST | `/api/v1/auth/refresh` | session cookie | the silent refresh before the shell | `docs/routes.txt` |
| RC-6 | KEPT | GET | `/api/v1/auth/me/context` | authenticated | the context the shell resolves | `docs/routes.txt` |

## Before → after

None — no route changes.

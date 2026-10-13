# Data

The diagrams live in [`db-changes.md`](../db-changes.md) — no table changes.

- `data.consent-receipt` — **CHANGED (meaning only).** The account keeps, on the person's settings,
  the last analytics answer they gave while signed in: the decision (`granted` / `denied`), the
  consent policy version it answered and when (the server's time) — null until first given, the
  three set together. It is a receipt: the browser's own answer (a cookie the frontend owns)
  decides what runs, and the backend neither stores nor reads that answer. Kept as long as the
  settings row (removed with the account); every decision is also an audit row, kept as audit rows
  are. Source: `BRIEF.md:27–32`, `:42–44`, `:108`. ([db-changes.md › `user_settings`](../db-changes.md#user_settings))

## Before → after

| Requirement | Before | After | Why |
| --- | --- | --- | --- |
| `data.consent-receipt` | the person's analytics consent, applied by the frontend at every sign-in and forgotten on the browser at sign-out | a receipt of the last answer given while signed in; never read back to drive the card; the browser's cookie decides | CC1, CC2 |

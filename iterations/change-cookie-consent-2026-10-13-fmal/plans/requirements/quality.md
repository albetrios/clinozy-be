# Quality

- `quality.proof-of-consent` — **CHANGED (wording).** Every analytics answer given while signed in
  is its own audit row with the decision, the policy version and the time — the proof of consent
  the DPDP Act puts on the business (§6(10)). The catalog says it records an answer given while
  signed in. Source: `BRIEF.md:42–44`, `:97`.
- `quality.receipt-errors-translated` — **EXISTING.** The one consent error (decision and version
  together) is a translation key in every backend locale. Unchanged. Source: `BRIEF.md:84`.
- `quality.no-server-consent-cookie` — **NEW (pinned).** The backend never sets, reads or clears
  the browser's consent cookie, and sign-out sends no `Clear-Site-Data`. Source: `BRIEF.md:27–32`.

## Before → after

| Requirement | Before | After | Why |
| --- | --- | --- | --- |
| `quality.proof-of-consent` | "the person answered or changed their analytics consent" | "the person gave an analytics answer while signed in — a receipt; the browser's cookie decides what runs" | CC1, CC2 |

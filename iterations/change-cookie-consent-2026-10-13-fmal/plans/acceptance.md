# change-cookie-consent-2026-10-13-fmal — acceptance

One row per acceptance criterion the backend owns (`intake-files/BRIEF.md`); the others are
clinozy-fe's ([CC5](decisions.md)). Result and Evidence are filled when built.

| Item | Source | Result | Evidence |
| --- | --- | --- | --- |
| A-1 Signing out leaves the account's consent receipt as it was, and the sign-out response clears no site data and sets no consent cookie | `BRIEF.md:100`, `:31` | | |
| A-2 Signed in, an answer is recorded with the policy version (version 2 included) and audited; a lone decision is refused | `BRIEF.md:97`, `:70` | | |
| A-3 The documented consent fields (OpenAPI, overview, audit catalog) describe a receipt, not the browser's answer; no route, table or migration changed | `BRIEF.md:100`, `:108` | | |

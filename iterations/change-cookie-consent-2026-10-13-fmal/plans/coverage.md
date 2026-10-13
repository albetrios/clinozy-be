# change-cookie-consent-2026-10-13-fmal — coverage

Iteration `change-cookie-consent-2026-10-13-fmal` · MODE incremental on `launch-2026-09-30-jxmr` ·
Intake mode `brief` · Intake hash `a8a0e5889cc1` · 2026-10-13.

## Coverage

Every item of `intake-files/BRIEF.md` (the change list in brief mode). The carried-forward `PRD.md`
and `schema-routes.md` are unchanged (`iteration:diff`: only `BRIEF.md` added) and are covered by
the Baseline.

| Source (file:line) | Item | Requirement | Feature | Acceptance | Status |
| --- | --- | --- | --- | --- | --- |
| `BRIEF.md:15` | The card's anatomy (title, paragraph, three buttons) | — | — | — | out-of-scope ([CC5](decisions.md)) |
| `BRIEF.md:21` | Customize in the same card | — | — | — | out-of-scope ([CC5](decisions.md)) |
| `BRIEF.md:25` | Escape rejects; non-modal | — | — | — | out-of-scope ([CC5](decisions.md)) |
| `BRIEF.md:27` | The answer lives in this browser (cookie) | `data.consent-receipt` | consent-receipt | A-3 | covered — the backend keeps no browser answer ([CC1](decisions.md)) |
| `BRIEF.md:31` | Signing out never asks again | `operations.sign-out-keeps-receipt` | consent-receipt | A-1 | covered |
| `BRIEF.md:33` | Privacy choices | — | — | — | out-of-scope ([CC5](decisions.md)) |
| `BRIEF.md:37` | Global Privacy Control | — | — | — | out-of-scope ([CC5](decisions.md)) |
| `BRIEF.md:40` | A refused category is cleaned up | — | — | — | out-of-scope ([CC5](decisions.md)) |
| `BRIEF.md:42` | The account keeps a receipt | `data.consent-receipt`, `operations.record-receipt`, `quality.proof-of-consent` | consent-receipt | A-2, A-3 | covered |
| `BRIEF.md:61` | `PATCH /users/me/settings` unchanged; `GET` no longer read for consent | `operations.record-receipt`, `operations.read-receipt` | consent-receipt | A-2, A-3 | covered |
| `BRIEF.md:66` | Nothing optional runs before a yes | — | — | — | out-of-scope ([CC5](decisions.md)) |
| `BRIEF.md:69` | Asked when no standing answer; policy version 2 | `operations.record-receipt` (versions 1–1000 accepted, unchanged) | consent-receipt | A-2 | covered |
| `BRIEF.md:72` | Everyone is asked | — | — | — | out-of-scope ([CC5](decisions.md)) |
| `BRIEF.md:74` | Reject never harder than Accept | — | — | — | out-of-scope ([CC5](decisions.md)) |
| `BRIEF.md:75` | Escape is Reject all | — | — | — | out-of-scope ([CC5](decisions.md)) |
| `BRIEF.md:76` | GPC is Reject all | — | — | — | out-of-scope ([CC5](decisions.md)) |
| `BRIEF.md:78` | Signed in → sent with the version; signed out → nothing; sign-in/out never change the answer | `operations.record-receipt`, `operations.sign-out-keeps-receipt`, `access.own-settings-only` | consent-receipt | A-1, A-2 | covered ([CC3](decisions.md)) |
| `BRIEF.md:80` | Another tab follows | — | — | — | out-of-scope ([CC5](decisions.md)) |
| `BRIEF.md:81` | Placement | — | — | — | out-of-scope ([CC5](decisions.md)) |
| `BRIEF.md:84` | Every string a translation key | `quality.receipt-errors-translated` (the one backend message, unchanged) | consent-receipt | A-2 | covered |
| `BRIEF.md:97` | Acceptance: signed in, the answer is sent with the version and audited | `operations.record-receipt`, `quality.proof-of-consent` | consent-receipt | A-2 | covered |
| `BRIEF.md:100` | Acceptance: sign-out leaves the receipt; the documented fields describe a receipt | `operations.sign-out-keeps-receipt`, `data.consent-receipt` | consent-receipt | A-1, A-3 | covered |
| `BRIEF.md:88–99` | The other acceptance criteria (the card, Customize, Escape, GPC, placement) | — | — | — | out-of-scope ([CC5](decisions.md)) |
| `BRIEF.md:104` | No Marketing category | — | — | — | out-of-scope (BRIEF › Out of scope) |
| `BRIEF.md:105` | No region check | — | — | — | out-of-scope (BRIEF › Out of scope) |
| `BRIEF.md:106` | No consent log for signed-out visitors | — | — | — | out-of-scope (BRIEF › Out of scope) |
| `BRIEF.md:107` | No Cookie Policy page | — | — | — | out-of-scope (BRIEF › Out of scope) |
| `BRIEF.md:108` | No change to the settings API shape or database | `data.consent-receipt` | consent-receipt | A-3 | covered ([CC2](decisions.md)) |

## Reconciliation

Brief mode: there is no new design source. `BRIEF.md` is reconciled against the carried-forward
`PRD.md` / `schema-routes.md` and the current code.

| # | Item | PRD says (file:line) | schema-routes says (file:line) | Verdict | Action |
| --- | --- | --- | --- | --- | --- |
| R1 | Analytics consent | nothing — the PRD has no cookie consent (it is a platform surface; `PRD.md` consent lines are a patient's treatment consent, `PRD.md:64`, `:134`) | nothing — `consentGiven` is the patient's (`schema-routes.md:309`, `:1623`) | no conflict: the brief is the only source; the patient's consent is a different thing and is untouched | none |
| R2 | The account's consent record | — | — | the code today (`user-settings.schema.ts:33–35`, `user.controller.ts:58–83`) already keeps exactly what `BRIEF.md:42–44` asks for | keep ([CC2](decisions.md)) |
| R3 | Who reads the record | — | — | today the frontend reads it at sign-in (`clinozy-fe` `consent-account-sync.ts`); `BRIEF.md:44` says it is never read back | backend unchanged; the frontend stops reading ([CC1](decisions.md)) |

## Delta

MODE incremental, Intake mode `brief`. `pnpm iteration:diff launch-2026-09-30-jxmr
change-cookie-consent-2026-10-13-fmal`: **files + added (1): `BRIEF.md`**; screens, `PRD.md`,
`schema-routes.md` and the prototype unchanged; no entity, field, enum, route or operation changed —
nothing else changed, as brief mode requires. No finding.

| Kind | Name | Added / changed / removed | Planned in |
| --- | --- | --- | --- |
| Entity | — | none | — |
| Field | `user_settings.analytics_consent*` | unchanged in shape; meaning documented as a receipt | `db-changes.md` |
| Route | `GET`, `PATCH /users/me/settings` | unchanged in shape; documentation changed | `route-changes.md` RC-1, RC-2 |
| Route | `POST /auth/logout` | unchanged; pinned by a test | `route-changes.md` RC-3 |
| Background work | — | none | `worker-changes.md` |

**The Baseline's Standing deviations this change touches:** none of the backend's list names
consent (`launch-2026-09-30-jxmr/AS-BUILT.md` › Standing deviations); D85 is a decision, not a
deviation from the drop. See `KICKOFF.md` § 8.

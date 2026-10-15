# feat-payment-celebration-2026-10-15-xpkw — coverage

Iteration `feat-payment-celebration-2026-10-15-xpkw` · MODE initial (Baseline `none`, [PC1](decisions.md)) ·
Intake mode `full` · Intake hash `992289e86d52` · 2026-10-15.

## Coverage

Every item of the three intake files. `BRIEF.md` is the whole change, screen by screen (identical in
clinozy-fe); `PRD.md` and `schema-routes.md` state what clinozy-be provides and relies on. The
frontend-only items are clinozy-fe's ([PC3](decisions.md)).

| Source (file:line) | Item | Requirement | Feature | Acceptance | Status |
| --- | --- | --- | --- | --- | --- |
| `BRIEF.md:7` | The Receive payment drawer turns into a Payment received view | — | — | — | out-of-scope ([PC3](decisions.md)) — calls `POST /app/payments`, unchanged |
| `BRIEF.md:16` | The same view after "Paid now" and "Got it back" | — | — | — | out-of-scope ([PC3](decisions.md)) — calls `POST /app/invoices`, `POST /app/pending-credits/{pending_credit_id}/settle`, unchanged |
| `BRIEF.md:18` | The Lottie animation | — | — | — | out-of-scope ([PC3](decisions.md)) |
| `BRIEF.md:27` | The patient's reviews and the ask (Send on WhatsApp, Log a review, previous reviews) | — | — | — | out-of-scope ([PC3](decisions.md)) — reads `GET /app/patients/{patient_id}/reviews`, writes `POST /app/patients/{patient_id}/reviews` and `POST /app/contacts/{contact_id}/activities/send-message`, all unchanged |
| `BRIEF.md:29` | Send on WhatsApp carries the payment branch's Google review link | `operations.read-branch-review-link` | branch-review-link | A-1 | covered — the link comes from `/my` |
| `BRIEF.md:38` | The Branch drawer edits the Google review link (https only), through the branch API that already stores it | `data.branch-review-link`, `operations.edit-branch-review-link` | branch-review-link | A-2 | covered — `PATCH /app/branches/{branch_id}` unchanged |
| `BRIEF.md:39` | Every member reads it with their branches: `GET /app/branches/my` returns `review_link` | `operations.read-branch-review-link`, `access.every-member-reads-review-link` | branch-review-link | A-1 | covered |
| `BRIEF.md:41` | The chat composer's Review template fills it | `operations.read-branch-review-link` | branch-review-link | A-1 | covered — the frontend fills the template from `/my` ([PC3](decisions.md)) |
| `BRIEF.md:41` | No link on the branch → Send on WhatsApp is off and says so | `data.branch-review-link` (`null` when unset) | branch-review-link | A-1, A-3 | covered — `review_link: null`; the screen is clinozy-fe's |
| `BRIEF.md:47` | Bottom sheets move as the picker sheet | — | — | — | out-of-scope ([PC3](decisions.md)) |
| `BRIEF.md:51` | A room's own header stays still | — | — | — | out-of-scope ([PC3](decisions.md)) |
| `BRIEF.md:56` | Smooth scrolling only with motion allowed | — | — | — | out-of-scope ([PC3](decisions.md)) |
| `BRIEF.md:58` | One switch | — | — | — | out-of-scope ([PC3](decisions.md)) |
| `BRIEF.md:61` | One progress bar | — | — | — | out-of-scope ([PC3](decisions.md)) |
| `BRIEF.md:63` | The cookie banner's motion | — | — | — | out-of-scope ([PC3](decisions.md)) |
| `BRIEF.md:64` | Every record drawer checked against the system | — | — | — | out-of-scope ([PC3](decisions.md)) |
| `BRIEF.md:69` | Why | — | — | — | covered (context — nothing to build) |
| `BRIEF.md:78` | Affected screens | — | — | — | out-of-scope ([PC3](decisions.md)) |
| `BRIEF.md:83` | Entities: Branch (`review_link` read by every member); Payment, Invoice, Pending credit, Patient review, Contact activity read only | `data.branch-review-link` | branch-review-link | A-1 | covered (Branch); the others unchanged |
| `BRIEF.md:85` | Routes: `/my` gains `review_link`; the rest existing, no new route | `operations.read-branch-review-link`, `quality.additive-on-v1` | branch-review-link | A-1, A-2 | covered |
| `BRIEF.md:92` | The view follows a new payment taken from someone | — | — | — | out-of-scope ([PC3](decisions.md)) |
| `BRIEF.md:94` | The review part needs `patient:read`; Log a review `patient_review:create`; Send on WhatsApp the right to message the contact **and a review link on the payment's branch** | `access.every-member-reads-review-link` | branch-review-link | A-1 | covered (the link); the permissions are existing and unchanged |
| `BRIEF.md:97` | "Reviewed on Google" = a live review with source `google` | — | — | — | out-of-scope ([PC3](decisions.md)) — `GET /app/patients/{patient_id}/reviews` returns `source`, unchanged |
| `BRIEF.md:98` | A message is queued in the outbox, never "sent" | — | — | — | out-of-scope ([PC3](decisions.md)) — `send-message` already queues |
| `BRIEF.md:100` | Motion rules | — | — | — | out-of-scope ([PC3](decisions.md)) |
| `BRIEF.md:103` | No `eval`; dynamic import | — | — | — | out-of-scope ([PC3](decisions.md)) |
| `BRIEF.md:105` | `review_link` on `/my` is additive — same major, no route added | `quality.additive-on-v1` | branch-review-link | A-2 | covered |
| `BRIEF.md:106` | Every new string translated | `quality.no-new-message` | branch-review-link | A-2 | covered — the backend adds no message |
| `BRIEF.md:110–120` | Acceptance: the view, the animation, the review ask, Send on WhatsApp | — | — | — | out-of-scope ([PC3](decisions.md)) |
| `BRIEF.md:121` | Acceptance: the Branch drawer edits the link; `GET /app/branches/my` returns `review_link`; the Review template fills it | `operations.read-branch-review-link`, `operations.edit-branch-review-link` | branch-review-link | A-1, A-2 | covered (the backend half) |
| `BRIEF.md:123–128` | Acceptance: the motion pass | — | — | — | out-of-scope ([PC3](decisions.md)) |
| `BRIEF.md:132` | Out of scope: recording the ask, delivering messages | — | — | — | out-of-scope (BRIEF › Out of scope) |
| `BRIEF.md:134` | Out of scope: the medical sale's Collect, Send payment, Day close | — | — | — | out-of-scope (BRIEF › Out of scope) |
| `BRIEF.md:136` | Out of scope: drawer exit animations, new review sources, review analytics | — | — | — | out-of-scope (BRIEF › Out of scope) |
| `PRD.md:8` | Problem | — | — | — | covered (context — nothing to build) |
| `PRD.md:16` | Users: anyone with `payment:create`; the review part `patient:read`; logging `patient_review:create` | `access.every-member-reads-review-link` | branch-review-link | A-1 | covered — the link needs no more than `organization:read` |
| `PRD.md:21` | Every member reads their branch's Google review link on `/my` | `data.branch-review-link`, `operations.read-branch-review-link`, `access.every-member-reads-review-link` | branch-review-link | A-1 | covered |
| `PRD.md:24` | `GET /app/branches`, `GET /app/branches/{branch_id}` already return it; `POST` / `PATCH` already store it | `operations.edit-branch-review-link` | branch-review-link | A-2 | covered — unchanged |
| `PRD.md:26` | Everything else already exists (payments, invoices, settle, reviews, send-message) | — | — | — | covered — existing, unchanged; listed in [`route-changes.md`](route-changes.md) › Relied on |
| `PRD.md:37` | Additive only: one field, same major, no new route, no migration | `quality.additive-on-v1` | branch-review-link | A-2 | covered |
| `PRD.md:39` | The OpenAPI document, the route examples and the tests follow the response | `quality.documented-and-tested` | branch-review-link | A-2 | covered |
| `PRD.md:43` | Out of scope: recording the ask, delivery, a review summary on patient or payment responses | — | — | — | out-of-scope (PRD › Out of scope) |
| `schema-routes.md:8` | Entity Branch — `review_link` varchar(512), `https://` only, null when unset; no migration | `data.branch-review-link` | branch-review-link | A-1, A-2 | covered |
| `schema-routes.md:16` | Read, not changed: Payment, Patient review, Contact activity | — | — | — | covered — existing, unchanged |
| `schema-routes.md:27` | `GET /api/v1/app/branches/my` — each branch gains `review_link: string \| null` | `operations.read-branch-review-link` | branch-review-link | A-1 | covered |
| `schema-routes.md:28` | `PATCH /api/v1/app/branches/{branch_id}` — none | `operations.edit-branch-review-link` | branch-review-link | A-2 | covered — unchanged |
| `schema-routes.md:29–34` | Six routes relied on, none changed | — | — | — | covered — existing, unchanged ([`route-changes.md`](route-changes.md) › Relied on) |
| `BRIEF.md:41–43` | Both states — a branch with a link, a branch without — can be seen on the demo clinic | `data.demo-clinic-review-link` | branch-review-link | A-3 | covered ([PC7](decisions.md)) |

## Reconciliation

| # | Item | PRD says (file:line) | schema-routes says (file:line) | Verdict | Action |
| --- | --- | --- | --- | --- | --- |
| R1 | `review_link` on `/my` | each branch returns it, `https://` only, null when unset (`PRD.md:21–25`) | `review_link: string \| null`, additive (`schema-routes.md:12`, `:27`) | agree; `BRIEF.md:39–41`, `:105` say the same | build it ([PC4](decisions.md), [PC6](decisions.md)) |
| R2 | Who reads it | every member, `organization:read` (`PRD.md:21–22`) | "what changes is who can read it" (`schema-routes.md:14`) | agree; the code today gives it only to `branch:read` (`branches.serializer.ts` `BranchSummaryRecord` has no `review_link`) | build it ([PC4](decisions.md)) |
| R3 | The relied-on routes | exist (`PRD.md:26–33`) | `none` change (`schema-routes.md:28–34`) | agree; all seven are in `docs/routes.txt` today with the gates `BRIEF.md:94–96` names | none |
| R4 | Storage | no migration, the column exists (`PRD.md:37–38`) | varchar(512), unchanged table (`schema-routes.md:8–14`) | agree; `app.branches.review_link` varchar(512) with `chk_branches_review_link` (`^https://`) exists | none |

## Delta

n/a — MODE initial (Baseline `none`, [PC1](decisions.md)). Against the code on `main` (`9ed7f2a`):

| Kind | Name | Added / changed / removed | Planned in |
| --- | --- | --- | --- |
| Entity | `branch` (`app.branches`) | unchanged | [`db-changes.md`](db-changes.md) |
| Field | `review_link` on the branch summary (`/my`) | added to the response | [`route-changes.md`](route-changes.md) RC-1 |
| Route | `GET /api/v1/app/branches/my` | changed (output, additive) | [`route-changes.md`](route-changes.md) RC-1 |
| Background work | — | none | [`worker-changes.md`](worker-changes.md) |

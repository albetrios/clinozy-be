# feat-bill-line-description-2026-10-31-rjxx — decisions

Add-only. A changed mind is a new row that supersedes an old one. Kind: `RED` (answered by the
user), `AMBER` (safe default, still open), `SCOPE` (a scope decision during implementation).

The user answered the opening and design questions before this session started (process
"straight through"; branch `feat/bill-line-description`; maximum length 280; Baseline none).

| Question | Options | Decision | Date | Who | Kind |
| --- | --- | --- | --- | --- | --- |
| **BD1** — Maximum length of a line's description | 120 · 280 · 500 | **280** — the longest Cresence line description fits; one printed line block under the name | 2026-10-31 | Nikunj Mavani | RED |
| **BD2** — Process and branch | full iteration · lite | **Full `feat` iteration, straight through, both repositories**, on `feat/bill-line-description` in each | 2026-10-31 | Nikunj Mavani | RED |
| **BD3** — Column type and storage | `varchar(280)` · `text` + CHECK | **`varchar(280)` NULL**, after `name` — matches `name varchar(120)`, `pack_size varchar(30)`, `batch_number varchar(20)` on the same table; nullable ADD COLUMN, no rewrite, no default, no index (never filtered or sorted) | 2026-10-31 | Claude (be-sql-design-guard default) | AMBER |
| **BD4** — Write semantics | always sent · keep when omitted | **Omitted keeps, `null` clears, text replaces** — the same rule `batch_number` follows on a kept line (B12); a new line without it stores `null`. Validation: trimmed, 1–280 (`trimmedStringMinMax`), so an empty string is a 400 — send `null` to clear | 2026-10-31 | Claude (reuse of the batch_number rule) | AMBER |
| **BD5** — Medical sales | accept on `POST /app/medical-sales` too · return only | **Return only.** Medical sale lines show the description; the sale write keeps its medicine-only line shape (the bill's PATCH can add one). Keeps the purchase-order sessions' medical area untouched | 2026-10-31 | Claude | AMBER |
| **BD6** — Credit-note lines | add a description · leave | **Leave** — a credit note line names the bill line it reverses; out of scope (BRIEF) | 2026-10-31 | Claude | AMBER |
| **BD7** — Frontend repository access | push to clinozy-fe · plan only | The session could not attach clinozy-fe for push (the add-repository call was refused). The frontend half is built locally on `feat/bill-line-description` if possible and reported; it ships when the user grants access | 2026-10-31 | Claude | AMBER |
| **BD8** — Route review, sub-domain 1 (`app/sub-domains/billing/invoices` + medical-sales lines) | confirm · change | **Confirmed, final (rev 1)** — `routes-final.md` § 1: no route added or removed; four writes take `items[].description`, every line-listing response returns it | 2026-10-31 | Claude (under the user's straight-through answer) | RED |
| **BD10** — Medical sales, again (supersedes BD5) | accept on `POST /app/medical-sales` · return only | **Accept it** on each sale item (1–280, nullable), carried onto every line its batches draw. Found while building: a sale's bill is locked (`PATCH /app/invoices/{id}` → `409 invoice_of_sale`), so "add it by changing the bill" (BD5) cannot happen and a return-only field would stay empty. Same validation as the bill line; no other medical file changes | 2026-10-31 | Claude | AMBER |
| **BD9** — Approval of `KICKOFF.md` and `plans/` | approve · back to planning | **Approved** — straight-through process | 2026-10-31 | Nikunj Mavani (standing answer) · Claude | RED |

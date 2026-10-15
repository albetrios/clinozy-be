# Clinozy API — final routes, sub-domain by sub-domain (feat-payment-celebration-2026-10-15-xpkw)

Started from `9ed7f2a` (= `main`) on branch `feat/payment-celebration` ([PC2](decisions.md)). Shaped by
[`routes-final-template.md`](../../../docs/design-workflow/process/routes-final-template.md).

**How to read the tables:** paths are under `/api/v1/app`; `{x_id}` is a public id; **Gate** is the
permission the caller needs; **Idem** `req` = `X-Idempotency-Key` required; `*` = required.

## Sub-domains (in build order)

| # | Sub-domain | Folder (`src/domains/app/sub-domains/…`) | Paths (`/app/…`) | Routes | Builds on | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Branches — the review link for every member | `branches/` (folder root) | `branches/my` (+ `branches`, `branches/{branch_id}`, unchanged) | 1 changed, 4 unchanged, 0 new | tenancy (memberships, `organization:read`) | **final (rev 1, confirmed 2026-10-15)** — [PC8](decisions.md) |

App total: **0 routes added, 0 removed, 1 reshaped** — `GET /branches/my` gains `review_link`
(additive); `docs/routes.txt` keeps its count.

## Code layout and tables without routes

| Sub-domain | Table | Lives in | Written by |
| --- | --- | --- | --- |
| 1 | `app.branches` (unchanged) | `branches/` | `POST /branches`, `PATCH /branches/{branch_id}` (the Branch drawer), the seeds |

No table without routes is touched; the nested sub-domains (`branch-members/`, `branch-rooms/`,
`branch-machines/`, `branch-holidays/`) are unchanged.

## Rules for every sub-domain

| # | Rule |
| --- | --- |
| K1 | Additive on `v1`: a response gains a field; nothing is removed, renamed or re-gated ([PC6](decisions.md)). |
| K2 | `/my` stays a typed allow-list: a field reaches every member only when a screen every member uses needs it ([PC5](decisions.md)). |

## Connections

```text
1) WHO WRITES WHAT, WHO READS IT

   Branch drawer (branch:update) ── PATCH /branches/{branch_id} { review_link } ──► app.branches.review_link
                                                                                    │
   every member (organization:read) ◄── GET /branches/my ── each branch: … review_link ┘
          │
          └─ Payment received view: payment.branch_id → that branch's review_link
                 └─ Send on WhatsApp ─► POST /contacts/{contact_id}/activities/send-message (queued, unchanged)

2) WHAT ONE ACTION SETS OFF

   saving a review link ──► the branch row (and its audit row app.branch.update), as today
   reading /my ───────────► nothing — a read
```

---

## 1. Branches — the review link for every member — final (rev 1, confirmed 2026-10-15)

Code: `src/domains/app/sub-domains/branches/` (folder root). Reads `intake-files/PRD.md:21–25`,
`schema-routes.md:8–14`, `:27–28` and `BRIEF.md:38–43`, `:105`; the launch's route review § 1.A and its
D81 (7) (the address fields `/my` carries today).

1.1 Decisions · 1.2 Open questions · 1.3 Tables and relations · 1.4 Permissions · 1.5 Common to
every route · 1.6 Objects returned · 1.7 Routes · 1.8 Request details · 1.9 Errors · 1.10 Rules
worth knowing · 1.11 Code changes · 1.12 Nested sub-domains.

### 1.1 Decisions (whole sub-domain)

Taken under the user's approval of the design ([PC9](decisions.md)).

| # | Decision |
| --- | --- |
| BR1 | **Every member reads the review link through `/my`.** Today only a `branch:read` holder reads it (`GET /branches`, `GET /branches/{branch_id}`); `/my`'s summary (`BranchSummaryRecord`, `branchSummaryColumns`) leaves it out. After: `/my` returns it on each branch ([PC4](decisions.md)). Other option: open `GET /branches/{branch_id}` to `organization:read` — it would also show the branch's email, default staff and audit times to every member. |
| BR2 | **Only `review_link`.** Today `/my` returns `id`, `name`, `tone`, `is_main`, the address, `phone`, `gst_number`, `opens_at`, `closes_at`, `working_days` (launch D81 (7)). After: those and `review_link`; `maps_link`, `email`, the default staff, `is_active` and the timestamps stay out ([PC5](decisions.md)). Other option: add `maps_link` too — no screen asks for it. |
| BR3 | **The stored value, as it is.** `review_link` is `https://…` or `null` (never an empty string): the branch DTO's link rule refuses anything but an `https://` address of at most 512 characters, and `chk_branches_review_link` holds it in the table — both unchanged ([PC6](decisions.md)). |
| BR4 | **Additive on `v1`.** No new major, no new route; the field comes after `working_days` in the summary, so the order of the fields every client already reads does not move ([PC6](decisions.md)). |
| BR5 | **Demo data.** The demo clinic's main branch carries a Google review link (`https://g.page/r/…/review`); its second branch has none ([PC7](decisions.md)). The bulk and minimal seeds keep no link. |

### 1.2 Open questions

None.

### 1.3 Tables and relations

| Table | Holds | Key rules |
| --- | --- | --- |
| `app.branches` | one clinic location (unchanged) | `review_link` varchar(512), `chk_branches_review_link` (`^https://`); RLS `branches_tenant_isolation` on the organization GUC |
| `app.branch_members` | who works in which branch (unchanged) | decides which branches `/my` returns to a member without `branch:read` |

```text
tenancy.organizations ──o{ app.branches ──o{ app.branch_members ──}o tenancy.memberships
                             └ review_link   (read by every member through /my from now on)
```

**PostgreSQL design:** no change — no migration.

### 1.4 Permissions

| Code | Allows | Routes (1.7) | Held by default |
| --- | --- | --- | --- |
| `organization:read` | my branches, with the review link | 1 | every role |
| `branch:read` | every branch, full details | 2, 3 | Owner, Admin |
| `branch:create` | create a branch (`review_link` optional) | 4 | Owner, Admin |
| `branch:update` | change a branch, its review link included | 5 | Owner, Admin |

No code is added or moved.

### 1.5 Common to every route

| Item | Value |
| --- | --- |
| Base | `/api/v1/app` |
| Auth | `Authorization: Bearer <access token>`; the active organization from the token's `org` claim |
| Success | `200` with `{ data, meta }` |
| Errors | `{ error: { type, code, reason?, detail, errors[] } }` — as today |

### 1.6 Objects returned

**Branch summary** — route 1 (`/branches/my`)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | `brn_…` |
| `name`, `tone`, `is_main` | string, string, boolean | |
| `address_line_one`, `address_line_two`, `area`, `city`, `state`, `postal_code` | string (`address_line_two` nullable) | a printed bill's header (D81 (7)) |
| `phone`, `gst_number` | string, string \| null | |
| `opens_at`, `closes_at` | string `HH:mm` | |
| `working_days` | string[] | `mon` … `sun` |
| **`review_link`** | **string \| null** | **new — the branch's Google review link, `https://…`; `null` when not set (BR1–BR4)** |

**Branch** — routes 2–5: unchanged (it already carries `review_link`).

### 1.7 Routes

| # | Method | Path | Purpose | Gate | Idem |
| --- | --- | --- | --- | --- | --- |
| 1 | GET | `/branches/my` | My branches — now with each one's review link **(changed: output)** | any member (`organization:read`) | |
| 2 | GET | `/branches` | Every branch, full details **(unchanged)** | `branch:read` | |
| 3 | GET | `/branches/{branch_id}` | One branch **(unchanged)** | `branch:read` | |
| 4 | POST | `/branches` | Create a branch **(unchanged)** | `branch:create` | req |
| 5 | PATCH | `/branches/{branch_id}` | Change a branch — the Branch drawer saves `review_link` here **(unchanged)** | `branch:update` | |

### 1.8 Request details

| # | Query | Body | Response |
| --- | --- | --- | --- |
| 1 | — | — | Branch summary[] — active only, main first, then by name; not paginated (unchanged), each with `review_link` |
| 5 | — | any branch field, `review_link` included (`https://…`, ≤ 512, or `null` to clear), `expected_updated_at` | Branch (unchanged) |

### 1.9 Errors

No new error. Route 1 answers `401` / `403` as today; route 5's `400` on `review_link` (not an
`https://` address, or over 512 characters) is unchanged.

### 1.10 Rules worth knowing

- The link a payment's view uses is the one on the payment's branch (`branch_id` on the payment),
  looked up in the caller's `/my` list — the branches the caller works in, or every active branch
  for a `branch:read` holder.
- A branch with no link reads `review_link: null`; the frontend turns the WhatsApp ask off then
  (`BRIEF.md:41–43`).

### 1.11 Code changes (whole sub-domain)

| # | Change |
| --- | --- |
| BRC1 | BR1–BR4: the repository's summary columns (`branchSummaryColumns`) and the serializer's summary (`BranchSummaryRecord`, `serializeSummary`) gain `review_link`, after `working_days`; their TSDoc says so |
| BRC2 | BR1, BR4: the documentation follows — the `GET /branches/my` route description; the OpenAPI response map (`branchSummarySchema` with the field's description, `branchSummaryExample`); the captured route example for `/my`; `branches.overview.md` (the `/my` row and the repository line) |
| BRC3 | BR1–BR3: tests — the branches integration suite's `/my` field list gains `review_link`, and a new case reads it as a member without `branch:read`: `null` before the branch has one, the saved link after `PATCH`; a serializer unit test pins the summary's allow-list |
| BRC4 | BR5: the demo clinic's plan gives its main branch a Google review link and its second none; the demo clinic's write passes it to `seedBranch`; the plan's unit test and the seed's integration test check both; `docs/getting-started/seeded-fixtures.md` says so |

### 1.12 Nested sub-domains

None touched.

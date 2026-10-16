Status: ready
Kind: flow
Depends on: none

## Stories

- As front desk taking a payment I want my branch's Google review link with my branches so that
  the Payment received view can send the patient the Review message with the link.
- As a clinic owner I want the review link I save on a branch to reach every member's screen so
  that the WhatsApp ask and the chat's Review template always carry it.

## Rules

- Every member reads the link of the branches they work in, with the rest of their branch list (`access.every-member-reads-review-link`, `operations.read-branch-review-link`).
- A branch without a link reads `null` (`data.branch-review-link`).
- Only those who may change a branch set or clear it, `https://` only (`operations.edit-branch-review-link`).
- Additive: nothing else in the list moves; no route, no migration (`quality.additive-on-v1`); documented and tested (`quality.documented-and-tested`); no new message (`quality.no-new-message`).
- The demo clinic shows both states (`data.demo-clinic-review-link`).

## Acceptance criteria

- `GET /app/branches/my` returns `review_link` on each branch, to every member — `intake-files/PRD.md:21`, `intake-files/BRIEF.md:121`
- With no link on the branch it is `null` — `intake-files/schema-routes.md:12`, `intake-files/BRIEF.md:41`
- Additive and documented: no new route, no migration; OpenAPI, the route example and the tests follow — `intake-files/BRIEF.md:105`, `intake-files/PRD.md:37`, `intake-files/PRD.md:39`
- The demo clinic's main branch has a link and its second branch none — `intake-files/BRIEF.md:41`

## Work items

- `data.branch-review-link`, `data.demo-clinic-review-link`, `access.every-member-reads-review-link`,
  `operations.read-branch-review-link`, `operations.edit-branch-review-link`,
  `quality.additive-on-v1`, `quality.documented-and-tested`, `quality.no-new-message`

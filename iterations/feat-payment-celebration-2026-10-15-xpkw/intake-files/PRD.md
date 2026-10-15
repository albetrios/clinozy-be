# PRD — Payment received: the celebration and the review ask

The full change, screen by screen, is `BRIEF.md` (identical in clinozy-fe). This PRD states what
clinozy-be must provide for it.

## Problem

Taking a payment ends a good visit and is the best moment to ask the patient for a Google review.
The app shows the moment as a toast and asks for reviews only in a task two days later. The
frontend will turn a payment received into a view that celebrates it, lists the patient's previous
reviews and offers a one-tap ask: a WhatsApp message carrying the branch's Google review link, or a
review logged at the desk.

## Users

Front desk, counsellors and anyone who takes payments (`payment:create`); the review part needs
`patient:read`, logging a review `patient_review:create`.

## What clinozy-be provides

1. **Every member reads their branch's Google review link.** `GET /app/branches/my` — the branch
   list every member reads (`organization:read`) — returns `review_link` (the existing
   `app.branches.review_link`, `https://` only, null when unset) next to the fields it returns
   today. `GET /app/branches` and `GET /app/branches/{branch_id}` (`branch:read`) already return
   it, and `POST` / `PATCH /app/branches` already store it.
2. **Everything else already exists** and is only read or called by the frontend:
   - `POST /app/payments`, `POST /app/invoices` (Paid now), `POST /app/pending-credits/{pending_credit_id}/settle`
     — their responses carry the payer's contact and `patient_id`.
   - `GET /app/patients/{patient_id}/reviews` — the patient's reviews (source, rating, date,
     text, `needs_action`).
   - `POST /app/patients/{patient_id}/reviews` — a review logged at the desk.
   - `POST /app/contacts/{contact_id}/activities/send-message` — the WhatsApp message, queued in
     the outbox.

## Constraints

- Additive only: one field on an existing response, the same major version, no new route, no
  migration (the column exists).
- The OpenAPI document, the route examples and the tests follow the response.

## Out of scope

Recording that a review was asked for, delivering WhatsApp messages, a review summary on the
patient or payment responses.

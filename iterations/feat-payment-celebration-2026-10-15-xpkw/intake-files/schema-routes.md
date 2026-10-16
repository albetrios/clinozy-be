# Schema and routes — feat-payment-celebration

Only what this iteration changes or relies on. Column and field names are the database's and the
wire's.

## Entities

### Branch (`app.branches`) — unchanged table

| Column        | Type           | Notes                                                    |
| ------------- | -------------- | -------------------------------------------------------- |
| `review_link` | varchar(512)   | Google review link; `https://` only; null when not set   |

No migration: the column exists. What changes is who can read it.

### Read, not changed

- Payment (`app.payments`) — `contact`, `patient_id` on the create response.
- Patient review (`app.patient_reviews`) — `source` (`google`, `video`, `instagram`,
  `internal_form`, `whatsapp`), `rating` 1–5, `text`, `review_date`, `needs_action`.
- Contact activity (`app.contact_activities`) — a `whatsapp` message, `queued`.

## Routes

| Method | Path                                                     | Change                                                                 |
| ------ | -------------------------------------------------------- | ---------------------------------------------------------------------- |
| GET    | `/api/v1/app/branches/my`                                | each branch gains `review_link: string \| null` (additive)             |
| PATCH  | `/api/v1/app/branches/{branch_id}`                       | none — already accepts and returns `review_link`                       |
| GET    | `/api/v1/app/patients/{patient_id}/reviews`              | none — read by the payment received view                               |
| POST   | `/api/v1/app/patients/{patient_id}/reviews`              | none — "Log a review"                                                  |
| POST   | `/api/v1/app/contacts/{contact_id}/activities/send-message` | none — "Send on WhatsApp", the Review message with the link        |
| POST   | `/api/v1/app/payments`                                   | none — the receipt that opens the view                                 |
| POST   | `/api/v1/app/invoices`                                   | none — an invoice with Paid now                                        |
| POST   | `/api/v1/app/pending-credits/{pending_credit_id}/settle` | none — a credit got back                                               |

# Flow 3 — treatment plan and feedback

Status: ready
Kind: flow
Depends on: patient-file, payments-and-invoices, tasks

## Stories

- As a Counsellor and Doctor we want the plan to turn into an invoice and feedback into action so that care continues after the visit.

## Rules

- A worse check-in creates a doctor call-back task (`operations.feedback`)

## Acceptance criteria

- **flow-plan-and-feedback.1** A planned package is invoiced (the row turns Invoiced), an aftercare task appears the next day, and a worse check-in shows Action needed with a doctor call-back task — intake-files/PRD.md:123–125

## Work items

- `operations.patient-file`
- `operations.invoices`
- `operations.feedback`
- `operations.tasks`

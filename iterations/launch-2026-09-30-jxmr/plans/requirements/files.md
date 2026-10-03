# Files — launch-2026-09-30-jxmr

Status: ready — planning Step 5. Answers: uploads, images, prints, exports. Requirements state WHAT must be true; the
technical design is decided per ROUTE row at kickoff and recorded in `AS-BUILT.md` (agent-os decides).

| Requirement | Change | What must be true | Source | Features |
| --- | --- | --- | --- | --- |
| `files.upload-limits` | CHANGED | Photos up to 15 MB, review videos up to 100 MB, documents up to 10 MB | P14, D3 | [patient-file](../features/patient-file/story.md) |
| `files.patient-photos` | NEW | Photos sit in albums (General, Private, LHR) with an editable display name; location data is removed and before photos pair with their after photos | PRD.md:138; P45, D40; WC-42, WC-43 | [patient-file](../features/patient-file/story.md) |
| `files.reports` | NEW | Lab and other reports are attached to the patient | schema-routes.md:440–452 | [patient-file](../features/patient-file/story.md) |
| `files.review-videos` | NEW | Review videos are attached to reviews | patient-file.md:196 | [patient-file](../features/patient-file/story.md) |
| `files.payment-attachments` | NEW | A payment can carry attachments (a bill, a receipt) | payments.md:124; D3 | [payments-and-invoices](../features/payments-and-invoices/story.md) |
| `files.prints` | NEW | Prescriptions (in English, Gujarati or Hindi), invoices and sales have what their A4 prints need | PRD.md:225; D40 | [patient-file](../features/patient-file/story.md) |
| `files.exports` | NEW | Holders of "Export lists" download a list; leads can be exported in bulk | D18; schema-routes.md:1596 | [shell-and-patterns](../features/shell-and-patterns/story.md) |

## Before → after

| Requirement | Before | After | Why |
| --- | --- | --- | --- |
| `files.upload-limits` | every upload is capped at 10 MB | photos 15 MB, review videos 100 MB, documents 10 MB | P14, D3 |

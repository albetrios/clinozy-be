# Integrations — launch-2026-09-30-jxmr

Status: ready — planning Step 5. Answers: outside systems — messaging, AI, mail, storage. Requirements state WHAT must be true; the
technical design is decided per ROUTE row at kickoff and recorded in `AS-BUILT.md` (agent-os decides).

Mail: staff invitations keep using the platform's existing mail service (no change); patients get no
email at launch (D33). Storage: uploads use the platform's existing upload capability (C10). Payments:
no payment gateway — clinic payments are recorded, not processed (PRD.md:88).

| Requirement | Change | What must be true | Source | Features |
| --- | --- | --- | --- | --- |
| `integrations.whatsapp-business` | NEW | Messages, replies and delivery reports go through the WhatsApp Business API on the clinic's verified number; an outage holds messages and shows a signal | D32; Appendix F | [leads-and-messages](../features/leads-and-messages/story.md) |
| `integrations.instagram` | NEW | Instagram messages are sent and received in the person's conversation | D3; Appendix F | [leads-and-messages](../features/leads-and-messages/story.md) |
| `integrations.ai-ideas` | NEW | A language-model provider (chosen at kickoff) suggests ideas from a de-identified summary; the rules answer when it is unavailable | D39 | [patient-file](../features/patient-file/story.md) |

## Before → after

none — every requirement here is NEW

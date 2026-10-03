# Leads and conversations

Status: ready
Kind: screen
Depends on: team-and-access, shell-and-patterns
Tables: `lead`, `lead_message`, `lead_read`, `message_template` — [db-changes.md](../../db-changes.md)

## Stories

- As Front desk I want to capture enquiries and talk to them on WhatsApp so that they become bookings.
- As a Counsellor I want to see my leads, hold them and follow up so that nobody is forgotten.

## Rules

- A known phone warns but never blocks a new lead (`operations.leads`)
- A first reply or a logged call moves a new lead to Contacted (`operations.leads`)
- Only real WhatsApp and Instagram send; no SMS or email (`notifications.channels`)
- Re-target leads need marketing consent; staff send the first message (`notifications.marketing-consent`)

## Acceptance criteria

- **leads-and-messages.1** Front desk creates a lead with name, mobile, source and interests; a known phone warns but never blocks — intake-files/PRD.md:52
- **leads-and-messages.2** The lead list filters by status, source, assigned, Created and Follow-up date — intake-files/PRD.md:51
- **leads-and-messages.3** Messages go out on WhatsApp with delivery states and replies land in the conversation — intake-files/PRD.md:52
- **leads-and-messages.4** A first reply or a logged call moves a new lead to Contacted; check-in moves it to Clinic visited — intake-files/PRD.md:112
- **leads-and-messages.5** Closing a lead uses the "Close as" statuses; booking from a lead prefills the appointment — intake-files/PRD.md:52
- **leads-and-messages.6** Re-target leads appear daily for lapsed patients with marketing consent — intake-files/PRD.md:9

## Work items

- `data.stage-people`
- `data.contacts-on-records`
- `operations.leads`
- `operations.messages`
- `notifications.channels`
- `notifications.marketing-consent`
- `realtime.chat-refresh`
- `integrations.whatsapp-business`
- `integrations.instagram`
- `background.message-delivery`
- `background.message-outage-queue`
- `background.inbound-messages`
- `background.channel-fallback`
- `background.bulk-message-drafts`
- `background.lead-hold-release`
- `background.lead-status-auto`
- `background.lead-involved-auto`
- `background.retarget-leads`

`src/domains/app/sub-domains/contacts/contact-messaging-webhook/`

# Contact messaging webhook

The platform Meta app's WhatsApp and Instagram webhook (launch ROUTE #139, D77 — WC-1 delivery
reports, WC-3 replies): the subscription handshake, the signed callbacks stored per organization,
and the worker that applies them to the contacts' streams.

## Routes

| Route | Gate |
| --- | --- |
| `GET /app/messaging-webhook` | public — Meta's verify token (`hub.verify_token`) |
| `POST /app/messaging-webhook` | public — `X-Hub-Signature-256` over the raw body (`META_APP_SECRET`) |

Both answer 503 while the webhook is not configured.

## Flow

1. **Ingress** (`contact-messaging-webhook.service.ts`): a callback is split into its updates — each
   WhatsApp `messages` change, each Instagram `messaging` event — and each account's organization is
   found through `tenancy.resolve_organization_public_id_for_messaging_account` (SECURITY DEFINER;
   the webhook runs before any organization is known). The updates are stored in
   `app.messaging_webhook_events` in that organization's context (deduplicated by their SHA-256 —
   Meta retries the same body), then the organization's `messaging-webhook-event` job is enqueued.
   An account no clinic connected is logged and skipped; Meta still gets its 200.
2. **Processing** (`workers/messaging-webhook-event.processor.ts`): claims the pending updates; looks
   up, outside any context, the username of an Instagram sender no contact has written as yet; then
   applies each update in its own transaction — a delivery report moves its message forward only
   (`sent` → `delivered` → `read`, or `failed`); a WhatsApp reply joins the stream of the contact with
   that number, an unknown number becomes a new contact with an open lead (source `whatsapp`); an
   Instagram message joins the stream of the contact who wrote from that id before or whose
   Instagram handle matches — a stranger is dropped (a contact needs a number). A failing update is
   retried by the next job and kept `failed` after five tries.
3. **Safety nets**: the one-minute `contact-messaging-sweep` re-enqueues organizations with pending
   updates no job holds (and with queued messages for delivery); `messaging-webhook-event-retention`
   purges processed and failed updates after 30 days.

## Key invariants

- **Tenant isolation:** `app.messaging_webhook_events` is ENABLE + FORCE RLS on the organization GUC
  with the global-retention arm (the sweep and the purge read across organizations).
- **No Graph call inside a database context.**

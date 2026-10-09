`src/infrastructure/messaging/`

# Messaging infrastructure

## Purpose

The platform Meta app's network primitive (launch D77): WhatsApp Business Platform and Instagram
messaging through the Graph API, behind the shared `meta` circuit (see
[resilience.overview.md](src/infrastructure/resilience/resilience.overview.md)). It sends a text,
looks up an Instagram sender's username, and verifies the webhook's callbacks.

The app **domain** owns the business logic — the delivery worker in
[contact-activities/](src/domains/app/sub-domains/contacts/contact-activities/) and the webhook in
[contact-messaging-webhook/](src/domains/app/sub-domains/contacts/contact-messaging-webhook/); this
module owns the calls.

## Files

- `meta-graph.client.ts` — `sendWhatsAppTextMessage`, `sendInstagramTextMessage`,
  `sendWhatsAppMediaMessage` / `sendInstagramAttachmentMessage` (a file from a short-lived link —
  the visit share, D78), `fetchInstagramUsername` (each one `outboundFetchJson` call, integration
  `meta`), and
  `isMetaProviderDown` (the circuit's state, for the composer's "WhatsApp down").
- `meta-graph-error.util.ts` — `MetaGraphApiError`: a 4xx about one message (not a 401 / 403) and a
  throttle (429 or a rate-limit code) do not count against the circuit; a revoked token, a 5xx and a
  network failure do.
- `meta-messaging.config.ts` — the switches and checks that need no network: whether delivery is on
  (`MESSAGING_DELIVERY_ENABLED`), whether the webhook is configured, the `X-Hub-Signature-256` check
  over the raw body, the handshake's verify token. Kept apart so the queues and the webhook plugin
  load without the circuit.

## Design decisions

- **One platform app, each clinic's accounts in its settings.** The token and app secret are the
  platform's (env); each organization's `whatsapp_phone_number_id` and `instagram_account_id` sit on
  `tenancy.organization_settings` — a callback names the account, and the SECURITY DEFINER resolver
  `tenancy.resolve_organization_public_id_for_messaging_account` finds the clinic.
- **Network I/O outside RLS contexts**: the workers read in one short context, call Meta, then write
  in another (`rls-context-network-isolation.global.test.ts`).
- **Signature is byte-precise**: the webhook route registers its URL in the shared raw-body registry
  (`raw-body-route.registry.ts`) so the HMAC is checked against the exact bytes.

## Operational concerns

- Delivery stays off (`MESSAGING_DELIVERY_ENABLED=false`) until the three secrets are set — messages
  stay `queued`, never dropped. The worker pauses its queue while the `meta` circuit is open.
- WhatsApp only takes free text inside the 24-hour customer-service window; a message outside it is
  reported `failed` by Meta's delivery report (a template message is a follow-up).

## External dependencies

- Meta Graph API (`META_GRAPH_API_BASE_URL`, default `https://graph.facebook.com/v21.0`).

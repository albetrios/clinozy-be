`src/domains/notify/sub-domains/webhook/webhook-event/`

# Webhook event catalog (nested resource)

Parent: [webhook](../webhook.overview.md)

## Purpose

Read-only catalog of the webhook event types the platform can dispatch, served to the dashboard so users can pick which events a webhook subscribes to (`GET /webhook-events`).

## Layout

- `webhook-event.controller.ts` / `webhook-event.service.ts` — thin HTTP + application layer
- `webhook-event.repository.ts` — in-memory repository over the static `AVAILABLE_WEBHOOK_EVENTS` catalog (no database table)
- `webhook-event.serializer.ts` / `webhook-event.types.ts` — response shaping + domain types
- `seed/` — bulk-seed contribution (event-type picks for seeded webhooks)
- `__tests__/unit/` — controller, service, and serializer-shape unit suites

## Key invariants

- Intentionally has **no** `.schema.ts` / `.dto.ts` / `.validator.ts`: the catalog is static in-memory data and the only route takes no params or body. If the catalog ever moves to the database, add a schema and (if relevant) a query DTO/validator.
- Catalog entries are the producing domains' event constants (`ORGANIZATION_EVENT`, `MEMBERSHIP_EVENT`, `SUBSCRIPTION_EVENT`); the producers emit them and `webhook/events/organization-resource.event-handlers.ts` fans each one out through `WebhookService.dispatchOrganizationWebhooks`. `webhook-event.constants.ts` exports the list (`WEBHOOK_EVENT_TYPES`): webhook `events` are validated against it (anything else is a 400), each type names the read permission a webhook's creator needs to subscribe to it (`WEBHOOK_EVENT_READ_PERMISSION`, checked on create, and on update for both the stored and the requested events: 403 without it), the repository describes each type (a `Record` over the union, so a new type cannot ship undescribed), and `notify.event-handlers.unit.test.ts` fails when an advertised type has no subscription. Delivery lives in the sibling [webhook-delivery](../webhook-delivery/webhook-delivery.overview.md) resource.

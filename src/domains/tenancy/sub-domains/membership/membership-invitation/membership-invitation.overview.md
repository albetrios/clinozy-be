`src/domains/tenancy/sub-domains/membership/membership-invitation/`

# Membership invitations (nested resource)

Parent: [membership](../membership.overview.md)

## Purpose

The invite of an invited member (launch §2.C, T9) — table `tenancy.membership_invitations`, ids
`inv_…`. Issues it as the invitation half of add-member-by-email, resends it (an expired one too,
T11), revokes it for the membership (`MembershipService.revokeInvitation` ends the invited
membership in the same transaction) and accepts it. Emits domain events whose handlers enqueue the
invitation email through the transactional mail outbox.

| Route | Gate |
| --- | --- |
| `DELETE /tenancy/organization/memberships/{membership_id}/invitation` | `membership:delete` |
| `POST /tenancy/organization/memberships/{membership_id}/invitation/resend` | `membership:update` |
| `POST /tenancy/membership-invitations/{membership_invitation_id}/accept` | signed in (the invitee) |

There is no separate invitations list — an invited member is in the team list (`status=invited`)
with its `invitation` (T4).

## Layout

- `membership-invitation.controller.ts` / `membership-invitation.service.ts` — thin HTTP + application layer (issue, resend, revoke-for-membership, accept)
- `membership-invitation.token.ts` — token generation + hashing (raw token emailed, hash stored)
- `membership-invitation.repository.ts` / `membership-invitation.schema.ts` — persistence
- `membership-invitation.dto.ts` / `membership-invitation.validator.ts` / `membership-invitation.serializer.ts` / `membership-invitation.types.ts` — request/response shaping
- `events/` — `MEMBERSHIP_INVITATION_EVENT.CREATED` / `.RESENT` types, emit helpers, and handlers (registered in `register-event-handlers.ts`; they call `recordOutboxEmail()` post-commit, carrying `requestId`)
- `seed/` — seed contribution
- `__tests__/unit/` — validator/serializer/service and `unit/events/` handler suites
- `__tests__/integration/` — the dev-only accept-token echo through the real add, resend and accept routes

## Key invariants

- Invitation tokens are stored only as `sha256(raw)` — the raw token exists solely in the emailed link,
  and, on a developer's machine only, in the issue and resend answers: with
  `MEMBERSHIP_INVITATION_TOKEN_ECHO_ENABLED` on, the add-member answer carries
  `invitation.debug_invitation_token` and the resend answer `debug_invitation_token`, so a test member
  accepts through the real accept route (launch ROUTE #164, D82 — the email never arrives locally).
  The env schema refuses the flag outside the `local` and `development` targets; it defaults off and
  the test harness pins it off. A token-bearing answer is never cached (idempotency cache skip,
  `cache-control: no-store`).
- Accept is atomic and one-shot, and is gated on a **verified** email that matches the invitation; a suspended member cannot self-restore via accept (activation requires status `invited`).
- Event handlers only enqueue mail via the outbox — they never fail the originating HTTP request.

## Lifecycle

```mermaid
stateDiagram-v2
    [*] --> pending: create (CREATED event → outbox mail)
    pending --> pending: resend (RESENT event → outbox mail)
    pending --> accepted: accept (verified matching email, one-shot)
    pending --> revoked: revoke
    accepted --> [*]
    revoked --> [*]
```

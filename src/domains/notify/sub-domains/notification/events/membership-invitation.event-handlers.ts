import { eventBus, runEnqueueAfterCommit, type DomainEvent } from '@/core/events/event-bus.js';
import { invalidateCachedUnreadNotificationCounts } from '@/domains/notify/sub-domains/notification/notification-unread-count.cache.js';
import {
  createAndDispatchNotification,
  resolveNotificationRecipientPublicIds,
} from '@/domains/notify/sub-domains/notification/notification-dispatch.service.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import {
  MEMBERSHIP_INVITATION_EVENT,
  type MembershipInvitationAcceptedPayload,
  type MembershipInvitationDeclinedPayload,
} from '@/domains/tenancy/sub-domains/membership/membership-invitation/events/membership-invitation.events.js';

/** FE deep link both invitation notifications open: the members list. */
const INVITATION_NOTIFICATION_ACTION_URL = '/settings/members';

/** One invitation notification: its type (from the #964 vocabulary), copy and channels. */
interface InvitationNotification {
  type: 'membership.invite_accepted' | 'membership.invite_declined';
  title: string;
  message: string;
  channels: readonly string[];
}

/**
 * Fans one invitation notification out to each recipient the tenancy path resolved.
 *
 * @remarks Runs synchronously inside the tenancy write's `withAppDatabaseContext` (the event is
 * awaited there), so each `createAndDispatchNotification` INSERT sees the organization GUC and satisfies the
 * notification write-RLS. `requestId` is intentionally omitted so the commit-dispatch uses the
 * in-memory `onCommit` path — no Redis write inside the caller's RLS-context transaction. Per-recipient
 * try/catch means one bad insert cannot drop the rest, and the bus swallows any throw so the
 * accept or decline is safe.
 */
async function fanOutInvitationNotification(options: {
  event: DomainEvent;
  recipientUserIds: readonly number[];
  organizationId: number;
  notification: InvitationNotification;
}): Promise<void> {
  for (const recipientUserId of options.recipientUserIds) {
    try {
      await createAndDispatchNotification({
        user_id: recipientUserId,
        organization_id: options.organizationId,
        type: options.notification.type,
        title: options.notification.title,
        message: options.notification.message,
        action_url: INVITATION_NOTIFICATION_ACTION_URL,
        // IN_APP is the persisted row itself; the worker delivers any other channel.
        data: { channels: [...options.notification.channels] },
      });
    } catch (error) {
      logger.error(
        { err: error, recipientUserId, eventType: options.event.type },
        'notify.membership_invitation.dispatch.failed',
      );
    }
  }
  await invalidateRecipientUnreadCounts(options.recipientUserIds, options.event.type);
}

/**
 * A `membership.invite_accepted` notification (in-app + email) to each organization
 * `membership:create` holder resolved by the tenancy accept path.
 */
async function onMembershipInvitationAcceptedEvent(event: DomainEvent): Promise<void> {
  const payload = event.payload as MembershipInvitationAcceptedPayload;
  await fanOutInvitationNotification({
    event,
    recipientUserIds: payload.recipient_user_ids,
    organizationId: payload.organization_id,
    notification: {
      type: 'membership.invite_accepted',
      title: 'Invitation accepted',
      message: `${payload.invitee_name} accepted your invitation to join ${payload.organization_name}.`,
      // An inbox item + an email to the manager.
      channels: ['in_app', 'email'],
    },
  });
}

/**
 * A `membership.invite_declined` notification, in the app only (launch D84 (3)), to the inviter —
 * or the `membership:create` holders when the inviter is gone — as the tenancy decline path
 * resolved them.
 */
async function onMembershipInvitationDeclinedEvent(event: DomainEvent): Promise<void> {
  const payload = event.payload as MembershipInvitationDeclinedPayload;
  await fanOutInvitationNotification({
    event,
    recipientUserIds: payload.recipient_user_ids,
    organizationId: payload.organization_id,
    notification: {
      type: 'membership.invite_declined',
      title: 'Invitation declined',
      message: `${payload.invitee_name} declined your invitation to join ${payload.organization_name}.`,
      channels: ['in_app'],
    },
  });
}

/**
 * Drops each recipient's cached unread count, so the badge reflects the notification they were
 * just sent instead of waiting out the TTL.
 *
 * @remarks
 * - **Algorithm:** two halves, on opposite sides of the commit. The internal-id → public-id
 *   resolve runs HERE, inside the accept's or decline's live database context, because after
 *   commit there is no handle to resolve with. The tombstone write is deferred to
 *   `runEnqueueAfterCommit`.
 * - **Failure modes:** entirely best-effort — a failure leaves a badge low for at most the cache
 *   TTL, which must never be allowed to fail an invitation accept or decline. Logged, never rethrown.
 * - **Side effects:** one SECURITY DEFINER resolve; one short-lived Redis key per recipient, after
 *   the transaction commits.
 * - **Notes:** the split is what lets the tombstone be short. Invalidating from inside the
 *   transaction would be *correct* — a tombstone, unlike a `DEL`, refuses the racing populate
 *   rather than being overwritten by it — but the tombstone would then have to outlive the rest of
 *   the transaction too, and sizing it for that means holding the key cold far longer than the
 *   race needs. Deferring past the commit makes the window just the in-flight read, which is what
 *   `CACHE_INVALIDATION_TOMBSTONE_TTL_SECONDS` is sized for. It also means a rolled-back
 *   accept invalidates nothing, which the pre-commit version got wrong.
 */
async function invalidateRecipientUnreadCounts(
  recipientUserIds: readonly number[],
  eventType: string,
): Promise<void> {
  try {
    const recipientPublicIds = await resolveNotificationRecipientPublicIds(recipientUserIds);
    await runEnqueueAfterCommit(async () => {
      await invalidateCachedUnreadNotificationCounts(recipientPublicIds);
    });
  } catch (error) {
    logger.warn(
      { err: error, eventType },
      'notify.membership_invitation.unread_cache_invalidate.failed',
    );
  }
}

let membershipInvitationHandlersRegistered = false;

/**
 * Idempotent registrar subscribing the in-process listeners for
 * {@link MEMBERSHIP_INVITATION_EVENT.ACCEPTED} and `DECLINED`, so an accepted or declined
 * invitation fans out its notification (`membership.invite_accepted` / `membership.invite_declined`).
 */
export function registerMembershipInvitationNotificationHandlers(): void {
  if (membershipInvitationHandlersRegistered) return;
  membershipInvitationHandlersRegistered = true;
  eventBus.on(MEMBERSHIP_INVITATION_EVENT.ACCEPTED, onMembershipInvitationAcceptedEvent);
  eventBus.on(MEMBERSHIP_INVITATION_EVENT.DECLINED, onMembershipInvitationDeclinedEvent);
}

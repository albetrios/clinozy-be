import { eventBus, runEnqueueAfterCommit, type DomainEvent } from '@/core/events/event-bus.js';
import i18next from 'i18next';
import { invalidateCachedUnreadNotificationCounts } from '@/domains/notify/sub-domains/notification/notification-unread-count.cache.js';
import {
  createAndDispatchNotification,
  resolveNotificationRecipientPublicIds,
} from '@/domains/notify/sub-domains/notification/notification-dispatch.service.js';
import { withSavepoint } from '@/infrastructure/database/transaction.js';
import type { SupportedLanguage } from '@/shared/constants/i18n.constants.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import {
  MEMBERSHIP_INVITATION_EVENT,
  type MembershipInvitationAcceptedPayload,
  type MembershipInvitationDeclinedPayload,
} from '@/domains/tenancy/sub-domains/membership/membership-invitation/events/membership-invitation.events.js';

/** FE deep link both invitation notifications open: the members list. */
const INVITATION_NOTIFICATION_ACTION_URL = '/settings/members';

/** One invitation notification: its type (from the #964 vocabulary), copy, language and channels. */
interface InvitationNotification {
  type: 'membership.invite_accepted' | 'membership.invite_declined';
  title: string;
  message: string;
  /** The organization's language — the copy's, and the email's around it (`data.locale`). */
  locale: SupportedLanguage;
  channels: readonly string[];
}

/**
 * The notification's title and message in the organization's language: plain text (the inbox and
 * the email escape it where it lands in HTML).
 */
function translateInvitationNotification(options: {
  titleKey: string;
  messageKey: string;
  payload: { locale: SupportedLanguage; invitee_name: string; organization_name: string };
}): { title: string; message: string } {
  const plainText = { lng: options.payload.locale, interpolation: { escapeValue: false } };
  return {
    title: i18next.t(options.titleKey, plainText),
    message: i18next.t(options.messageKey, {
      ...plainText,
      inviteeName: options.payload.invitee_name,
      organizationName: options.payload.organization_name,
    }),
  };
}

/**
 * Fans one invitation notification out to each recipient the tenancy path resolved.
 *
 * @remarks Runs synchronously inside the tenancy write's `withAppDatabaseContext` (the event is
 * awaited there), so each `createAndDispatchNotification` INSERT sees the organization GUC and satisfies the
 * notification write-RLS. `requestId` is intentionally omitted so the commit-dispatch uses the
 * in-memory `onCommit` path — no Redis write inside the caller's RLS-context transaction. Each
 * recipient's insert runs in its own savepoint behind a try/catch, so one bad insert neither drops
 * the rest nor fails the accept or decline (without the savepoint the aborted transaction would fail
 * it at COMMIT).
 */
async function fanOutInvitationNotification(options: {
  event: DomainEvent;
  recipientUserIds: readonly number[];
  organizationId: number;
  notification: InvitationNotification;
}): Promise<void> {
  for (const recipientUserId of options.recipientUserIds) {
    try {
      // A savepoint per recipient: inside the caller's transaction a failed INSERT would otherwise
      // abort it, and the unit of work would refuse to commit even though this catch ran.
      await withSavepoint(() =>
        createAndDispatchNotification({
          input: {
            user_id: recipientUserId,
            organization_id: options.organizationId,
            type: options.notification.type,
            title: options.notification.title,
            message: options.notification.message,
            action_url: INVITATION_NOTIFICATION_ACTION_URL,
            // IN_APP is the persisted row itself; the worker delivers any other channel.
            data: {
              channels: [...options.notification.channels],
              locale: options.notification.locale,
            },
          },
        }),
      );
    } catch (error) {
      logger.error(
        { err: error, recipientUserId, eventType: options.event.type },
        'notify.membership_invitation.dispatch.failed',
      );
    }
  }
  await invalidateRecipientUnreadCounts({
    recipientUserIds: options.recipientUserIds,
    eventType: options.event.type,
  });
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
      ...translateInvitationNotification({
        titleKey: 'common:notifications.invitationAcceptedTitle',
        messageKey: 'common:notifications.invitationAcceptedMessage',
        payload,
      }),
      locale: payload.locale,
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
      ...translateInvitationNotification({
        titleKey: 'common:notifications.invitationDeclinedTitle',
        messageKey: 'common:notifications.invitationDeclinedMessage',
        payload,
      }),
      locale: payload.locale,
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
async function invalidateRecipientUnreadCounts({
  recipientUserIds,
  eventType,
}: {
  recipientUserIds: readonly number[];
  eventType: string;
}): Promise<void> {
  try {
    const recipientPublicIds = await withSavepoint(() =>
      resolveNotificationRecipientPublicIds(recipientUserIds),
    );
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
  eventBus.on({
    eventType: MEMBERSHIP_INVITATION_EVENT.ACCEPTED,
    handler: onMembershipInvitationAcceptedEvent,
  });
  eventBus.on({
    eventType: MEMBERSHIP_INVITATION_EVENT.DECLINED,
    handler: onMembershipInvitationDeclinedEvent,
  });
}

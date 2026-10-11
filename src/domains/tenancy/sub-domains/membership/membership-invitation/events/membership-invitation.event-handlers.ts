import { eventBus, scheduleCommitDispatch, type DomainEvent } from '@/core/events/event-bus.js';
import { recordOutboxEmail } from '@/infrastructure/mail/queues/mail.queue.js';
import { invitationTemplate } from '@/infrastructure/mail/templates/invitation.template.js';
import { translateMailText } from '@/infrastructure/mail/templates/base.template.js';
import { isMailConfigured } from '@/infrastructure/mail/mail.service.js';
import { env } from '@/shared/config/env.config.js';
import { DEFAULT_FRONTEND_URL } from '@/shared/constants/index.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import {
  MEMBERSHIP_INVITATION_EVENT,
  type MembershipInvitationEmailPayload,
} from './membership-invitation.events.js';

async function handleMembershipInvitationEmail({
  payload,
  requestId,
}: {
  payload: MembershipInvitationEmailPayload;
  requestId?: string | undefined;
}): Promise<void> {
  if (!isMailConfigured()) {
    logger.warn({ email: payload.email }, 'Mail not configured — invitation email skipped');
    return;
  }

  const frontendUrl = env.FRONTEND_URL ?? DEFAULT_FRONTEND_URL;
  // Link to the FRONTEND accept page (clinozy-fe route `/accept-invite/:invitation_id`), which reads
  // the token from the query string and POSTs it to
  // `/api/v1/tenancy/membership-invitations/:membership_invitation_id/accept` (launch T9).
  // NOT the API route — a browser GET on the API path is a POST-only, auth-gated 404 the recipient
  // can never complete.
  const acceptUrl = `${frontendUrl}/accept-invite/${payload.invitation_public_id}?token=${payload.token}`;

  const html = invitationTemplate({
    inviterName:
      payload.inviter_name ||
      translateMailText({ key: 'invitationFallbackInviter', locale: payload.locale }),
    organizationName: payload.organization_name,
    acceptUrl,
    expiresInDays: payload.expires_in_days,
    locale: payload.locale,
  });

  const mailOutboxToken = await recordOutboxEmail({
    to: payload.email,
    subject: translateMailText({
      key: 'invitationSubject',
      locale: payload.locale,
      values: {
        organizationName: payload.organization_name,
      },
    }),
    html,
    tags: [{ name: 'category', value: 'invitation' }],
  });
  await scheduleCommitDispatch({
    task: { type: 'mail_outbox', mailOutboxToken },
    options: requestId !== undefined ? { requestId } : undefined,
  });
}

async function onMembershipInvitationEmailEvent(event: DomainEvent): Promise<void> {
  const payload = event.payload as MembershipInvitationEmailPayload;
  try {
    await handleMembershipInvitationEmail({ payload, requestId: event.requestId });
  } catch (error) {
    logger.warn(
      { error, eventType: event.type, email: payload.email },
      'membership-invitation.email.enqueue.failed',
    );
    throw error;
  }
}

let membershipInvitationHandlersRegistered = false;

/**
 * Subscribes the invitation email handler to {@link MEMBERSHIP_INVITATION_EVENT}
 * `CREATED` and `RESENT`. Idempotent: re-invocation is a no-op so the API and
 * worker bootstraps can both call it without double-wiring listeners.
 */
export function registerMembershipInvitationEventHandlers(): void {
  if (membershipInvitationHandlersRegistered) return;
  membershipInvitationHandlersRegistered = true;
  eventBus.on({
    eventType: MEMBERSHIP_INVITATION_EVENT.CREATED,
    handler: onMembershipInvitationEmailEvent,
  });
  eventBus.on({
    eventType: MEMBERSHIP_INVITATION_EVENT.RESENT,
    handler: onMembershipInvitationEmailEvent,
  });
}

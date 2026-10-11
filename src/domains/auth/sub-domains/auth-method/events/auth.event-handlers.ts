import i18next from 'i18next';
import { eventBus, scheduleCommitDispatch, type DomainEvent } from '@/core/events/event-bus.js';
import { ServiceUnavailableError } from '@/shared/errors/index.js';
import {
  recordOutboxEmail,
  type MailEnqueueInput,
} from '@/infrastructure/mail/queues/mail.queue.js';
import { verificationCodeTemplate } from '@/infrastructure/mail/templates/verification-code.template.js';
import { isMailConfigured } from '@/infrastructure/mail/mail.service.js';
import { env } from '@/shared/config/env.config.js';
import { DEFAULT_FRONTEND_URL } from '@/shared/constants/index.js';
import { logger } from '@/shared/utils/infrastructure/logger.util.js';
import {
  AUTH_EVENT,
  type EmailVerificationCodePayload,
  type PasswordResetEmailPayload,
} from './auth.events.js';

async function recordAndScheduleOutboxEmail({
  data,
  options,
}: {
  data: MailEnqueueInput;
  options?: { requestId?: string } | undefined;
}): Promise<void> {
  const mailOutboxToken = await recordOutboxEmail(data);
  const requestId = options?.requestId;
  await scheduleCommitDispatch({
    task: {
      type: 'mail_outbox',
      mailOutboxToken,
      requestId,
    },
    options: requestId !== undefined ? { requestId } : undefined,
  });
}

async function handleVerificationCodeEmail({
  payload,
  requestId,
}: {
  payload: EmailVerificationCodePayload;
  requestId?: string | undefined;
}): Promise<void> {
  if (!isMailConfigured()) {
    throw new ServiceUnavailableError('errors:mailNotConfigured');
  }

  const html = verificationCodeTemplate({
    code: payload.verification_code,
    expiresInMinutes: payload.expires_in_minutes,
    locale: payload.locale,
  });

  await recordAndScheduleOutboxEmail({
    data: {
      to: payload.email,
      subject: i18next.t('mail:verificationCodeSubject', { lng: payload.locale }),
      html,
      tags: [{ name: 'category', value: 'verification-code' }],
    },
    options: requestId !== undefined ? { requestId } : undefined,
  });
}

async function handlePasswordResetEmail({
  payload,
  requestId,
}: {
  payload: PasswordResetEmailPayload;
  requestId?: string | undefined;
}): Promise<void> {
  if (!isMailConfigured()) {
    throw new ServiceUnavailableError('errors:mailNotConfigured');
  }

  const frontendUrl = env.FRONTEND_URL ?? DEFAULT_FRONTEND_URL;
  const resetUrl = `${frontendUrl}/auth/password/reset?token=${payload.reset_token}`;

  await recordAndScheduleOutboxEmail({
    data: {
      to: payload.email,
      subject: i18next.t('mail:passwordResetSubject', { lng: payload.locale }),
      html: i18next.t('mail:passwordResetHtml', {
        lng: payload.locale,
        resetUrl,
        expiresInMinutes: payload.expires_in_minutes,
      }),
      tags: [{ name: 'category', value: 'password-reset' }],
    },
    options: requestId !== undefined ? { requestId } : undefined,
  });
}

async function onVerificationCodeEmailEvent(event: DomainEvent): Promise<void> {
  const payload = event.payload as EmailVerificationCodePayload;
  try {
    await handleVerificationCodeEmail({ payload, requestId: event.requestId });
  } catch (error) {
    logger.warn(
      { error, eventType: event.type, email: payload.email },
      'auth.email_verification_code.email.enqueue.failed',
    );
    throw error;
  }
}

async function onPasswordResetEmailEvent(event: DomainEvent): Promise<void> {
  const payload = event.payload as PasswordResetEmailPayload;
  try {
    await handlePasswordResetEmail({ payload, requestId: event.requestId });
  } catch (error) {
    logger.warn(
      { error, eventType: event.type, email: payload.email },
      'auth.password_reset.email.enqueue.failed',
    );
    throw error;
  }
}

let authEventHandlersRegistered = false;

function registerAuthMethodEmailEventHandlers(): void {
  eventBus.on({
    eventType: AUTH_EVENT.EMAIL_VERIFICATION_CODE_REQUESTED,
    handler: onVerificationCodeEmailEvent,
  });
  eventBus.on({
    eventType: AUTH_EVENT.PASSWORD_RESET_REQUESTED,
    handler: onPasswordResetEmailEvent,
  });
}

/** Subscribes the auth-method side-effect handlers to the in-process event bus (email verification code and password reset emails). Idempotent: subsequent calls are no-ops. */
export function registerAuthMethodEventHandlers(): void {
  if (authEventHandlersRegistered) return;
  authEventHandlersRegistered = true;
  registerAuthMethodEmailEventHandlers();
}

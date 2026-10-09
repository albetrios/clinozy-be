import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { assertWorkerDatabaseContext } from '@/infrastructure/database/contexts/database-context-runtime.js';
import type { WorkerDatabaseHandle } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { uploads } from '@/domains/upload/upload.schema.js';
import { organization_settings } from '@/domains/tenancy/sub-domains/organization/organization-settings/organization-settings.schema.js';
import { contact_phones, contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import {
  CONTACT_ACTIVITY_AUTOMATION_KIND,
  CONTACT_ACTIVITY_BOOKING_AUTOMATION_KINDS,
  CONTACT_ACTIVITY_DELIVERY_STATUS,
  CONTACT_ACTIVITY_DIRECTION,
  CONTACT_ACTIVITY_TYPE,
} from './contact-activities.constants.js';
import { contact_activities } from './contact-activities.schema.js';
import {
  CONTACT_MESSAGE_DELIVERY_CLAIM_STALE_MINUTES,
  CONTACT_MESSAGE_DELIVERY_SWEEP_BATCH,
} from './workers/contact-message-delivery.constants.js';

/** The organization a delivery job runs for, with its accounts on the platform Meta app (D77). */
export interface MessagingOrganization {
  id: number;
  whatsappPhoneNumberId: string | null;
  instagramAccountId: string | null;
}

/** A queued message the job claimed, with where it goes. */
export interface ClaimedContactMessage {
  id: number;
  publicId: string;
  type: 'whatsapp' | 'instagram';
  body: string;
  contactId: number;
  /** The contact's primary number (E.164). */
  primaryPhone: string;
  /** Whether that number is on WhatsApp (the contact's own flag). */
  isOnWhatsApp: boolean;
  /** The Instagram-scoped id of the person's latest Instagram message — the reply address. */
  instagramRecipientId: string | null;
  /** The files it carries (D78, WC-11), in the order they were attached. */
  attachments: ContactMessageAttachment[];
  /** How many files it was sent with — more than `attachments` when an upload is gone. */
  attachmentKeyCount: number;
}

/** A file a queued message carries — one of the organization's confirmed uploads. */
export interface ContactMessageAttachment {
  fileKey: string;
  mimeType: string;
  fileName: string;
}

/** The claim condition: queued, and unclaimed or claimed by a job that died. */
function claimable() {
  return and(
    eq(contact_activities.delivery_status, CONTACT_ACTIVITY_DELIVERY_STATUS.QUEUED),
    or(
      isNull(contact_activities.delivery_claimed_at),
      lt(
        contact_activities.delivery_claimed_at,
        sql`now() - make_interval(mins => ${CONTACT_MESSAGE_DELIVERY_CLAIM_STALE_MINUTES})`,
      ),
    ),
  );
}

/**
 * A booking message's outcome on its appointment (launch D78, WC-6): the reminder sent moves
 * `reminder_queued` to `reminder_sent`; a failure of the message the booking waits on — the
 * confirm request while `confirm_requested`, the reminder after it — makes it `failed`.
 *
 * @remarks
 * - **Algorithm:** one `UPDATE … FROM` over the given entries that carry a booking
 *   `automation_kind` and an appointment; a message of an earlier step (the booking moved since,
 *   or its reminder already queued) changes nothing. `updated_at` stays — the worker's write is
 *   not an edit.
 * - **Failure modes:** a database error propagates to the caller's job.
 */
export async function recordBookingMessageOutcome(
  databaseHandle: WorkerDatabaseHandle,
  options: { contactActivityIds: readonly number[]; outcome: 'sent' | 'failed' },
): Promise<void> {
  if (options.contactActivityIds.length === 0) return;
  const kind = contact_activities.automation_kind;
  const status = appointments.reminder_status;
  const reminder = sql`${kind} = ${CONTACT_ACTIVITY_AUTOMATION_KIND.BOOKING_REMINDER}`;
  const moves =
    options.outcome === 'sent'
      ? sql`${reminder} and ${status} = 'reminder_queued'`
      : sql`(${kind} = ${CONTACT_ACTIVITY_AUTOMATION_KIND.BOOKING_CONFIRM} and ${status} = 'confirm_requested')
          or (${reminder} and ${status} in ('reminder_queued', 'reminder_sent'))`;
  await databaseHandle
    .update(appointments)
    .set({ reminder_status: options.outcome === 'sent' ? 'reminder_sent' : 'failed' } as never)
    .from(contact_activities)
    .where(
      and(
        inArray(contact_activities.id, [...options.contactActivityIds]),
        eq(contact_activities.appointment_id, appointments.id),
        inArray(kind, [...CONTACT_ACTIVITY_BOOKING_AUTOMATION_KINDS]),
        sql`(${moves})`,
      ),
    );
}

/**
 * The organizations with a queued message no live job holds — the delivery sweep's read (D77),
 * across organizations, in id order after `afterId`.
 *
 * @remarks
 * - **Algorithm:** distinct organizations over the queue's partial index, live team or personal
 *   organizations only.
 * - **Failure modes:** a database error propagates to the sweep (BullMQ retries it).
 */
export async function findOrganizationsWithQueuedMessages(
  databaseHandle: WorkerDatabaseHandle,
  afterId: number,
): Promise<{ id: number; publicId: string }[]> {
  assertWorkerDatabaseContext(['global_retention_cleanup']);
  return databaseHandle
    .selectDistinct({ id: organizations.id, publicId: organizations.public_id })
    .from(contact_activities)
    .innerJoin(organizations, eq(organizations.id, contact_activities.organization_id))
    .where(
      and(
        claimable(),
        sql`${contact_activities.organization_id} > ${afterId}`,
        isNull(organizations.deleted_at),
      ),
    )
    .orderBy(asc(organizations.id))
    .limit(CONTACT_MESSAGE_DELIVERY_SWEEP_BATCH);
}

/**
 * The delivery job's reads and writes (launch D77, WC-1) on an explicit handle pinned to one
 * organization's context.
 *
 * @remarks
 * - **Algorithm:** {@link ContactMessageDeliveryRepository.claimBatch} claims the oldest queued
 *   messages (`FOR UPDATE SKIP LOCKED`, `delivery_claimed_at`); each send's outcome is written in
 *   its own short context — `sent` with Meta's id, `failed` with the reason, or the claim
 *   released — and only while the message is still the claimed `queued` one.
 * - **Failure modes:** database errors propagate to the worker.
 */
export class ContactMessageDeliveryRepository {
  constructor(private readonly databaseHandle: WorkerDatabaseHandle) {}

  /** The organization and its messaging accounts, or `null` when it is gone. */
  async findOrganization(organizationPublicId: string): Promise<MessagingOrganization | null> {
    const rows = await this.databaseHandle
      .select({
        id: organizations.id,
        whatsappPhoneNumberId: organization_settings.whatsapp_phone_number_id,
        instagramAccountId: organization_settings.instagram_account_id,
      })
      .from(organizations)
      .leftJoin(organization_settings, eq(organization_settings.organization_id, organizations.id))
      .where(
        and(eq(organizations.public_id, organizationPublicId), isNull(organizations.deleted_at)),
      )
      .limit(1);
    const row = rows[0];
    return row
      ? {
          id: row.id,
          whatsappPhoneNumberId: row.whatsappPhoneNumberId ?? null,
          instagramAccountId: row.instagramAccountId ?? null,
        }
      : null;
  }

  /** Claims up to `limit` queued messages, oldest first — each with its contact's addresses. */
  async claimBatch(options: {
    organizationId: number;
    limit: number;
  }): Promise<ClaimedContactMessage[]> {
    const candidates = this.databaseHandle
      .select({ id: contact_activities.id })
      .from(contact_activities)
      .where(and(eq(contact_activities.organization_id, options.organizationId), claimable()))
      .orderBy(asc(contact_activities.occurred_at), asc(contact_activities.id))
      .limit(options.limit)
      .for('update', { skipLocked: true });
    const claimed = await this.databaseHandle
      .update(contact_activities)
      .set({ delivery_claimed_at: sql`now()` } as never)
      .where(inArray(contact_activities.id, candidates))
      .returning({
        id: contact_activities.id,
        publicId: contact_activities.public_id,
        type: contact_activities.type,
        body: contact_activities.body,
        contactId: contact_activities.contact_id,
        occurredAt: contact_activities.occurred_at,
        attachmentKeys: contact_activities.attachment_keys,
      });
    if (claimed.length === 0) return [];
    const files = await this.findAttachments({
      organizationId: options.organizationId,
      fileKeys: claimed.flatMap((message) => message.attachmentKeys),
    });
    const contactIds = [...new Set(claimed.map((message) => message.contactId))];
    const addresses = await this.databaseHandle
      .select({
        contactId: contacts.id,
        primaryPhone: contacts.primary_phone,
        isOnWhatsApp: sql<boolean>`coalesce(${contact_phones.is_on_whatsapp}, true)`,
      })
      .from(contacts)
      .leftJoin(
        contact_phones,
        and(
          eq(contact_phones.contact_id, contacts.id),
          eq(contact_phones.phone, contacts.primary_phone),
          isNull(contact_phones.deleted_at),
        ),
      )
      .where(inArray(contacts.id, contactIds));
    const instagramSenders = await this.databaseHandle
      .selectDistinctOn([contact_activities.contact_id], {
        contactId: contact_activities.contact_id,
        senderId: contact_activities.provider_sender_id,
      })
      .from(contact_activities)
      .where(
        and(
          inArray(contact_activities.contact_id, contactIds),
          eq(contact_activities.type, CONTACT_ACTIVITY_TYPE.INSTAGRAM),
          eq(contact_activities.direction, CONTACT_ACTIVITY_DIRECTION.RECEIVED),
          isNotNull(contact_activities.provider_sender_id),
        ),
      )
      .orderBy(
        contact_activities.contact_id,
        desc(contact_activities.occurred_at),
        desc(contact_activities.id),
      );
    const addressOf = new Map(addresses.map((address) => [address.contactId, address]));
    const senderOf = new Map(instagramSenders.map((sender) => [sender.contactId, sender.senderId]));
    // RETURNING keeps no order: the oldest goes first.
    claimed.sort(
      (left, right) => left.occurredAt.getTime() - right.occurredAt.getTime() || left.id - right.id,
    );
    return claimed.map((message) => ({
      id: message.id,
      publicId: message.publicId,
      type: message.type as ClaimedContactMessage['type'],
      body: message.body,
      contactId: message.contactId,
      primaryPhone: addressOf.get(message.contactId)?.primaryPhone ?? '',
      isOnWhatsApp: addressOf.get(message.contactId)?.isOnWhatsApp ?? false,
      instagramRecipientId: senderOf.get(message.contactId) ?? null,
      attachments: message.attachmentKeys.flatMap((fileKey) => {
        const file = files.get(fileKey);
        return file ? [file] : [];
      }),
      attachmentKeyCount: message.attachmentKeys.length,
    }));
  }

  /** The organization's confirmed, live uploads among `fileKeys`, by key. */
  private async findAttachments(options: {
    organizationId: number;
    fileKeys: readonly string[];
  }): Promise<Map<string, ContactMessageAttachment>> {
    if (options.fileKeys.length === 0) return new Map();
    const rows = await this.databaseHandle
      .select({
        fileKey: uploads.file_key,
        mimeType: uploads.mime_type,
        fileName: uploads.file_name,
      })
      .from(uploads)
      .where(
        and(
          eq(uploads.organization_id, options.organizationId),
          inArray(uploads.file_key, [...new Set(options.fileKeys)]),
          eq(uploads.status, 'UPLOADED'),
          isNull(uploads.deleted_at),
        ),
      );
    return new Map(rows.map((row) => [row.fileKey, row]));
  }

  /** The claimed message went out: `sent`, with Meta's id (its delivery reports carry it). */
  async markSent(options: { id: number; providerMessageId: string }): Promise<void> {
    await this.databaseHandle
      .update(contact_activities)
      .set({
        delivery_status: CONTACT_ACTIVITY_DELIVERY_STATUS.SENT,
        provider_message_id: options.providerMessageId,
        delivery_claimed_at: null,
        updated_at: sql`greatest(now(), ${contact_activities.created_at})`,
      } as never)
      .where(this.stillClaimed(options.id));
    await recordBookingMessageOutcome(this.databaseHandle, {
      contactActivityIds: [options.id],
      outcome: 'sent',
    });
  }

  /** Meta (or the clinic's setup) refused the message: `failed`, with why — staff can resend it. */
  async markFailed(options: { id: number; reason: string }): Promise<void> {
    await this.databaseHandle
      .update(contact_activities)
      .set({
        delivery_status: CONTACT_ACTIVITY_DELIVERY_STATUS.FAILED,
        failure_reason: options.reason.slice(0, 280),
        failed_at: sql`now()`,
        delivery_claimed_at: null,
        updated_at: sql`greatest(now(), ${contact_activities.created_at})`,
      } as never)
      .where(this.stillClaimed(options.id));
    await recordBookingMessageOutcome(this.databaseHandle, {
      contactActivityIds: [options.id],
      outcome: 'failed',
    });
  }

  /** Gives claimed messages back to the queue (an outage, a throttle) — they stay `queued`. */
  async releaseClaims(ids: readonly number[]): Promise<void> {
    if (ids.length === 0) return;
    await this.databaseHandle
      .update(contact_activities)
      .set({ delivery_claimed_at: null } as never)
      .where(
        and(
          inArray(contact_activities.id, [...ids]),
          eq(contact_activities.delivery_status, CONTACT_ACTIVITY_DELIVERY_STATUS.QUEUED),
        ),
      );
  }

  /** The message is still the queued one this job claimed. */
  private stillClaimed(id: number) {
    return and(
      eq(contact_activities.id, id),
      eq(contact_activities.delivery_status, CONTACT_ACTIVITY_DELIVERY_STATUS.QUEUED),
      isNotNull(contact_activities.delivery_claimed_at),
    );
  }
}

/** Worker-only factory — a handle pinned to one organization's context (D77). */
export function createWorkerContactMessageDeliveryRepository(
  databaseHandle: WorkerDatabaseHandle,
): ContactMessageDeliveryRepository {
  assertWorkerDatabaseContext(['organization']);
  return new ContactMessageDeliveryRepository(databaseHandle);
}

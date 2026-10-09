import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { assertWorkerDatabaseContext } from '@/infrastructure/database/contexts/database-context-runtime.js';
import type { WorkerDatabaseHandle } from '@/infrastructure/queue/worker-runtime/worker-processor.util.js';
import { generatePublicId } from '@/shared/utils/identity/public-id.util.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { contact_phones, contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import { contact_activities } from '@/domains/app/sub-domains/contacts/contact-activities/contact-activities.schema.js';
import {
  CONTACT_ACTIVITY_DELIVERY_STATUS,
  CONTACT_ACTIVITY_DIRECTION,
  CONTACT_ACTIVITY_TYPE,
} from '@/domains/app/sub-domains/contacts/contact-activities/contact-activities.constants.js';
import { leads } from '@/domains/app/sub-domains/leads/leads.schema.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { recordBookingMessageOutcome } from '@/domains/app/sub-domains/contacts/contact-activities/contact-message-delivery.repository.js';

/** A delivery report's status, in the order a message moves (D77) — `failed` ends it early. */
export type InboundDeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed';

/** The statuses each report may move a message from — forward only (D77). */
const MOVES_FROM: Readonly<Record<InboundDeliveryStatus, readonly string[]>> = {
  sent: [CONTACT_ACTIVITY_DELIVERY_STATUS.QUEUED],
  delivered: [CONTACT_ACTIVITY_DELIVERY_STATUS.QUEUED, CONTACT_ACTIVITY_DELIVERY_STATUS.SENT],
  read: [
    CONTACT_ACTIVITY_DELIVERY_STATUS.QUEUED,
    CONTACT_ACTIVITY_DELIVERY_STATUS.SENT,
    CONTACT_ACTIVITY_DELIVERY_STATUS.DELIVERED,
  ],
  failed: [CONTACT_ACTIVITY_DELIVERY_STATUS.QUEUED, CONTACT_ACTIVITY_DELIVERY_STATUS.SENT],
};

/** `greatest(coalesce(column, -infinity), at)` — an activity time that only moves forward. */
function latest(column: AnyPgColumn, at: Date) {
  return sql`greatest(coalesce(${column}, '-infinity'::timestamptz), ${at.toISOString()}::timestamptz)`;
}

/**
 * What a stored callback changes in the contact's stream (launch D77, WC-1 statuses, WC-3
 * replies), on a handle pinned to one organization's context.
 *
 * @remarks
 * - **Algorithm:** a delivery report moves its message (matched by Meta's id) forward only —
 *   `sent` → `delivered` → `read`, or `failed` with the reason; a reply becomes a received entry
 *   (deduplicated by Meta's id) with the contact's activity times; an unknown WhatsApp number
 *   becomes a new contact with an open lead (source `whatsapp`).
 * - **Failure modes:** database errors propagate (the update's try is counted).
 */
export class ContactMessagingInboundRepository {
  constructor(private readonly databaseHandle: WorkerDatabaseHandle) {}

  /** The organization's internal id, or `null` when it is gone. */
  async findOrganizationId(organizationPublicId: string): Promise<number | null> {
    const rows = await this.databaseHandle
      .select({ id: organizations.id })
      .from(organizations)
      .where(
        and(eq(organizations.public_id, organizationPublicId), isNull(organizations.deleted_at)),
      )
      .limit(1);
    return rows[0]?.id ?? null;
  }

  /** Moves a sent message forward on a delivery report; answers whether one moved. */
  async advanceDeliveryStatus(options: {
    organizationId: number;
    providerMessageId: string;
    status: InboundDeliveryStatus;
    at: Date;
    failureReason?: string;
  }): Promise<boolean> {
    const { status, at } = options;
    const atValue = sql`${at.toISOString()}::timestamptz`;
    const updated = await this.databaseHandle
      .update(contact_activities)
      .set({
        delivery_status: status,
        delivered_at:
          status === 'delivered' || status === 'read'
            ? sql`coalesce(${contact_activities.delivered_at}, ${atValue})`
            : sql`${contact_activities.delivered_at}`,
        read_at:
          status === 'read'
            ? sql`coalesce(${contact_activities.read_at}, ${atValue})`
            : sql`${contact_activities.read_at}`,
        failed_at: status === 'failed' ? atValue : sql`${contact_activities.failed_at}`,
        failure_reason:
          status === 'failed'
            ? (options.failureReason ?? 'Meta could not deliver the message').slice(0, 280)
            : sql`${contact_activities.failure_reason}`,
        delivery_claimed_at: null,
        updated_at: sql`greatest(now(), ${contact_activities.created_at})`,
      } as never)
      .where(
        and(
          eq(contact_activities.organization_id, options.organizationId),
          eq(contact_activities.provider_message_id, options.providerMessageId),
          eq(contact_activities.direction, CONTACT_ACTIVITY_DIRECTION.SENT),
          inArray(contact_activities.delivery_status, [...MOVES_FROM[status]]),
        ),
      )
      .returning({ id: contact_activities.id });
    if (status === 'sent' || status === 'failed') {
      await recordBookingMessageOutcome(this.databaseHandle, {
        contactActivityIds: updated.map((row) => row.id),
        outcome: status,
      });
    }
    return updated.length > 0;
  }

  /**
   * A "yes" from the person (WC-8, D78): their next booking that was asked to confirm — scheduled
   * or confirmed, still ahead, its confirm request or reminder sent — becomes `confirmed`, "Replied
   * Yes" (`is_confirmed_by_reply`). Answers whether one moved.
   */
  async confirmBookingByReply(options: {
    organizationId: number;
    contactId: number;
  }): Promise<boolean> {
    const timeZone = sql`(select coalesce(${organizations.timezone}, 'UTC') from ${organizations} where ${organizations.id} = ${options.organizationId})`;
    const next = sql`(select ${appointments.id} from ${appointments}
      where ${appointments.organization_id} = ${options.organizationId}
        and ${appointments.contact_id} = ${options.contactId}
        and ${appointments.deleted_at} is null
        and ${appointments.status} in ('scheduled', 'confirmed')
        and ${appointments.reminder_status} in ('confirm_requested', 'reminder_queued', 'reminder_sent')
        and ((${appointments.appointment_date} + ${appointments.start_time}) at time zone ${timeZone}) > now()
      order by ${appointments.appointment_date}, ${appointments.start_time}, ${appointments.id}
      limit 1)`;
    const confirmed = await this.databaseHandle
      .update(appointments)
      .set({
        status: 'confirmed',
        is_confirmed_by_reply: true,
        updated_at: sql`greatest(now(), ${appointments.created_at})`,
      } as never)
      .where(eq(appointments.id, next))
      .returning({ id: appointments.id });
    return confirmed.length > 0;
  }

  /** The live contact a number belongs to (its primary first), or `null`. */
  async findContactIdByPhone(options: {
    organizationId: number;
    phone: string;
  }): Promise<number | null> {
    const rows = await this.databaseHandle
      .select({ id: contacts.id })
      .from(contact_phones)
      .innerJoin(contacts, eq(contacts.id, contact_phones.contact_id))
      .where(
        and(
          eq(contact_phones.organization_id, options.organizationId),
          eq(contact_phones.phone, options.phone),
          isNull(contact_phones.deleted_at),
          isNull(contacts.deleted_at),
        ),
      )
      .orderBy(desc(contact_phones.is_primary), desc(contacts.last_activity_at), contacts.id)
      .limit(1);
    return rows[0]?.id ?? null;
  }

  /** The live contact an Instagram sender already wrote as, or `null`. */
  async findContactIdByInstagramSender(options: {
    organizationId: number;
    senderId: string;
  }): Promise<number | null> {
    const rows = await this.databaseHandle
      .select({ id: contact_activities.contact_id })
      .from(contact_activities)
      .innerJoin(contacts, eq(contacts.id, contact_activities.contact_id))
      .where(
        and(
          eq(contact_activities.organization_id, options.organizationId),
          eq(contact_activities.provider_sender_id, options.senderId),
          isNull(contacts.deleted_at),
        ),
      )
      .orderBy(desc(contact_activities.occurred_at), desc(contact_activities.id))
      .limit(1);
    return rows[0]?.id ?? null;
  }

  /** The live contact with this Instagram handle (any case, with or without `@`), or `null`. */
  async findContactIdByInstagramUsername(options: {
    organizationId: number;
    username: string;
  }): Promise<number | null> {
    const rows = await this.databaseHandle
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.organization_id, options.organizationId),
          isNull(contacts.deleted_at),
          sql`exists (select 1 from unnest(${contacts.instagram_handles}) as handle
            where lower(ltrim(handle, '@')) = ${options.username})`,
        ),
      )
      .orderBy(desc(contacts.last_activity_at), contacts.id)
      .limit(1);
    return rows[0]?.id ?? null;
  }

  /**
   * A WhatsApp number nobody has: a new contact with that number and an open lead from WhatsApp
   * (D77, WC-3) — the first name is the WhatsApp profile name, else the number.
   */
  async createContactWithLead(options: {
    organizationId: number;
    phone: string;
    firstName: string;
  }): Promise<number> {
    const created = await this.databaseHandle
      .insert(contacts)
      .values({
        public_id: generatePublicId('contact'),
        organization_id: options.organizationId,
        first_name: options.firstName.slice(0, 60),
        primary_phone: options.phone,
        default_channel: CONTACT_ACTIVITY_TYPE.WHATSAPP,
      } as never)
      .returning({ id: contacts.id, householdContactId: contacts.household_contact_id });
    const contact = created[0]!;
    await this.databaseHandle.insert(contact_phones).values({
      contact_id: contact.id,
      household_contact_id: contact.householdContactId,
      organization_id: options.organizationId,
      phone: options.phone,
      is_primary: true,
    });
    await this.databaseHandle.insert(leads).values({
      public_id: generatePublicId('lead'),
      organization_id: options.organizationId,
      contact_id: contact.id,
      source: 'whatsapp',
    } as never);
    return contact.id;
  }

  /**
   * A message the person sent: a received entry in their stream (once per Meta id — a retried
   * callback adds nothing), with the contact's last activity and last received times.
   */
  async insertReceivedMessage(options: {
    organizationId: number;
    contactId: number;
    type: 'whatsapp' | 'instagram';
    body: string;
    providerMessageId: string;
    providerSenderId?: string;
    occurredAt: Date;
    replyToProviderMessageId?: string;
  }): Promise<boolean> {
    const replyTo = options.replyToProviderMessageId
      ? sql`(select ${contact_activities.id} from ${contact_activities}
          where ${contact_activities.organization_id} = ${options.organizationId}
            and ${contact_activities.provider_message_id} = ${options.replyToProviderMessageId}
            and ${contact_activities.contact_id} = ${options.contactId}
          limit 1)`
      : null;
    const inserted = await this.databaseHandle
      .insert(contact_activities)
      .values({
        public_id: generatePublicId('contactActivity'),
        organization_id: options.organizationId,
        contact_id: options.contactId,
        type: options.type,
        direction: CONTACT_ACTIVITY_DIRECTION.RECEIVED,
        body: options.body.slice(0, 1000),
        provider_message_id: options.providerMessageId,
        provider_sender_id: options.providerSenderId ?? null,
        occurred_at: options.occurredAt,
        reply_to_contact_activity_id: replyTo,
      } as never)
      .onConflictDoNothing()
      .returning({ id: contact_activities.id });
    if (inserted.length === 0) return false;
    await this.databaseHandle
      .update(contacts)
      .set({
        last_activity_at: latest(contacts.last_activity_at, options.occurredAt),
        last_received_at: latest(contacts.last_received_at, options.occurredAt),
      } as never)
      .where(eq(contacts.id, options.contactId));
    return true;
  }
}

/** Worker-only factory — a handle pinned to one organization's context (D77). */
export function createWorkerContactMessagingInboundRepository(
  databaseHandle: WorkerDatabaseHandle,
): ContactMessagingInboundRepository {
  assertWorkerDatabaseContext(['organization']);
  return new ContactMessagingInboundRepository(databaseHandle);
}

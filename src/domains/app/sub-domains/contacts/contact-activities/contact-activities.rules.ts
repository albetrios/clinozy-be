import { toText } from '@/shared/utils/validation/record-fields.util.js';
import {
  type BaseRecordRow,
  findMembershipIdOfUser,
  resolveRecordIds,
} from '@/domains/app/base-record.repository.js';
import { requireConfirmedUploads } from '@/domains/app/base-record.service.js';
import type { BaseRecordRules, BaseRecordWriteContext } from '@/domains/app/base-record.types.js';
import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import { ContactsRepository } from '@/domains/app/sub-domains/contacts/contacts.repository.js';
import { contacts } from '@/domains/app/sub-domains/contacts/contacts.schema.js';
import { ContactMessageTemplatesRepository } from '@/domains/app/sub-domains/contacts/contact-message-templates/contact-message-templates.repository.js';
import { LEAD_INTEREST_LABELS } from '@/domains/app/sub-domains/leads/leads.constants.js';
import { LeadsRepository } from '@/domains/app/sub-domains/leads/leads.repository.js';
import { requestTaskRulesRun } from '@/domains/app/sub-domains/tasks/queues/task-rules.queue.js';
import { runEnqueueAfterCommit } from '@/core/events/event-bus.js';
import { fieldValidationError } from '@/shared/errors/index.js';
import {
  CONTACT_ACTIVITY_BODY_MAX,
  CONTACT_ACTIVITY_DELIVERY_STATUS,
  CONTACT_ACTIVITY_DIRECTION,
  CONTACT_ACTIVITY_MESSAGE_TYPE_VALUES,
  CONTACT_ACTIVITY_PLACEHOLDER,
  CONTACT_ACTIVITY_TYPE,
  type ContactActivityLinkColumn,
} from './contact-activities.constants.js';
import type { ContactActivitiesRepository } from './contact-activities.repository.js';
import { validateContactMessageBatch } from './contact-activities.validator.js';

/** The read gate of each record link today (M10, D63) — an entry linked to one the caller cannot read is hidden. */
const LINK_READ_PERMISSIONS: Readonly<Record<ContactActivityLinkColumn, string>> = {
  appointment_id: APP_PERMISSIONS.APPOINTMENT_READ,
  invoice_id: APP_PERMISSIONS.PAYMENT_READ,
  payment_id: APP_PERMISSIONS.PAYMENT_READ,
  patient_prescription_id: APP_PERMISSIONS.PATIENT_PRESCRIPTION_READ,
  patient_offering_id: APP_PERMISSIONS.PATIENT_READ,
  patient_review_id: APP_PERMISSIONS.PATIENT_READ,
  patient_check_in_id: APP_PERMISSIONS.PATIENT_READ,
  task_id: APP_PERMISSIONS.TASK_READ,
  patient_treatment_id: APP_PERMISSIONS.PATIENT_TREATMENT_READ,
  patient_clinical_note_id: APP_PERMISSIONS.PATIENT_CLINICAL_RECORD_READ,
  patient_image_id: APP_PERMISSIONS.PATIENT_CLINICAL_RECORD_READ,
  patient_report_id: APP_PERMISSIONS.PATIENT_CLINICAL_RECORD_READ,
};

/** The channel a sent entry leaves on its contact (CT4, D65): its own type, or `call` for a call. */
function channelOf(type: string): string | null {
  if ((CONTACT_ACTIVITY_MESSAGE_TYPE_VALUES as readonly string[]).includes(type)) return type;
  return type === CONTACT_ACTIVITY_TYPE.CALL_LOG ? 'call' : null;
}

/**
 * Fills a message's placeholders for one contact (M9, D64): `<first>` with the first name,
 * `<interest>` with the label of the open lead's first interest (empty without one) — 400 on
 * `body` when the filled text runs over 1000.
 */
function fillPlaceholders({
  body,
  contact,
  interest,
}: {
  body: string;
  contact: BaseRecordRow | null;
  interest: string | null;
}): string {
  const interestLabel =
    interest === null
      ? ''
      : (LEAD_INTEREST_LABELS[interest as keyof typeof LEAD_INTEREST_LABELS] ?? interest);
  const filled = body
    .replaceAll(CONTACT_ACTIVITY_PLACEHOLDER.FIRST_NAME, toText(contact?.first_name))
    .replaceAll(CONTACT_ACTIVITY_PLACEHOLDER.INTEREST, interestLabel);
  if (filled.length > CONTACT_ACTIVITY_BODY_MAX) {
    throw fieldValidationError({
      field: 'body',
      messageKey: 'errors:validation.contactActivityBodyTooLong',
    });
  }
  return filled;
}

/**
 * After the write commits, asks for the organization's task rules run (D81 T7, WC-48) — a message
 * or a call moves the contact's last sent / received time, so the `reply` and `failed_message`
 * tasks open or close at once rather than at the next sweep; never fails the write.
 */
async function scheduleTaskRules(context: BaseRecordWriteContext): Promise<void> {
  const { organizationPublicId } = context.scope;
  await runEnqueueAfterCommit(() => requestTaskRulesRun(organizationPublicId));
}

/** M9's batch check: every contact named is a live one of the organization — 400 naming the rest. */
function assertBatchContacts({
  publicIds,
  found,
}: {
  publicIds: readonly string[];
  found: ReadonlyMap<string, number>;
}): void {
  const missing = publicIds.filter((publicId) => !found.has(publicId));
  if (missing.length > 0) {
    throw fieldValidationError({
      field: 'contact_ids',
      messageKey: 'errors:validation.recordReferenceNotFound',
      messageParams: { id: missing.join(', '), label: 'contact' },
    });
  }
}

/** WC-16 (D79): whoever wrote the entry worked the person — involved in their open lead. */
async function involveAuthor({
  leads,
  row,
  context,
}: {
  leads: LeadsRepository;
  row: BaseRecordRow;
  context: BaseRecordWriteContext;
}): Promise<void> {
  if (typeof row.author_membership_id !== 'number') return;
  await leads.involveInOpenLead({
    organizationId: context.organizationId,
    contactId: row.contact_id as number,
    membershipId: row.author_membership_id,
    userId: context.userId,
  });
}

/**
 * The contact activity rules (launch ROUTE #130, routes-final 4.C): what every entry checks and
 * writes, whichever route makes it (M6, M7, M9, M10).
 *
 * @remarks
 * - **Algorithm:** a sent message, a call the team made or received, and a note carry the caller as
 *   author — a received entry and a system entry none. A template must be of the entry's type, every
 *   attachment a confirmed upload of the organization (the upload port), the answered entry one of
 *   the same contact. A message's `<first>` / `<interest>` are filled for its contact (the open
 *   lead's first interest). In the entry's transaction the contact's last activity, last sent /
 *   received time and default channel move (`recordActivity`), and a sent line moves the open lead
 *   from `new` to `contacted`. Reads hide an entry linked to a record the caller cannot read (M10).
 *   `message-batches` writes one queued message per contact the same way. A queued message waits
 *   in the outbox for the messaging service; a message or a call (written, batched or resent) asks
 *   for the task rules run, so a reply closes its `reply` task at once (D81 T7, WC-48).
 * - **Failure modes:** `ValidationError` (400) on `contact_message_template_id`, `attachment_keys`,
 *   `reply_to_contact_activity_id`, `body` (over 1000 once filled) or `contact_ids`.
 */
export function createContactActivitiesRules(
  repository: ContactActivitiesRepository,
): BaseRecordRules {
  const contactsRepository = new ContactsRepository();
  const templatesRepository = new ContactMessageTemplatesRepository();
  const leadsRepository = new LeadsRepository();

  /** Checks an entry's references and fills what the server owns, before the insert. */
  const prepareEntry = async ({
    values,
    context,
  }: {
    values: Record<string, unknown>;
    context: BaseRecordWriteContext;
  }): Promise<void> => {
    const type = String(values.type);
    const isServerOrReceived =
      type === CONTACT_ACTIVITY_TYPE.SYSTEM ||
      values.direction === CONTACT_ACTIVITY_DIRECTION.RECEIVED;
    values.author_membership_id = isServerOrReceived
      ? null
      : await findMembershipIdOfUser({
          organizationId: context.organizationId,
          userId: context.userId,
        });
    if (typeof values.contact_message_template_id === 'number') {
      const template = await templatesRepository.findById(values.contact_message_template_id);
      if (template?.type !== type) {
        throw fieldValidationError({
          field: 'contact_message_template_id',
          messageKey: 'errors:validation.contactActivityTemplateType',
        });
      }
    }
    await requireConfirmedUploads({
      fileKeys: values.attachment_keys as string[] | undefined,
      field: 'attachment_keys',
      context,
    });
    if (typeof values.reply_to_contact_activity_id === 'number') {
      const answered = await repository.findById(values.reply_to_contact_activity_id);
      if (answered?.contact_id !== values.contact_id) {
        throw fieldValidationError({
          field: 'reply_to_contact_activity_id',
          messageKey: 'errors:validation.contactActivityReplyOtherContact',
        });
      }
    }
    if ((CONTACT_ACTIVITY_MESSAGE_TYPE_VALUES as readonly string[]).includes(type)) {
      const contactId = values.contact_id as number;
      values.body = fillPlaceholders({
        body: String(values.body),
        contact: await contactsRepository.findById(contactId),
        interest: await leadsRepository.findOpenLeadInterest(contactId),
      });
    }
  };

  /**
   * The contact's activity times and channel, in the entry's transaction (CT10, M7) — and a sent
   * line (a message, or a call the team made) moves its open lead from `new` to `contacted`
   * (5.10, D40 P21).
   */
  const touchContact = async (entry: BaseRecordRow): Promise<void> => {
    const direction = (entry.direction as string | null) ?? null;
    const contactId = entry.contact_id as number;
    await contactsRepository.recordActivity({
      contactId,
      occurredAt: entry.occurred_at as Date,
      direction,
      channel: direction === CONTACT_ACTIVITY_DIRECTION.SENT ? channelOf(String(entry.type)) : null,
    });
    if (direction === CONTACT_ACTIVITY_DIRECTION.SENT)
      await leadsRepository.markContacted(contactId);
  };

  return {
    readScope: async (can) => {
      const scope: Record<string, readonly unknown[]> = {};
      for (const [column, code] of Object.entries(LINK_READ_PERMISSIONS)) {
        if (!(await can(code))) scope[column] = [null];
      }
      // A private-album photo's entry (P23, PC16)
      if (!(await can(APP_PERMISSIONS.PATIENT_PRIVATE_ALBUM_READ)))
        scope.is_private_photo = [false];
      return scope;
    },
    prepareCreate: (values, context) => prepareEntry({ values, context }),
    afterWrite: async (row, change, context) => {
      if (change.kind === 'create') {
        await touchContact(row);
        await involveAuthor({ leads: leadsRepository, row, context });
      }
      // A message or a call — written, or resent — may open or close a task (D81 T7).
      const movesTasks = change.kind === 'create' || change.kind === 'transition';
      if (movesTasks && typeof row.direction === 'string') await scheduleTaskRules(context);
    },
    collectionActions: {
      'message-batches': async ({ input, context, present, resolveReferences }) => {
        const batch = validateContactMessageBatch(input);
        const contactIds = await resolveRecordIds({
          table: contacts,
          organizationId: context.organizationId,
          publicIds: batch.contact_ids,
        });
        assertBatchContacts({ publicIds: batch.contact_ids, found: contactIds });
        const shared: Record<string, unknown> = {
          contact_message_template_id: batch.contact_message_template_id,
        };
        await resolveReferences(shared);
        const entries: BaseRecordRow[] = [];
        for (const publicId of batch.contact_ids) {
          const values: Record<string, unknown> = {
            contact_id: contactIds.get(publicId),
            type: batch.type,
            direction: CONTACT_ACTIVITY_DIRECTION.SENT,
            delivery_status: CONTACT_ACTIVITY_DELIVERY_STATUS.QUEUED,
            body: batch.body,
            contact_message_template_id: shared.contact_message_template_id ?? null,
          };
          await prepareEntry({ values, context });
          const entry = await repository.insert({
            ...values,
            organization_id: context.organizationId,
            created_by_user_id: context.userId,
            updated_by_user_id: context.userId,
          });
          await touchContact(entry);
          entries.push(entry);
        }
        await scheduleTaskRules(context);
        return present(entries);
      },
    },
  };
}

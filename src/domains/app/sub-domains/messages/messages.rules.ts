import {
  findMembershipIdOfUser,
  resolveRecordIds,
  type BaseRecordRow,
} from '@/domains/app/base-record.repository.js';
import type { BaseRecordRules, BaseRecordWriteContext } from '@/domains/app/base-record.types.js';
import { LeadsRepository } from '@/domains/app/sub-domains/leads/leads.repository.js';
import { leads } from '@/domains/app/sub-domains/leads/leads.schema.js';
import { medical_contacts } from '@/domains/app/sub-domains/medical-contacts/medical-contacts.schema.js';
import { message_templates } from '@/domains/app/sub-domains/message-templates/message-templates.schema.js';
import { patients } from '@/domains/app/sub-domains/patients/patients.schema.js';
import { ValidationError } from '@/shared/errors/index.js';
import { PUBLIC_ID_PREFIXES } from '@/shared/utils/identity/public-id.util.js';

/** Lines that are a log of something already done (a call, a note) — never sent. */
const LOGGED_CHANNELS = new Set(['call', 'note']);
/** Lines that count as reaching a lead — a first one moves a new lead to Contacted (leads.4). */
const CONTACTING_CHANNELS = new Set(['whatsapp', 'instagram', 'call']);

/** The contact column each id prefix fills (`pat_` → `patient_id`). */
const CONTACT_COLUMNS = [
  { prefix: PUBLIC_ID_PREFIXES.patient, column: 'patient_id', table: patients },
  { prefix: PUBLIC_ID_PREFIXES.lead, column: 'lead_id', table: leads },
  {
    prefix: PUBLIC_ID_PREFIXES.medicalContact,
    column: 'medical_contact_id',
    table: medical_contacts,
  },
] as const;

const leadsRepository = new LeadsRepository();

/** The author and delivery state a staff line starts with. */
async function prepareLine(values: Record<string, unknown>, context: BaseRecordWriteContext) {
  values.author_membership_id ??= await findMembershipIdOfUser({
    organizationId: context.organizationId,
    userId: context.userId,
  });
  if (LOGGED_CHANNELS.has(String(values.channel ?? 'whatsapp'))) values.delivery_status = 'sent';
}

/** A line to a lead touches it: last touch now, and a first contact moves a new lead on. */
async function touchLead(line: BaseRecordRow, context: BaseRecordWriteContext): Promise<void> {
  if (typeof line.lead_id !== 'number') return;
  const lead = await leadsRepository.findById(line.lead_id);
  if (!lead) return;
  const contacted =
    lead.status === 'new' &&
    line.direction === 'sent' &&
    CONTACTING_CHANNELS.has(String(line.channel));
  await leadsRepository.update(
    lead.id,
    { last_touch_at: new Date(), ...(contacted ? { status: 'contacted' } : {}) },
    context.userId,
  );
}

/** Each contact id's column and internal id — a 400 naming `contact_ids` for one that is not here. */
async function resolveContacts(
  contactIds: readonly string[],
  organizationId: number,
): Promise<{ column: string; id: number }[]> {
  const resolved: { column: string; id: number }[] = [];
  const missing: string[] = [];
  for (const { prefix, column, table } of CONTACT_COLUMNS) {
    const wanted = contactIds.filter((contactId) => contactId.split('_')[0] === prefix);
    if (wanted.length === 0) continue;
    const ids = await resolveRecordIds({ table, organizationId, publicIds: wanted });
    for (const contactId of wanted) {
      const id = ids.get(contactId);
      if (id === undefined) missing.push(contactId);
      else resolved.push({ column, id });
    }
  }
  missing.push(
    ...contactIds.filter(
      (contactId) => !CONTACT_COLUMNS.some(({ prefix }) => contactId.split('_')[0] === prefix),
    ),
  );
  if (missing.length > 0) {
    throw new ValidationError(
      'errors:validation.recordReferenceNotFound',
      { id: missing.join(', '), label: 'contact' },
      {
        contact_ids: missing.map(
          (contactId) => `${contactId} is not a contact of this organization`,
        ),
      },
    );
  }
  return resolved;
}

/**
 * The conversation rules (launch ROUTE #64, leads.3–4) — one `app.messages` table for every
 * contact (a patient, a lead or a walk-in buyer).
 *
 * @remarks
 * - **Algorithm:** a new line gets the caller as its author; a call or note is logged `sent`, a
 *   WhatsApp, Instagram, SMS or email line starts `queued` (delivery is the messaging worker's,
 *   D32). A line to a lead makes its `last_touch_at` now, and a `new` lead the team reached
 *   (WhatsApp, Instagram, a call) becomes `contacted`. `batches` writes one line per contact id
 *   (`pat_`, `lead_`, `mcon_`) the same way.
 * - **Failure modes:** `ValidationError` naming `contact_ids` for an id that is no contact here.
 */
export const messagesRules: BaseRecordRules = {
  prepareCreate: prepareLine,
  afterWrite: async (row, change, context) => {
    if (change.kind === 'create') await touchLead(row, context);
  },
  collectionActions: {
    batches: async ({ input, context, repository, present }) => {
      const contacts = await resolveContacts(
        (input.contact_ids as string[]) ?? [],
        context.organizationId,
      );
      const templateId =
        typeof input.message_template_id === 'string'
          ? await resolveTemplate(input.message_template_id, context.organizationId)
          : null;
      const lines: BaseRecordRow[] = [];
      for (const { column, id } of contacts) {
        const values: Record<string, unknown> = {
          [column]: id,
          channel: input.channel,
          body: input.body,
          kind: templateId === null ? 'text' : 'template',
          message_template_id: templateId,
        };
        await prepareLine(values, context);
        const line = await repository.insert({
          ...values,
          organization_id: context.organizationId,
          created_by_user_id: context.userId,
          updated_by_user_id: context.userId,
        });
        await touchLead(line, context);
        lines.push(line);
      }
      return present(lines);
    },
  },
};

/** A template's internal id — 400 naming `message_template_id` when it is not here. */
async function resolveTemplate(publicId: string, organizationId: number): Promise<number> {
  const ids = await resolveRecordIds({
    table: message_templates,
    organizationId,
    publicIds: [publicId],
  });
  const id = ids.get(publicId);
  if (id === undefined) {
    throw new ValidationError(
      'errors:validation.recordReferenceNotFound',
      { id: publicId, label: 'message template' },
      { message_template_id: [`${publicId} is not a message template of this organization`] },
    );
  }
  return id;
}

import {
  findMembershipIdOfUser,
  resolveRecordIds,
  type BaseRecordRow,
} from '@/domains/app/base-record.repository.js';
import type { BaseRecordRules, BaseRecordWriteContext } from '@/domains/app/base-record.types.js';
import { LeadsRepository } from '@/domains/app/sub-domains/leads/leads.repository.js';
import { leads } from '@/domains/app/sub-domains/leads/leads.schema.js';
import { ValidationError } from '@/shared/errors/index.js';

/** Lines that are a log of something already done (a call, a note) — never sent. */
const LOGGED_CHANNELS = new Set(['call', 'note']);
/** Lines that count as reaching the lead — a first one moves a new lead to Contacted (leads.4). */
const CONTACTING_CHANNELS = new Set(['whatsapp', 'instagram', 'call']);

const leadsRepository = new LeadsRepository();

/** The author and delivery state a staff line starts with. */
async function prepareLine(values: Record<string, unknown>, context: BaseRecordWriteContext) {
  values.author_membership_id ??= await findMembershipIdOfUser({
    organizationId: context.organizationId,
    userId: context.userId,
  });
  if (LOGGED_CHANNELS.has(String(values.channel ?? 'whatsapp'))) values.delivery_status = 'sent';
}

/** A written line touches its lead: last touch now, and a first contact moves a new lead on. */
async function touchLead(line: BaseRecordRow, context: BaseRecordWriteContext): Promise<void> {
  const lead = await leadsRepository.findById(line.lead_id as number);
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

/**
 * The conversation rules (launch ROUTE #64, leads.3–4): who wrote a line, how it starts, what it
 * does to its lead, and the bulk message.
 *
 * @remarks
 * - **Algorithm:** a new line gets the caller as its author; a call or note is logged `sent`, a
 *   WhatsApp or Instagram line starts `queued` (delivery is the messaging worker's, D32). After
 *   the write the lead's `last_touch_at` is now, and a `new` lead the team reached (WhatsApp,
 *   Instagram, a call) becomes `contacted`. `batches` writes one line per lead the same way.
 * - **Failure modes:** `ValidationError` naming `lead_ids` when one is no lead of the organization.
 */
export const leadMessagesRules: BaseRecordRules = {
  prepareCreate: prepareLine,
  afterWrite: async (row, change, context) => {
    if (change.kind === 'create') await touchLead(row, context);
  },
  collectionActions: {
    batches: async ({ input, context, repository, present }) => {
      const leadIds = (input.lead_ids as string[]) ?? [];
      const ids = await resolveRecordIds({
        table: leads,
        organizationId: context.organizationId,
        publicIds: leadIds,
      });
      const missing = leadIds.filter((publicId) => !ids.has(publicId));
      if (missing.length > 0) {
        throw new ValidationError(
          'errors:validation.recordReferenceNotFound',
          { id: missing.join(', '), label: 'lead' },
          { lead_ids: missing.map((publicId) => `${publicId} is not a lead of this organization`) },
        );
      }
      const lines: BaseRecordRow[] = [];
      for (const leadId of ids.values()) {
        const values: Record<string, unknown> = {
          lead_id: leadId,
          channel: input.channel,
          body: input.body,
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

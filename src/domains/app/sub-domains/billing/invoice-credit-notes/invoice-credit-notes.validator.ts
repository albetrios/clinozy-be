import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { queryInstantRange, splitRecordIds } from '@/shared/utils/validation/record-fields.util.js';
import {
  CreateInvoiceCreditNoteDto,
  type CreateInvoiceCreditNoteInput,
  listInvoiceCreditNotesInternalQueryDto,
} from './invoice-credit-notes.dto.js';

/** Parses a refund body; throws `ValidationError` naming each bad field. */
export function validateCreateInvoiceCreditNote(data: unknown): CreateInvoiceCreditNoteInput {
  return parseWithSchema({ schema: CreateInvoiceCreditNoteDto, data });
}

/** Credit notes are never edited (B16) — there is no change route. */
export function refuseInvoiceCreditNoteUpdate(): Record<string, unknown> {
  throw new Error('credit notes are never edited');
}

/** Parses a credit-note list query into a list input (routes-final 8.B.8 #8, #9). */
export function validateListInvoiceCreditNotesQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema({ schema: listInvoiceCreditNotesInternalQueryDto, data });
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    referenceEquals: {
      invoice_id: query.invoice_id,
    },
    derived: {
      contact_id: query.contact_id,
      branch_ids: query.branch_id === undefined ? undefined : splitRecordIds(query.branch_id),
      visible_branch_ids: query.visible_branch_ids,
    },
    ranges: {
      created_at: queryInstantRange({ from: query.created_from, to: query.created_to }),
    },
  };
}

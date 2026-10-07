import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateCreditNoteDto,
  type CreateCreditNoteInput,
  listCreditNotesQueryDto,
  UpdateCreditNoteDto,
  type UpdateCreditNoteInput,
} from './credit-notes.dto.js';

/** Parses a credit note create body; throws `ValidationError` naming each bad field. */
export function validateCreateCreditNote(data: unknown): CreateCreditNoteInput {
  return parseWithSchema(CreateCreditNoteDto, data);
}

/** Parses a credit note update body; throws `ValidationError` naming each bad field. */
export function validateUpdateCreditNote(data: unknown): UpdateCreditNoteInput {
  return parseWithSchema(UpdateCreditNoteDto, data);
}

/** Parses the `GET /app/credit-notes` query into a list input (filters by column). */
export function validateListCreditNotesQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listCreditNotesQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    referenceEquals: {
      invoice_id: query.invoice_id,
    },
    ranges: {
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}

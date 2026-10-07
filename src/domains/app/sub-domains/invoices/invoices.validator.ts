import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { splitRecordIds } from '@/shared/utils/validation/record-fields.util.js';
import {
  CreateInvoiceDto,
  type CreateInvoiceInput,
  listInvoicesQueryDto,
  UpdateInvoiceDto,
  type UpdateInvoiceInput,
} from './invoices.dto.js';

/** Parses a invoice create body; throws `ValidationError` naming each bad field. */
export function validateCreateInvoice(data: unknown): CreateInvoiceInput {
  return parseWithSchema(CreateInvoiceDto, data);
}

/** Parses a invoice update body; throws `ValidationError` naming each bad field. */
export function validateUpdateInvoice(data: unknown): UpdateInvoiceInput {
  return parseWithSchema(UpdateInvoiceDto, data);
}

/** Parses the `GET /app/invoices` query into a list input (filters by column). */
export function validateListInvoicesQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listInvoicesQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    branchPublicIds: splitRecordIds(query.branch_ids),
    equals: {
      type: query.type,
    },
    referenceEquals: {
      branch_id: query.branch_id,
      patient_id: query.patient_id,
    },
    ranges: {
      invoice_date: { from: query.invoice_date_from, to: query.invoice_date_to },
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}

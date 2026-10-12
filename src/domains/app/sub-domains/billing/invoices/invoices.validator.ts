import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  addDaysToCalendarDate,
  splitRecordIds,
} from '@/shared/utils/validation/record-fields.util.js';
import {
  CreateInvoiceDto,
  type CreateInvoiceInput,
  listInvoicesQueryDto,
  PreviewInvoiceChangeDto,
  type PreviewInvoiceChangeInput,
  PreviewInvoiceDto,
  type PreviewInvoiceInput,
  UpdateInvoiceDto,
  type UpdateInvoiceInput,
} from './invoices.dto.js';

/** A query instant as a `Date` (undefined when absent). */
function readInstant(value: string | undefined): Date | undefined {
  return value === undefined ? undefined : new Date(value);
}

/** Parses an invoice create body; throws `ValidationError` naming each bad field. */
export function validateCreateInvoice(data: unknown): CreateInvoiceInput {
  return parseWithSchema({ schema: CreateInvoiceDto, data });
}

/** Parses an invoice change body; throws `ValidationError` naming each bad field. */
export function validateUpdateInvoice(data: unknown): UpdateInvoiceInput {
  return parseWithSchema({ schema: UpdateInvoiceDto, data });
}

/** Parses an invoice preview body (a bill without "Paid now"); throws `ValidationError` naming each bad field. */
export function validatePreviewInvoice(data: unknown): PreviewInvoiceInput {
  return parseWithSchema({ schema: PreviewInvoiceDto, data });
}

/** Parses a change preview body (any change field, none required); throws `ValidationError` naming each bad field. */
export function validatePreviewInvoiceChange(data: unknown): PreviewInvoiceChangeInput {
  return parseWithSchema({ schema: PreviewInvoiceChangeDto, data: data ?? {} });
}

/** Parses the invoice list query into a list input (routes-final 8.A.8 #1, #2). */
export function validateListInvoicesQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema({ schema: listInvoicesQueryDto, data });
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    equals: {
      type: query.type?.split(','),
      payment_status: query.payment_status?.split(','),
    },
    referenceEquals: {
      contact_id: query.contact_id,
    },
    linkEquals: {
      member_ids: query.member_id,
    },
    branchPublicIds: query.branch_id === undefined ? undefined : splitRecordIds(query.branch_id),
    derived: {
      patient_id: query.patient_id,
    },
    ranges: {
      invoice_date: {
        from: query.invoice_date_from,
        to:
          query.invoice_date_to === undefined
            ? undefined
            : addDaysToCalendarDate({ date: query.invoice_date_to, days: 1 }),
      },
      created_at: { from: readInstant(query.created_from), to: readInstant(query.created_to) },
    },
  };
}

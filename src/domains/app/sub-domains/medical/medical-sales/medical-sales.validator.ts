import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { queryInstantRange, splitRecordIds } from '@/shared/utils/validation/record-fields.util.js';
import {
  CreateMedicalSaleDto,
  type CreateMedicalSaleInput,
  listMedicalSalesQueryDto,
} from './medical-sales.dto.js';
import { deletedRowsForStatuses } from './medical-sales.constants.js';

/** Parses a sale body; throws `ValidationError` naming each bad field. */
export function validateCreateMedicalSale(data: unknown): CreateMedicalSaleInput {
  return parseWithSchema({ schema: CreateMedicalSaleDto, data });
}

/** A sale is never edited (MD19 — "changed by a return") — there is no change route. */
export function refuseMedicalSaleUpdate(): Record<string, unknown> {
  throw new Error('medical sales are never edited');
}

/** Parses the Sales tab's (and CSV's) query into a list input (routes-final 11.H.8 #44). */
export function validateListMedicalSalesQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema({ schema: listMedicalSalesQueryDto, data });
  const statuses = query.status?.split(',');
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    referenceEquals: {
      contact_id: query.contact_id,
      patient_prescription_id: query.patient_prescription_id,
    },
    branchPublicIds: query.branch_id === undefined ? undefined : splitRecordIds(query.branch_id),
    ranges: {
      created_at: queryInstantRange({ from: query.created_from, to: query.created_to }),
    },
    derived: { status: statuses, medicine_id: query.medicine_id },
    deletedRows: deletedRowsForStatuses(statuses),
  };
}

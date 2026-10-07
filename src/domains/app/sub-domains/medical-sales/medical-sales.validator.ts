import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import {
  CreateMedicalSaleDto,
  type CreateMedicalSaleInput,
  listMedicalSalesQueryDto,
  UpdateMedicalSaleDto,
  type UpdateMedicalSaleInput,
} from './medical-sales.dto.js';

/** Parses a medical sale create body; throws `ValidationError` naming each bad field. */
export function validateCreateMedicalSale(data: unknown): CreateMedicalSaleInput {
  return parseWithSchema(CreateMedicalSaleDto, data);
}

/** Parses a medical sale update body; throws `ValidationError` naming each bad field. */
export function validateUpdateMedicalSale(data: unknown): UpdateMedicalSaleInput {
  return parseWithSchema(UpdateMedicalSaleDto, data);
}

/** Parses the `GET /app/medical-sales` query into a list input (filters by column). */
export function validateListMedicalSalesQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema(listMedicalSalesQueryDto, data);
  return {
    after: query.after,
    limit: query.limit,
    q: query.q,
    sort: query.sort,
    order: query.order,
    equals: {
      status: query.status,
    },
    referenceEquals: {
      patient_id: query.patient_id,
      medical_contact_id: query.medical_contact_id,
    },
    ranges: {
      created_at: {
        from: query.created_from === undefined ? undefined : new Date(query.created_from),
        to: query.created_to === undefined ? undefined : new Date(query.created_to),
      },
    },
  };
}

import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { queryInstantRange } from '@/shared/utils/validation/record-fields.util.js';
import {
  listPatientOfferingsQueryDto,
  UpdatePatientOfferingDto,
  type UpdatePatientOfferingInput,
} from './patient-offerings.dto.js';

/** Parses a patient offering update body; throws `ValidationError` naming each bad field. */
export function validateUpdatePatientOffering(data: unknown): UpdatePatientOfferingInput {
  return parseWithSchema({ schema: UpdatePatientOfferingDto, data });
}

/** No create route — a patient offering is bought only by invoicing it (PK4, sub-domain 8). */
export function refusePatientOfferingCreate(): Record<string, unknown> {
  throw new Error('patient offerings are created by their invoice');
}

/** Parses a patient's bought offerings query into a list input (routes-final 7.L.8 #65). */
export function validateListPatientOfferingsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema({ schema: listPatientOfferingsQueryDto, data });
  return {
    after: query.after,
    limit: query.limit,
    sort: query.sort,
    order: query.order,
    referenceEquals: {
      offering_id: query.offering_id,
    },
    derived: {
      status: query.status?.split(','),
      is_package: query.is_package === undefined ? undefined : query.is_package === 'true',
    },
    ranges: {
      created_at: queryInstantRange({ from: query.created_from, to: query.created_to }),
    },
  };
}

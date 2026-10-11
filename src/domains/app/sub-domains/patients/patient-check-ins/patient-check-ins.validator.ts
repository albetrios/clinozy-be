import type { BaseRecordListInput } from '@/domains/app/base-record.types.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { addDaysToCalendarDate } from '@/shared/utils/validation/record-fields.util.js';
import {
  CreatePatientCheckInDto,
  type CreatePatientCheckInInput,
  listPatientCheckInsQueryDto,
  UpdatePatientCheckInDto,
  type UpdatePatientCheckInInput,
} from './patient-check-ins.dto.js';

/** A query instant as a `Date` (undefined when absent). */
function readInstant(value: string | undefined): Date | undefined {
  return value === undefined ? undefined : new Date(value);
}

/** Parses a check-in create body; throws `ValidationError` naming each bad field. */
export function validateCreatePatientCheckIn(data: unknown): CreatePatientCheckInInput {
  return parseWithSchema({ schema: CreatePatientCheckInDto, data });
}

/** Parses a check-in update body; throws `ValidationError` naming each bad field. */
export function validateUpdatePatientCheckIn(data: unknown): UpdatePatientCheckInInput {
  return parseWithSchema({ schema: UpdatePatientCheckInDto, data });
}

/** Parses a patient's check-ins query into a list input (routes-final 7.I.8 #51). */
export function validateListPatientCheckInsQuery(data: unknown): BaseRecordListInput {
  const query = parseWithSchema({ schema: listPatientCheckInsQueryDto, data });
  return {
    after: query.after,
    limit: query.limit,
    sort: query.sort,
    order: query.order,
    equals: {
      feel: query.feel?.split(','),
    },
    referenceEquals: {
      patient_treatment_id: query.patient_treatment_id,
      appointment_id: query.appointment_id,
    },
    derived: {
      needs_action: query.needs_action === undefined ? undefined : query.needs_action === 'true',
    },
    ranges: {
      check_in_date: {
        from: query.check_in_date_from,
        to:
          query.check_in_date_to === undefined
            ? undefined
            : addDaysToCalendarDate({ date: query.check_in_date_to, days: 1 }),
      },
      created_at: { from: readInstant(query.created_from), to: readInstant(query.created_to) },
    },
  };
}

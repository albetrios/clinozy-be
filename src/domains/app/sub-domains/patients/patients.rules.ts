import { resolveRecordIds } from '@/domains/app/base-record.repository.js';
import type { BaseRecordRules } from '@/domains/app/base-record.types.js';
import { AppointmentsRepository } from '@/domains/app/sub-domains/appointments/appointments.repository.js';
import { calendarDateInTimeZone } from '@/shared/utils/validation/record-fields.util.js';
import { patients } from './patients.schema.js';

/** Appointments that were a visit. */
const VISITED = ['checked_in', 'completed'];
/** Appointments still to come. */
const UPCOMING = ['scheduled', 'confirmed'];

const appointmentsRepository = new AppointmentsRepository();

/**
 * The patients rules (launch ROUTE #65, patients.1): each patient read carries the last visit
 * and the next booked visit — one GROUP BY per figure for the whole page.
 *
 * @remarks
 * - **Algorithm:** `last_visit_on` = the latest checked-in or completed appointment date;
 *   `next_visit_on` = the earliest scheduled or confirmed appointment on or after the
 *   organization's today (D41).
 */
export const patientsRules: BaseRecordRules = {
  decorate: async (outputs, context) => {
    const ids = await resolveRecordIds({
      table: patients,
      organizationId: context.organizationId,
      publicIds: outputs.map((output) => String(output.id)),
    });
    const groupIds = [...ids.values()];
    const last = await appointmentsRepository.aggregatePerGroup({
      organizationId: context.organizationId,
      groupColumn: 'patient_id',
      groupIds,
      valueColumn: 'appointment_date',
      aggregate: 'max',
      equals: { status: VISITED },
    });
    const { timezone } = await context.ports.organizationSettings(context.scope);
    const today = calendarDateInTimeZone(timezone);
    const upcoming = await appointmentsRepository.aggregatePerGroup({
      organizationId: context.organizationId,
      groupColumn: 'patient_id',
      groupIds,
      valueColumn: 'appointment_date',
      aggregate: 'min',
      equals: { status: UPCOMING },
      ranges: { appointment_date: { from: today } },
    });
    for (const output of outputs) {
      const id = ids.get(String(output.id));
      const lastVisit = id === undefined ? undefined : last.get(id);
      const nextVisit = id === undefined ? undefined : upcoming.get(id);
      output.last_visit_on = lastVisit ? String(lastVisit) : null;
      output.next_visit_on = nextVisit ? String(nextVisit) : null;
    }
  },
};

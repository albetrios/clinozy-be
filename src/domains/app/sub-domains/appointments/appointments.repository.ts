import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { appointments } from './appointments.schema.js';

/** Persistence for `app.appointments` — the shared app record reads and writes, on its table. */
export class AppointmentsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: appointments,
      entity: 'appointment',
      searchColumns: ['service_label'],
      numberColumn: 'appointment_number',
      sortColumns: { created_at: 'created_at', appointment_date: 'text' },
      defaultSort: 'appointment_date',
      defaultOrder: 'asc',
    });
  }
}

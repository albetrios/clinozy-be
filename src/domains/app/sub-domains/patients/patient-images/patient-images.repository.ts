import { and, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { appointments } from '@/domains/app/sub-domains/appointments/appointments.schema.js';
import { patient_images } from './patient-images.schema.js';

/**
 * Persistence for `app.patient_images` (launch ROUTE #133, routes-final 7.F) — the shared app record
 * reads and writes on its table, plus the album counts and the visits' service labels (P26).
 *
 * @remarks
 * - **Algorithm:** `q` on the display name and file name; sorts `taken_on` (newest first — the
 *   `(patient_id, album, taken_on DESC, id)` index) and `created_at`; the derived `has_appointment`
 *   filter ("Not attached to a visit").
 */
export class PatientImagesRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: patient_images,
      entity: 'patientImage',
      searchColumns: ['display_name', 'file_name'],
      sortColumns: { created_at: 'created_at', taken_on: 'text' },
      derivedFilters: {
        has_appointment: (value) =>
          value === true
            ? sql`${patient_images.appointment_id} is not null`
            : sql`${patient_images.appointment_id} is null`,
      },
      defaultSort: 'taken_on',
      defaultOrder: 'desc',
    });
  }

  /** A patient's live photos per album (the tab counts, P26). */
  async countLiveByAlbum(patientId: number): Promise<Map<string, number>> {
    const rows = await getRequestDatabase()
      .select({ album: patient_images.album, total: count() })
      .from(patient_images)
      .where(and(eq(patient_images.patient_id, patientId), isNull(patient_images.deleted_at)))
      .groupBy(patient_images.album);
    return new Map(rows.map((row) => [row.album, Number(row.total)]));
  }

  /** The service label of each visit, by the appointments' public ids (a photo's date group, P26). */
  async findServiceLabels(appointmentPublicIds: readonly string[]): Promise<Map<string, string>> {
    if (appointmentPublicIds.length === 0) return new Map();
    const rows = await getRequestDatabase()
      .select({ public_id: appointments.public_id, service_label: appointments.service_label })
      .from(appointments)
      .where(inArray(appointments.public_id, [...appointmentPublicIds]));
    return new Map(rows.map((row) => [row.public_id, row.service_label]));
  }
}

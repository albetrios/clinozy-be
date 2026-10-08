import { APP_PERMISSIONS } from '@/domains/app/app.permissions.js';
import {
  type BaseRecordRepository,
  type BaseRecordRow,
  resolveRecordIds,
} from '@/domains/app/base-record.repository.js';
import type { BaseRecordActionInput, BaseRecordRules } from '@/domains/app/base-record.types.js';
import { AppointmentsRepository } from '@/domains/app/sub-domains/appointments/appointments.repository.js';
import { CheckInsRepository } from '@/domains/app/sub-domains/check-ins/check-ins.repository.js';
import { InvoicesRepository } from '@/domains/app/sub-domains/invoices/invoices.repository.js';
import { PatientClinicalNotesRepository } from '@/domains/app/sub-domains/patient-clinical-notes/patient-clinical-notes.repository.js';
import { patientImagesRules } from '@/domains/app/sub-domains/patient-images/patient-images.rules.js';
import { PatientImagesRepository } from '@/domains/app/sub-domains/patient-images/patient-images.repository.js';
import { PatientNotesRepository } from '@/domains/app/sub-domains/patient-notes/patient-notes.repository.js';
import { PatientPackagesRepository } from '@/domains/app/sub-domains/patient-packages/patient-packages.repository.js';
import { PatientReportsRepository } from '@/domains/app/sub-domains/patient-reports/patient-reports.repository.js';
import { PaymentsRepository } from '@/domains/app/sub-domains/payments/payments.repository.js';
import { PrescriptionsRepository } from '@/domains/app/sub-domains/prescriptions/prescriptions.repository.js';
import { TreatmentsRepository } from '@/domains/app/sub-domains/treatments/treatments.repository.js';
import { VisitsRepository } from '@/domains/app/sub-domains/visits/visits.repository.js';
import { calendarDateInTimeZone } from '@/shared/utils/validation/record-fields.util.js';
import { patients } from './patients.schema.js';

/** Appointments that were a visit. */
const VISITED = ['checked_in', 'completed'];
/** Appointments still to come. */
const UPCOMING = ['scheduled', 'confirmed'];

const appointmentsRepository = new AppointmentsRepository();

/** The timeline's filter groups (the History tabs). */
type TimelineGroup = 'clinical' | 'money' | 'messages';
/** Entries a timeline page answers with when the caller names no limit. */
const DEFAULT_TIMELINE_LIMIT = 30;
/** The longest a message body runs in a timeline entry. */
const TIMELINE_BODY_LENGTH = 140;

/** One kind of record the timeline merges: where it lives, who may read it, what it shows. */
interface TimelineSource {
  kind: string;
  group: TimelineGroup;
  repository: BaseRecordRepository;
  /** The read code a caller needs to see this kind. */
  permission: string;
  /** The scalar columns the entry carries (never an internal id). */
  fields: readonly string[];
}

/** Every kind the timeline merges, newest first by when it was recorded. */
const TIMELINE_SOURCES: readonly TimelineSource[] = [
  {
    kind: 'visit',
    group: 'clinical',
    repository: new VisitsRepository(),
    permission: APP_PERMISSIONS.APPOINTMENT_READ,
    fields: ['stage', 'started_at', 'completed_at'],
  },
  {
    kind: 'treatment',
    group: 'clinical',
    repository: new TreatmentsRepository(),
    permission: APP_PERMISSIONS.TREATMENT_READ,
    fields: ['name', 'session_number', 'status', 'performed_at'],
  },
  {
    kind: 'prescription',
    group: 'clinical',
    repository: new PrescriptionsRepository(),
    permission: APP_PERMISSIONS.PRESCRIPTION_READ,
    fields: ['prescription_number', 'status', 'prescription_date'],
  },
  {
    kind: 'check_in',
    group: 'clinical',
    repository: new CheckInsRepository(),
    permission: APP_PERMISSIONS.PATIENT_READ,
    fields: ['feel', 'score', 'context', 'check_in_date'],
  },
  {
    kind: 'package',
    group: 'clinical',
    repository: new PatientPackagesRepository(),
    permission: APP_PERMISSIONS.PATIENT_READ,
    fields: ['sessions_total', 'sessions_used', 'valid_until'],
  },
  {
    kind: 'report',
    group: 'clinical',
    repository: new PatientReportsRepository(),
    permission: APP_PERMISSIONS.PATIENT_READ,
    fields: ['name', 'type', 'report_date'],
  },
  {
    kind: 'image',
    group: 'clinical',
    repository: new PatientImagesRepository(),
    permission: APP_PERMISSIONS.CLINICAL_RECORD_READ,
    fields: ['album', 'file_name', 'body_part', 'taken_on'],
  },
  {
    kind: 'note',
    group: 'clinical',
    repository: new PatientNotesRepository(),
    permission: APP_PERMISSIONS.PATIENT_READ,
    fields: ['body'],
  },
  {
    kind: 'clinical_note',
    group: 'clinical',
    repository: new PatientClinicalNotesRepository(),
    permission: APP_PERMISSIONS.CLINICAL_RECORD_READ,
    fields: ['kind', 'text', 'added_at'],
  },
  {
    kind: 'invoice',
    group: 'money',
    repository: new InvoicesRepository(),
    permission: APP_PERMISSIONS.INVOICE_READ,
    fields: ['invoice_number', 'type', 'invoice_date'],
  },
  {
    kind: 'payment',
    group: 'money',
    repository: new PaymentsRepository(),
    permission: APP_PERMISSIONS.PAYMENT_READ,
    fields: ['payment_number', 'direction', 'kind', 'amount', 'paid_at'],
  },
];

/** A timeline entry's field value as the API speaks it (instants as ISO, bodies shortened). */
function timelineValue(field: string, value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (field === 'amount' && value !== null) return Number(value);
  if (field === 'body' && typeof value === 'string' && value.length > TIMELINE_BODY_LENGTH) {
    return `${value.slice(0, TIMELINE_BODY_LENGTH - 1)}…`;
  }
  return value;
}

/**
 * The patient's merged history, newest first (RC-39; also the activity column, RC-167): one
 * keyset read per kind the caller may see, merged and cut to the page.
 */
async function timeline({ existing, input, context, visibility }: BaseRecordActionInput) {
  const can = visibility?.can ?? (async () => true);
  const group = (input.group as TimelineGroup | 'all' | undefined) ?? 'all';
  const limit = Number(input.limit ?? DEFAULT_TIMELINE_LIMIT);
  const before = typeof input.before === 'string' ? new Date(input.before) : undefined;
  const imageScope = await patientImagesRules.readScope?.(can);
  const rows: { source: TimelineSource; row: BaseRecordRow }[] = [];
  for (const source of TIMELINE_SOURCES) {
    if (group !== 'all' && source.group !== group) continue;
    if (!(await can(source.permission))) continue;
    const page = await source.repository.list(context.organizationId, {
      limit,
      sort: 'created_at',
      order: 'desc',
      equals: { patient_id: existing.id, ...(source.kind === 'image' ? imageScope : {}) },
      ...(before ? { ranges: { created_at: { to: before } } } : {}),
      withTotal: false,
    });
    for (const row of page.items) rows.push({ source, row });
  }
  rows.sort((left, right) => {
    const byTime =
      (right.row.created_at as Date).getTime() - (left.row.created_at as Date).getTime();
    return byTime !== 0 ? byTime : right.row.id - left.row.id;
  });
  const items = rows.slice(0, limit).map(({ source, row }) => ({
    kind: source.kind,
    group: source.group,
    id: row.public_id,
    at: (row.created_at as Date).toISOString(),
    fields: Object.fromEntries(
      source.fields.map((field) => [field, timelineValue(field, row[field])]),
    ),
  }));
  return {
    items,
    next_before: rows.length > limit ? (items[items.length - 1]?.at ?? null) : null,
  };
}

/**
 * The patients rules (launch ROUTE #65, patients.1): each patient read carries the last visit
 * and the next booked visit — one GROUP BY per figure for the whole page.
 *
 * @remarks
 * - **Algorithm:** `last_visit_on` = the latest checked-in or completed appointment date;
 *   `next_visit_on` = the earliest scheduled or confirmed appointment on or after the
 *   organization's today (D41). The `timeline` view merges every kind of record the caller may
 *   read (visits, sessions, prescriptions, check-ins, packages, reports, photos, notes, bills,
 *   payments, messages) newest first, a Private photo only for its holders.
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
  views: { timeline },
};

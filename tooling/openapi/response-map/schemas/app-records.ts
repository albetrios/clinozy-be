/** OpenAPI response schemas — the app record tables (launch iteration, generated from the table specs). */
import {
  PAYMENT_EDIT_RECORDED_FIELDS,
  PAYMENT_EXPENSE_CATEGORY_VALUES,
  PAYMENT_MODE_VALUES,
} from '@/domains/app/sub-domains/billing/payments/payments.constants.js';
import { LEAD_STATUS_VALUES } from '@/domains/app/sub-domains/leads/leads.constants.js';
import {
  TASK_DONE_BY_CLINOZY,
  TASK_NO_ANSWER_SNOOZE_HOURS,
  TASK_RULE_VALUES,
} from '@/domains/app/sub-domains/tasks/tasks.constants.js';

/** `BaseRecordExportOutput` — a list as a CSV file in the JSON envelope (`GET /app/<module>/exports`). */
export const recordExportSchema = {
  type: 'object',
  properties: {
    file_name: {
      type: 'string',
      example: 'leads-2026-10-07.csv',
    },
    content_type: {
      type: 'string',
      enum: ['text/csv'],
    },
    row_count: {
      type: 'integer',
    },
    is_truncated: {
      type: 'boolean',
      description: 'More rows matched than the 5,000 a download carries',
    },
    content: {
      type: 'string',
      description:
        "The CSV text (RFC 4180, CRLF): a header of the list rows' fields, in their order, then one line per row. A null is an empty cell; an object is its JSON text in one cell (a task's `contact`); a list is its items joined with `|`, an object item as its JSON (a task's `owner_changes`); a cell that starts like a formula (`=`, `+`, `-`, `@`) is prefixed with `'`",
    },
  },
};

/** Example `BaseRecordExportOutput`. */
export const recordExportExample = {
  file_name: 'leads-2026-10-07.csv',
  content_type: 'text/csv',
  row_count: 1,
  is_truncated: false,
  content: 'id,name\r\nlead_k7x9m2pqr4w8n1v3a1b2c,Riya Shah\r\n',
};

/** `OfferingGroupOutput`. */
export const offeringGroupsRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'ogr_k7x9m2pqr4w8n1v3a1b2c',
    },
    name: {
      type: 'string',
    },
    sort_order: {
      type: 'integer',
    },
    created_at: {
      type: 'string',
      format: 'date-time',
    },
    updated_at: {
      type: 'string',
      format: 'date-time',
    },
  },
};

/** Example `OfferingGroupOutput`. */
export const offeringGroupsRecordExample = {
  id: 'ogr_k7x9m2pqr4w8n1v3a1b2c',
  name: 'Sample name',
  sort_order: 1,
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `BranchRoomOutput`. */
export const roomsRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'room_k7x9m2pqr4w8n1v3a1b2c',
    },
    branch_id: {
      type: 'string',
    },
    name: {
      type: 'string',
    },
    is_active: {
      type: 'boolean',
    },
    created_at: {
      type: 'string',
      format: 'date-time',
    },
    updated_at: {
      type: 'string',
      format: 'date-time',
    },
  },
};

/** Example `BranchRoomOutput`. */
export const roomsRecordExample = {
  id: 'room_k7x9m2pqr4w8n1v3a1b2c',
  branch_id: 'bra_k7x9m2pqr4w8n1v3a1b2c',
  name: 'Sample name',
  is_active: true,
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `BranchMachineOutput`. */
export const machinesRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'mach_k7x9m2pqr4w8n1v3a1b2c',
    },
    branch_id: {
      type: 'string',
    },
    name: {
      type: 'string',
    },
    is_active: {
      type: 'boolean',
    },
    created_at: {
      type: 'string',
      format: 'date-time',
    },
    updated_at: {
      type: 'string',
      format: 'date-time',
    },
  },
};

/** Example `BranchMachineOutput`. */
export const machinesRecordExample = {
  id: 'mach_k7x9m2pqr4w8n1v3a1b2c',
  branch_id: 'bra_k7x9m2pqr4w8n1v3a1b2c',
  name: 'Sample name',
  is_active: true,
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `BranchHolidayOutput`. */
export const branchHolidaysRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'bhol_k7x9m2pqr4w8n1v3a1b2c',
    },
    branch_id: {
      type: 'string',
    },
    holiday_date: {
      type: 'string',
      format: 'date',
    },
    label: {
      type: 'string',
    },
    created_at: {
      type: 'string',
      format: 'date-time',
    },
    updated_at: {
      type: 'string',
      format: 'date-time',
    },
  },
};

/** Example `BranchHolidayOutput`. */
export const branchHolidaysRecordExample = {
  id: 'bhol_k7x9m2pqr4w8n1v3a1b2c',
  branch_id: 'bra_k7x9m2pqr4w8n1v3a1b2c',
  holiday_date: '2026-10-08',
  label: 'Sample label',
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `OfferingOutput`. */
export const offeringsRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'off_k7x9m2pqr4w8n1v3a1b2c',
    },
    offering_number: {
      type: 'integer',
    },
    name: {
      type: 'string',
    },
    category: {
      type: 'string',
      enum: ['consultation', 'treatment', 'package', 'lhr', 'product'],
    },
    specialty: {
      type: 'string',
      enum: ['skin', 'hair', 'dental', 'gynac', 'physio', 'general'],
    },
    tone: {
      type: 'string',
      enum: [
        'butter',
        'lav',
        'sky',
        'sage',
        'blush',
        'mint',
        'peach',
        'plum',
        'lime',
        'slate',
        'stone',
      ],
    },
    price: {
      type: 'number',
    },
    min_price: {
      type: 'number',
      nullable: true,
      description: 'The lowest the desk may bill; null without offering:lower_price:read (O15).',
    },
    duration_minutes: {
      type: 'integer',
    },
    sessions: {
      type: 'integer',
    },
    validity_days: {
      type: 'integer',
    },
    gst_percent: {
      type: 'integer',
      enum: [0, 5, 12, 18, 28],
    },
    is_active: {
      type: 'boolean',
    },
    offering_group_id: {
      type: 'string',
      nullable: true,
      example: 'ogr_k7x9m2pqr4w8n1v3a1b2c',
    },
    offer_price: {
      type: 'number',
      nullable: true,
      description: 'What is billed; null = the list price (O4).',
    },
    branch_ids: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
    is_gst_inclusive: {
      type: 'boolean',
    },
    search_terms: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
    description: {
      type: 'string',
      nullable: true,
    },
    created_at: {
      type: 'string',
      format: 'date-time',
    },
    updated_at: {
      type: 'string',
      format: 'date-time',
    },
  },
};

/** Example `OfferingOutput`. */
export const offeringsRecordExample = {
  id: 'off_k7x9m2pqr4w8n1v3a1b2c',
  offering_number: 12,
  name: 'Sample name',
  category: 'treatment',
  specialty: 'skin',
  tone: 'sky',
  price: 100,
  min_price: 80,
  duration_minutes: 30,
  sessions: 1,
  validity_days: 0,
  gst_percent: 18,
  is_active: true,
  offering_group_id: 'ogr_k7x9m2pqr4w8n1v3a1b2c',
  offer_price: 90,
  branch_ids: ['brn_k7x9m2pqr4w8n1v3a1b2c'],
  is_gst_inclusive: true,
  search_terms: ['sample'],
  description: 'Sample description',
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `OfferOutput`. */
export const offersRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'ofr_k7x9m2pqr4w8n1v3a1b2c',
    },
    name: {
      type: 'string',
    },
    code: {
      type: 'string',
      nullable: true,
    },
    kind: {
      type: 'string',
      enum: ['percent', 'amount', 'fixed', 'extra'],
    },
    value: {
      type: 'number',
    },
    offering_ids: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
    branch_ids: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
    starts_on: {
      type: 'string',
      format: 'date',
      nullable: true,
    },
    ends_on: {
      type: 'string',
      format: 'date',
      nullable: true,
    },
    is_active: {
      type: 'boolean',
      description: 'false = paused (O10).',
    },
    status: {
      type: 'string',
      enum: ['live', 'scheduled', 'paused', 'ended'],
      description: "Derived on the organization's today (O10).",
    },
    tone: {
      type: 'string',
      enum: [
        'butter',
        'lav',
        'sky',
        'sage',
        'blush',
        'mint',
        'peach',
        'plum',
        'lime',
        'slate',
        'stone',
      ],
    },
    note: {
      type: 'string',
      nullable: true,
    },
    created_at: {
      type: 'string',
      format: 'date-time',
    },
    updated_at: {
      type: 'string',
      format: 'date-time',
    },
  },
};

/** Example `OfferOutput`. */
export const offersRecordExample = {
  id: 'ofr_k7x9m2pqr4w8n1v3a1b2c',
  name: 'Sample name',
  code: 'GLOW20',
  kind: 'percent',
  value: 20,
  offering_ids: ['off_k7x9m2pqr4w8n1v3a1b2c'],
  branch_ids: ['brn_k7x9m2pqr4w8n1v3a1b2c'],
  starts_on: '2026-10-08',
  ends_on: '2026-10-31',
  is_active: true,
  status: 'live',
  tone: 'sky',
  note: 'Sample note',
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/**
 * What a patient's medical details (`allergies`, `contraindications`, `notes`) say about who sees
 * them (launch D83 (3)).
 */
const PATIENT_MEDICAL_DETAIL_NOTE =
  "A medical detail — null (the export's cell blank) unless the caller holds patient:clinical_record:read (the clinical team), patient:update (the front desk records it at intake) or patient_prescription:read (the pharmacy dispenses); the Accountant and Marketing see the name and the contact only.";

/** `PatientOutput` — the clinical side of a contact (launch #133, routes-final 7.A.6). */
export const patientsRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'pat_k7x9m2pqr4w8n1v3a1b2c' },
    patient_number: { type: 'integer', description: 'Shown as "PT-0412"' },
    contact_id: {
      type: 'string',
      example: 'con_k7x9m2pqr4w8n1v3a1b2c',
      description: 'The person (P1) — no embedded contact (P3)',
    },
    home_branch_id: { type: 'string', example: 'brn_k7x9m2pqr4w8n1v3a1b2c' },
    types: {
      type: 'array',
      maxItems: 6,
      items: {
        type: 'string',
        enum: ['aesthetic', 'clinical', 'lhr', 'dental', 'physio', 'gynac'],
      },
    },
    status: { type: 'string', enum: ['new', 'regular', 'vip', 'inactive'] },
    conversion: {
      type: 'string',
      enum: ['not_converted', 'converted'],
      description: 'Took a treatment (P4)',
    },
    doctor_membership_id: { type: 'string', nullable: true, description: 'The usual doctor' },
    follow_up_at: { type: 'string', format: 'date-time', nullable: true },
    notes: {
      type: 'string',
      maxLength: 2000,
      nullable: true,
      description: PATIENT_MEDICAL_DETAIL_NOTE,
    },
    lead_id: {
      type: 'string',
      nullable: true,
      description: 'The lead the check-in that opened the file came from (P10) — read-only',
    },
    has_data_consent: { type: 'boolean' },
    has_photo_consent: { type: 'boolean' },
    allergies: {
      type: 'array',
      maxItems: 30,
      items: { type: 'string', maxLength: 120 },
      nullable: true,
      description: PATIENT_MEDICAL_DETAIL_NOTE,
    },
    contraindications: {
      type: 'array',
      maxItems: 30,
      items: { type: 'string', maxLength: 120 },
      nullable: true,
      description: PATIENT_MEDICAL_DETAIL_NOTE,
    },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `PatientOutput`. */
export const patientsRecordExample = {
  id: 'pat_k7x9m2pqr4w8n1v3a1b2c',
  patient_number: 412,
  contact_id: 'con_k7x9m2pqr4w8n1v3a1b2c',
  home_branch_id: 'brn_k7x9m2pqr4w8n1v3a1b2c',
  types: ['aesthetic', 'lhr'],
  status: 'regular',
  conversion: 'converted',
  doctor_membership_id: 'mem_k7x9m2pqr4w8n1v3a1b2c',
  follow_up_at: null,
  notes: null,
  lead_id: 'lead_k7x9m2pqr4w8n1v3a1b2c',
  has_data_consent: true,
  has_photo_consent: true,
  allergies: ['Penicillin'],
  contraindications: [],
  created_at: '2026-10-08T10:30:00.000Z',
  updated_at: '2026-10-08T10:30:00.000Z',
};

/** `LeadOutput` — one enquiry for a contact (launch #131, routes-final 5.6). */
export const leadsRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'lead_k7x9m2pqr4w8n1v3a1b2c' },
    lead_number: { type: 'integer', description: 'Shown as "#2371"' },
    contact_id: { type: 'string', example: 'con_k7x9m2pqr4w8n1v3a1b2c' },
    contact: {
      type: 'object',
      nullable: true,
      description: "The contact's summary, for lists (L1)",
      properties: {
        id: { type: 'string' },
        contact_number: { type: 'integer' },
        first_name: { type: 'string' },
        last_name: { type: 'string', nullable: true },
        primary_phone: { type: 'string', example: '+919825044120' },
        default_channel: { type: 'string', enum: ['whatsapp', 'call', 'instagram'] },
      },
    },
    patient_id: {
      type: 'string',
      nullable: true,
      description: 'The patient file check-in opened (L8) — read-only',
    },
    status: {
      type: 'string',
      enum: [...LEAD_STATUS_VALUES],
      description:
        'Open: new, contacted, follow_up, appointment_scheduled, no_response; `appointment_scheduled` follows the bookings of the contact (L11), `clinic_visited` is set by check-in only (L8)',
    },
    source: {
      type: 'string',
      enum: ['instagram', 'google', 'whatsapp', 'facebook', 'walk_in', 'referral', 'retarget'],
      nullable: true,
    },
    interests: {
      type: 'array',
      maxItems: 6,
      items: { type: 'string', enum: ['clinical', 'peel', 'lhr', 'hydrafacial', 'prp', 'others'] },
    },
    kind: { type: 'string', enum: ['enquiry', 'retarget'], description: 'Server-set (L5)' },
    retarget_reason: { type: 'string', nullable: true, description: 'Server-set (L5)' },
    owner_membership_id: { type: 'string', nullable: true, description: 'Assigned' },
    involved_membership_ids: { type: 'array', maxItems: 10, items: { type: 'string' } },
    held_until: {
      type: 'string',
      format: 'date-time',
      nullable: true,
      description: "The owner's hold (`lead_hold_days`, D40)",
    },
    follow_up_at: { type: 'string', format: 'date-time', nullable: true },
    closed_at: {
      type: 'string',
      format: 'date-time',
      nullable: true,
      description:
        'When it last closed (not_interested, invalid, lost or clinic_visited) — null while open; server-set (D10, D11)',
    },
    branch_id: { type: 'string', nullable: true, description: 'None = every branch' },
    notes: { type: 'string', maxLength: 2000, nullable: true },
    last_activity_at: {
      type: 'string',
      format: 'date-time',
      nullable: true,
      description: "The contact's",
    },
    is_awaiting_reply: { type: 'boolean', description: "The contact's (M3)" },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `LeadOutput`. */
export const leadsRecordExample = {
  id: 'lead_k7x9m2pqr4w8n1v3a1b2c',
  lead_number: 2371,
  contact_id: 'con_k7x9m2pqr4w8n1v3a1b2c',
  contact: {
    id: 'con_k7x9m2pqr4w8n1v3a1b2c',
    contact_number: 12345,
    first_name: 'Riya',
    last_name: 'Shah',
    primary_phone: '+919825044120',
    default_channel: 'whatsapp',
  },
  patient_id: null,
  status: 'new',
  source: 'instagram',
  interests: ['lhr'],
  kind: 'enquiry',
  retarget_reason: null,
  owner_membership_id: 'mem_a1s2d3f4g5h6j7k8l9z0x',
  involved_membership_ids: [],
  held_until: '2026-10-10T10:30:00.000Z',
  follow_up_at: null,
  closed_at: null,
  branch_id: null,
  notes: null,
  last_activity_at: '2026-10-07T10:30:00.000Z',
  is_awaiting_reply: true,
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `AppointmentOutput` — one booking and, once checked in, its floor stage (launch #132, routes-final 6.6). */
export const appointmentsRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'appt_k7x9m2pqr4w8n1v3a1b2c' },
    appointment_number: { type: 'integer', description: 'Shown as "#2841"' },
    contact_id: { type: 'string', example: 'con_k7x9m2pqr4w8n1v3a1b2c' },
    contact: {
      type: 'object',
      nullable: true,
      description: "The contact's summary, for lists (A1)",
      properties: {
        id: { type: 'string' },
        contact_number: { type: 'integer' },
        first_name: { type: 'string' },
        last_name: { type: 'string', nullable: true },
        primary_phone: { type: 'string', example: '+919825044120' },
      },
    },
    patient_id: {
      type: 'string',
      nullable: true,
      description: "The contact's patient file — read-only",
    },
    lead_id: { type: 'string', nullable: true, description: "The contact's open lead — read-only" },
    branch_id: { type: 'string' },
    type: {
      type: 'string',
      enum: ['consultation', 'follow_up', 'treatment', 'package_session', 'other'],
    },
    offering_id: { type: 'string', nullable: true },
    service_label: { type: 'string', minLength: 1, maxLength: 120 },
    doctor_membership_id: { type: 'string' },
    therapist_membership_id: { type: 'string', nullable: true },
    branch_room_id: { type: 'string', nullable: true },
    branch_machine_id: { type: 'string', nullable: true },
    appointment_date: { type: 'string', format: 'date' },
    start_time: { type: 'string', example: '10:30' },
    end_time: { type: 'string', example: '11:00' },
    duration_minutes: { type: 'integer', minimum: 5, maximum: 240, multipleOf: 5 },
    status: {
      type: 'string',
      enum: ['scheduled', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show'],
    },
    visit_stage: {
      type: 'string',
      enum: ['waiting', 'with_doctor', 'treatment', 'checkout', 'pharmacy'],
      nullable: true,
      description: 'Only while checked in (A10)',
    },
    visit_stage_changed_at: { type: 'string', format: 'date-time', nullable: true },
    visit_paused_at: { type: 'string', format: 'date-time', nullable: true },
    is_walk_in: { type: 'boolean' },
    cancel_reason: {
      type: 'string',
      enum: [
        'patient_asked',
        'unreachable',
        'doctor_unavailable',
        'resource_unavailable',
        'rescheduling_later',
        'booked_by_mistake',
        'other',
      ],
      nullable: true,
    },
    cancel_note: { type: 'string', nullable: true },
    checked_in_at: {
      type: 'string',
      format: 'date-time',
      nullable: true,
      description: "The visit's start",
    },
    completed_at: {
      type: 'string',
      format: 'date-time',
      nullable: true,
      description: "The visit's end",
    },
    rescheduled_from: { type: 'string', format: 'date-time', nullable: true },
    move_count: { type: 'integer' },
    reason: { type: 'string', maxLength: 160, nullable: true },
    notes: { type: 'string', maxLength: 2000, nullable: true },
    follow_up_at: { type: 'string', format: 'date-time', nullable: true },
    copied_from_appointment_id: { type: 'string', nullable: true },
    reminder_status: {
      type: 'string',
      enum: ['not_sent', 'confirm_requested', 'reminder_queued', 'reminder_sent', 'failed'],
    },
    is_confirmed_by_reply: { type: 'boolean' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `AppointmentOutput`. */
export const appointmentsRecordExample = {
  id: 'appt_k7x9m2pqr4w8n1v3a1b2c',
  appointment_number: 2841,
  contact_id: 'con_k7x9m2pqr4w8n1v3a1b2c',
  contact: {
    id: 'con_k7x9m2pqr4w8n1v3a1b2c',
    contact_number: 12345,
    first_name: 'Riya',
    last_name: 'Shah',
    primary_phone: '+919825044120',
  },
  patient_id: null,
  lead_id: 'lead_k7x9m2pqr4w8n1v3a1b2c',
  branch_id: 'brn_k7x9m2pqr4w8n1v3a1b2c',
  type: 'consultation',
  offering_id: null,
  service_label: 'Consultation',
  doctor_membership_id: 'mem_a1s2d3f4g5h6j7k8l9z0x',
  therapist_membership_id: null,
  branch_room_id: null,
  branch_machine_id: null,
  appointment_date: '2026-10-09',
  start_time: '10:30',
  end_time: '11:00',
  duration_minutes: 30,
  status: 'scheduled',
  visit_stage: null,
  visit_stage_changed_at: null,
  visit_paused_at: null,
  is_walk_in: false,
  cancel_reason: null,
  cancel_note: null,
  checked_in_at: null,
  completed_at: null,
  rescheduled_from: null,
  move_count: 0,
  reason: null,
  notes: null,
  follow_up_at: null,
  copied_from_appointment_id: null,
  reminder_status: 'not_sent',
  is_confirmed_by_reply: false,
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `PatientDiagnosisOutput` — the organization's diagnosis catalogue (launch #133, routes-final 7.E.6). */
export const patientDiagnosesRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'dgn_k7x9m2pqr4w8n1v3a1b2c' },
    name: { type: 'string', maxLength: 120 },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `PatientDiagnosisOutput`. */
export const patientDiagnosesRecordExample = {
  id: 'dgn_k7x9m2pqr4w8n1v3a1b2c',
  name: 'Acne vulgaris',
  created_at: '2026-10-08T10:30:00.000Z',
  updated_at: '2026-10-08T10:30:00.000Z',
};

/** `PatientClinicalNoteOutput` — one clinical note on a patient file (launch #133, routes-final 7.B.6). */
export const patientClinicalNotesRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'pcn_k7x9m2pqr4w8n1v3a1b2c' },
    patient_id: { type: 'string' },
    kind: {
      type: 'string',
      enum: [
        'complaint',
        'finding',
        'diagnosis',
        'treatment_suggestion',
        'future_suggestion',
        'safety_check',
      ],
    },
    text: { type: 'string', maxLength: 500 },
    appointment_id: { type: 'string', nullable: true, description: 'The visit (A10)' },
    patient_diagnosis_id: {
      type: 'string',
      nullable: true,
      description: "A `diagnosis` note's catalogue entry (P12)",
    },
    added_at: { type: 'string', format: 'date-time' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `PatientClinicalNoteOutput`. */
export const patientClinicalNotesRecordExample = {
  id: 'pcn_k7x9m2pqr4w8n1v3a1b2c',
  patient_id: 'pat_k7x9m2pqr4w8n1v3a1b2c',
  kind: 'diagnosis',
  text: 'Grade 2 acne on both cheeks',
  appointment_id: 'appt_k7x9m2pqr4w8n1v3a1b2c',
  patient_diagnosis_id: 'dgn_k7x9m2pqr4w8n1v3a1b2c',
  added_at: '2026-10-08T10:30:00.000Z',
  created_at: '2026-10-08T10:30:00.000Z',
  updated_at: '2026-10-08T10:30:00.000Z',
};

/** `PatientPrescriptionOutput` — a draft until approved, then final (launch #133, routes-final 7.C.6). */
export const patientPrescriptionsRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'rx_k7x9m2pqr4w8n1v3a1b2c' },
    prescription_number: { type: 'integer', description: 'Shown as "RX-500"' },
    patient_id: { type: 'string' },
    patient: {
      type: 'object',
      nullable: true,
      description: 'The patient — number, contact and name (MD29)',
      properties: {
        id: { type: 'string' },
        patient_number: { type: 'integer' },
        contact_id: { type: 'string' },
        name: { type: 'string' },
      },
    },
    appointment_id: { type: 'string', nullable: true },
    doctor_membership_id: { type: 'string' },
    prescription_date: { type: 'string', format: 'date' },
    items: {
      type: 'array',
      maxItems: 30,
      items: {
        type: 'object',
        properties: {
          medicine_name: { type: 'string', maxLength: 120 },
          medicine_id: { type: 'string', nullable: true, description: 'A live medicine (P15)' },
          dose_morning: { type: 'integer', minimum: 0, maximum: 2 },
          dose_afternoon: { type: 'integer', minimum: 0, maximum: 2 },
          dose_night: { type: 'integer', minimum: 0, maximum: 2 },
          is_sos: { type: 'boolean' },
          meal: { type: 'string', enum: ['before', 'after'], nullable: true },
          timing: { type: 'string', nullable: true },
          timing_text: { type: 'string', maxLength: 40, nullable: true },
          body_part: { type: 'string', nullable: true },
          body_part_text: { type: 'string', maxLength: 40, nullable: true },
          quantity: { type: 'integer', minimum: 1, maximum: 999 },
          remarks: { type: 'string', maxLength: 200, nullable: true },
        },
      },
    },
    advice: { type: 'string', maxLength: 2000, nullable: true },
    lab_report: { type: 'string', maxLength: 2000, nullable: true },
    procedure_today: { type: 'string', maxLength: 2000, nullable: true },
    follow_up_date: { type: 'string', format: 'date', nullable: true },
    print_language: { type: 'string', enum: ['english', 'gujarati', 'hindi'] },
    status: { type: 'string', enum: ['draft', 'approved'] },
    approved_at: { type: 'string', format: 'date-time', nullable: true },
    approved_by_membership_id: {
      type: 'string',
      nullable: true,
      description: 'Who approved it (P15)',
    },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `PatientPrescriptionOutput`. */
export const patientPrescriptionsRecordExample = {
  id: 'rx_k7x9m2pqr4w8n1v3a1b2c',
  prescription_number: 500,
  patient_id: 'pat_k7x9m2pqr4w8n1v3a1b2c',
  patient: {
    id: 'pat_k7x9m2pqr4w8n1v3a1b2c',
    patient_number: 412,
    contact_id: 'con_k7x9m2pqr4w8n1v3a1b2c',
    name: 'Asha Patel',
  },
  appointment_id: null,
  doctor_membership_id: 'mem_k7x9m2pqr4w8n1v3a1b2c',
  prescription_date: '2026-10-08',
  items: [
    {
      medicine_name: 'Tretinoin 0.025% cream',
      medicine_id: null,
      dose_night: 1,
      meal: 'after',
      body_part: 'face',
      quantity: 1,
    },
  ],
  advice: null,
  lab_report: null,
  procedure_today: null,
  follow_up_date: '2026-11-08',
  print_language: 'english',
  status: 'approved',
  approved_at: '2026-10-08T10:30:00.000Z',
  approved_by_membership_id: 'mem_k7x9m2pqr4w8n1v3a1b2c',
  created_at: '2026-10-08T10:30:00.000Z',
  updated_at: '2026-10-08T10:30:00.000Z',
};

/** `PrescriptionKitOutput` — a doctor's own reusable lines (launch #133, routes-final 7.D.6). */
export const prescriptionKitsRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'rxk_k7x9m2pqr4w8n1v3a1b2c' },
    owner_membership_id: { type: 'string', description: 'The doctor whose kit it is (P17)' },
    name: { type: 'string', maxLength: 80 },
    items: {
      type: 'array',
      maxItems: 30,
      items: {
        type: 'object',
        properties: {
          medicine_name: { type: 'string', maxLength: 120 },
          medicine_id: { type: 'string', nullable: true, description: 'A live medicine (P15)' },
          dose_morning: { type: 'integer', minimum: 0, maximum: 2 },
          dose_afternoon: { type: 'integer', minimum: 0, maximum: 2 },
          dose_night: { type: 'integer', minimum: 0, maximum: 2 },
          is_sos: { type: 'boolean' },
          meal: { type: 'string', enum: ['before', 'after'], nullable: true },
          timing: { type: 'string', nullable: true },
          timing_text: { type: 'string', maxLength: 40, nullable: true },
          body_part: { type: 'string', nullable: true },
          body_part_text: { type: 'string', maxLength: 40, nullable: true },
          quantity: { type: 'integer', minimum: 1, maximum: 999 },
          remarks: { type: 'string', maxLength: 200, nullable: true },
        },
      },
    },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `PrescriptionKitOutput`. */
export const prescriptionKitsRecordExample = {
  id: 'rxk_k7x9m2pqr4w8n1v3a1b2c',
  owner_membership_id: 'mem_k7x9m2pqr4w8n1v3a1b2c',
  name: 'Acne starter',
  items: [
    {
      medicine_name: 'Tretinoin 0.025% cream',
      medicine_id: null,
      dose_night: 1,
      meal: 'after',
      body_part: 'face',
      quantity: 1,
    },
  ],
  created_at: '2026-10-08T10:30:00.000Z',
  updated_at: '2026-10-08T10:30:00.000Z',
};

/** `PatientImageOutput` — a photo in one of three albums (launch #133, routes-final 7.F.6). */
export const patientImagesRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'pimg_k7x9m2pqr4w8n1v3a1b2c' },
    patient_id: { type: 'string' },
    appointment_id: { type: 'string', nullable: true },
    patient_treatment_id: { type: 'string', nullable: true, description: 'Its session (P24)' },
    album: { type: 'string', enum: ['general', 'private', 'lhr'] },
    stage: { type: 'string', enum: ['before', 'after'], nullable: true },
    file_key: { type: 'string' },
    file_name: { type: 'string', description: "The upload's (P25)" },
    file_url: {
      type: 'string',
      format: 'uri',
      nullable: true,
      description:
        'A link that shows the photo, valid 15 minutes and made fresh on every read — null when its upload is gone (D86)',
    },
    display_name: { type: 'string', maxLength: 60, nullable: true },
    caption: { type: 'string', maxLength: 200, nullable: true },
    body_part: {
      type: 'string',
      nullable: true,
      enum: [
        'face',
        'upper_lip',
        'chin',
        'neck',
        'scalp',
        'hair',
        'chest',
        'back',
        'underarm',
        'arms',
        'hands',
        'legs',
        'body',
        'full_body',
        'other',
      ],
    },
    taken_on: { type: 'string', format: 'date' },
    service_label: {
      type: 'string',
      nullable: true,
      description: "Its visit's service (P26)",
    },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `PatientImageOutput`. */
export const patientImagesRecordExample = {
  id: 'pimg_k7x9m2pqr4w8n1v3a1b2c',
  patient_id: 'pat_k7x9m2pqr4w8n1v3a1b2c',
  appointment_id: 'appt_k7x9m2pqr4w8n1v3a1b2c',
  patient_treatment_id: null,
  album: 'general',
  stage: 'before',
  file_key: 'uploads/org_k7x9m2pqr4w8n1v3a1b2c/3f1c2b7e.jpg',
  file_name: 'cheek-left.jpg',
  file_url:
    'https://clinozy-uploads.s3.amazonaws.com/uploads/org_k7x9m2pqr4w8n1v3a1b2c/3f1c2b7e.jpg?X-Amz-Expires=900&X-Amz-Signature=…',
  display_name: 'Left cheek',
  caption: null,
  body_part: 'face',
  taken_on: '2026-10-08',
  service_label: 'Hydrafacial',
  created_at: '2026-10-08T10:30:00.000Z',
  updated_at: '2026-10-08T10:30:00.000Z',
};

/** A photo list's `meta.album_counts` — the live photos per album you can see (P26). */
export const patientImageAlbumCountsSchema = {
  type: 'object',
  properties: {
    general: { type: 'integer' },
    lhr: { type: 'integer' },
    private: { type: 'integer', description: 'Only with patient:private_album:read' },
  },
};

/** `PatientReportOutput` — a lab, scan or consent document (launch #133, routes-final 7.G.6). */
export const patientReportsRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'prep_k7x9m2pqr4w8n1v3a1b2c' },
    patient_id: { type: 'string' },
    type: { type: 'string', enum: ['lab', 'scan', 'consent', 'other'] },
    name: { type: 'string', maxLength: 120 },
    report_date: { type: 'string', format: 'date' },
    file_keys: {
      type: 'array',
      maxItems: 10,
      items: { type: 'string' },
      description: 'Confirmed uploads of the organization (P29)',
    },
    files: {
      type: 'array',
      maxItems: 10,
      description: "Each of `file_keys`, in order, with its upload's name and a view link (D86)",
      items: {
        type: 'object',
        properties: {
          file_key: { type: 'string' },
          file_name: {
            type: 'string',
            nullable: true,
            description: 'The name it was uploaded under — null when its upload is gone',
          },
          file_url: {
            type: 'string',
            format: 'uri',
            nullable: true,
            description:
              'A link that shows the file, valid 15 minutes and made fresh on every read — null when its upload is gone',
          },
        },
      },
    },
    notes: { type: 'string', maxLength: 1000, nullable: true },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `PatientReportOutput`. */
export const patientReportsRecordExample = {
  id: 'prep_k7x9m2pqr4w8n1v3a1b2c',
  patient_id: 'pat_k7x9m2pqr4w8n1v3a1b2c',
  type: 'lab',
  name: 'CBC',
  report_date: '2026-10-08',
  file_keys: ['uploads/org_k7x9m2pqr4w8n1v3a1b2c/9a2d4c1f.pdf'],
  files: [
    {
      file_key: 'uploads/org_k7x9m2pqr4w8n1v3a1b2c/9a2d4c1f.pdf',
      file_name: 'cbc-oct.pdf',
      file_url:
        'https://clinozy-uploads.s3.amazonaws.com/uploads/org_k7x9m2pqr4w8n1v3a1b2c/9a2d4c1f.pdf?X-Amz-Expires=900&X-Amz-Signature=…',
    },
  ],
  notes: null,
  created_at: '2026-10-08T10:30:00.000Z',
  updated_at: '2026-10-08T10:30:00.000Z',
};

/** `InvoiceOutput` — a bill with its lines and the server's amounts (launch #136, routes-final 8.A.6). */
export const invoicesRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'invc_k7x9m2pqr4w8n1v3a1b2c' },
    invoice_sequence: { type: 'integer', description: 'The running number (#1042)' },
    invoice_number: { type: 'string', description: 'The statutory number (2026-27/0412)' },
    financial_year: { type: 'string', example: '2026-27' },
    type: { type: 'string', enum: ['clinic', 'consultation', 'medical'] },
    branch_id: { type: 'string' },
    contact: {
      type: 'object',
      nullable: true,
      description: 'The billed contact (B3)',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        primary_phone: { type: 'string' },
      },
    },
    patient_id: { type: 'string', nullable: true, description: "The contact's patient file" },
    member_ids: { type: 'array', items: { type: 'string' }, description: 'Who is credited' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          line_number: { type: 'integer' },
          offering_id: { type: 'string', nullable: true },
          medicine_id: { type: 'string', nullable: true },
          name: { type: 'string' },
          description: {
            type: 'string',
            nullable: true,
            description: "The line's free text, printed under its name (up to 280).",
          },
          pack_size: { type: 'string', nullable: true },
          quantity: { type: 'integer' },
          rate: { type: 'number' },
          discount_percent: { type: 'number' },
          discount_amount: { type: 'number' },
          gst_percent: { type: 'integer', enum: [0, 5, 12, 18, 28] },
          is_gst_inclusive: { type: 'boolean' },
          taxable_amount: { type: 'number' },
          gst_amount: { type: 'number' },
          amount: { type: 'number' },
          patient_offering_suggestion_id: { type: 'string', nullable: true },
          patient_offering_id: { type: 'string', nullable: true },
          patient_treatment_ids: { type: 'array', items: { type: 'string' } },
          batch_number: { type: 'string', nullable: true },
        },
      },
    },
    overall_discount: { type: 'number' },
    subtotal: { type: 'number' },
    discount_total: { type: 'number' },
    taxable_total: { type: 'number' },
    gst_total: { type: 'number' },
    total: { type: 'number' },
    paid_amount: { type: 'number' },
    refunded_amount: {
      type: 'number',
      description: 'What its credit notes refunded — a refund moves its money here from paid (B16)',
    },
    due_amount: { type: 'number', description: 'total − paid − refunded' },
    payment_status: { type: 'string', enum: ['paid', 'partial', 'unpaid'] },
    is_settled: { type: 'boolean', description: 'A payment on a closed day (B12)' },
    invoice_date: { type: 'string', format: 'date' },
    remark: { type: 'string', nullable: true },
    patient_prescription_id: { type: 'string', nullable: true },
    created_by_membership_id: {
      type: 'string',
      nullable: true,
      description: 'Who billed it — their membership (D81); null for an API key',
    },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `InvoiceOutput`. */
export const invoicesRecordExample = {
  id: 'invc_k7x9m2pqr4w8n1v3a1b2c',
  invoice_sequence: 1042,
  invoice_number: '2026-27/0412',
  financial_year: '2026-27',
  type: 'clinic',
  branch_id: 'brn_k7x9m2pqr4w8n1v3a1b2c',
  contact: { id: 'con_k7x9m2pqr4w8n1v3a1b2c', name: 'Asha Mehta', primary_phone: '+919876543210' },
  patient_id: 'pat_k7x9m2pqr4w8n1v3a1b2c',
  member_ids: ['mem_k7x9m2pqr4w8n1v3a1b2c'],
  items: [
    {
      id: 'iitm_k7x9m2pqr4w8n1v3a1b2c',
      line_number: 1,
      offering_id: 'off_k7x9m2pqr4w8n1v3a1b2c',
      medicine_id: null,
      name: 'Hydrafacial',
      description: 'LHR Axilla 10 sessions =10*550',
      pack_size: null,
      quantity: 1,
      rate: 1000,
      discount_percent: 0,
      discount_amount: 0,
      gst_percent: 18,
      is_gst_inclusive: false,
      taxable_amount: 1000,
      gst_amount: 180,
      amount: 1180,
      patient_offering_suggestion_id: null,
      patient_offering_id: 'poff_k7x9m2pqr4w8n1v3a1b2c',
      patient_treatment_ids: [],
      batch_number: null,
    },
  ],
  overall_discount: 0,
  subtotal: 1000,
  discount_total: 0,
  taxable_total: 1000,
  gst_total: 180,
  total: 1180,
  paid_amount: 500,
  refunded_amount: 0,
  due_amount: 680,
  payment_status: 'partial',
  is_settled: false,
  invoice_date: '2026-10-08',
  remark: null,
  patient_prescription_id: null,
  created_by_membership_id: 'mem_k7x9m2pqr4w8n1v3a1b2c',
  created_at: '2026-10-08T10:30:00.000Z',
  updated_at: '2026-10-08T10:30:00.000Z',
};

/** `InvoicePreviewOutput` — what a bill or a change would come to, nothing written (D81, Q2). */
export const invoicePreviewSchema = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['clinic', 'consultation', 'medical'] },
    invoice_date: {
      type: 'string',
      format: 'date',
      description: 'As the save would set it — the day the offers are live on',
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            nullable: true,
            description: "The kept line's id (a change); null for a new line",
          },
          line_number: { type: 'integer' },
          offering_id: { type: 'string', nullable: true },
          medicine_id: { type: 'string', nullable: true },
          name: { type: 'string' },
          description: {
            type: 'string',
            nullable: true,
            description: "The line's free text, printed under its name (up to 280).",
          },
          pack_size: { type: 'string', nullable: true },
          quantity: { type: 'integer' },
          rate: {
            type: 'number',
            description: "The server's rate — the best live offer, never below the lowest price",
          },
          discount_percent: { type: 'number' },
          discount_amount: { type: 'number' },
          gst_percent: { type: 'integer', enum: [0, 5, 12, 18, 28] },
          is_gst_inclusive: { type: 'boolean' },
          taxable_amount: { type: 'number' },
          gst_amount: { type: 'number' },
          amount: { type: 'number' },
          sessions_total: {
            type: 'integer',
            nullable: true,
            description: 'The sessions its patient offering would hold — free sessions included',
          },
          offer_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'The live offers it applies (M26) — none on a kept line',
          },
          patient_offering_suggestion_id: { type: 'string', nullable: true },
          batch_number: { type: 'string', nullable: true },
        },
      },
    },
    overall_discount: { type: 'number' },
    subtotal: { type: 'number' },
    discount_total: { type: 'number' },
    taxable_total: { type: 'number' },
    gst_total: { type: 'number' },
    total: { type: 'number' },
    paid_amount: { type: 'number', description: 'Already paid — 0 for a new bill' },
    refunded_amount: {
      type: 'number',
      description: 'What its credit notes refunded — 0 for a new bill',
    },
    due_amount: { type: 'number', description: 'total − paid − refunded' },
  },
};

/** Example `InvoicePreviewOutput`. */
export const invoicePreviewExample = {
  type: 'clinic',
  invoice_date: '2026-10-08',
  items: [
    {
      id: null,
      line_number: 1,
      offering_id: 'off_k7x9m2pqr4w8n1v3a1b2c',
      medicine_id: null,
      name: 'Hydrafacial',
      description: 'LHR Axilla 10 sessions =10*550',
      pack_size: null,
      quantity: 1,
      rate: 900,
      discount_percent: 0,
      discount_amount: 0,
      gst_percent: 18,
      is_gst_inclusive: false,
      taxable_amount: 900,
      gst_amount: 162,
      amount: 1062,
      sessions_total: 1,
      offer_ids: ['ofr_k7x9m2pqr4w8n1v3a1b2c'],
      patient_offering_suggestion_id: null,
      batch_number: null,
    },
  ],
  overall_discount: 0,
  subtotal: 900,
  discount_total: 0,
  taxable_total: 900,
  gst_total: 162,
  total: 1062,
  paid_amount: 0,
  refunded_amount: 0,
  due_amount: 1062,
};

/** `PatientOfferingOutput` — what a patient bought (launch #135, routes-final 7.L.6). */
export const patientOfferingsRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'poff_k7x9m2pqr4w8n1v3a1b2c' },
    patient_id: { type: 'string' },
    offering_id: { type: 'string' },
    offering_name: { type: 'string' },
    invoice_id: { type: 'string', nullable: true, description: 'The bill it was bought on' },
    invoice_item_id: {
      type: 'string',
      nullable: true,
      description: 'Its invoice line (sub-domain 8)',
    },
    sessions_total: { type: 'integer', minimum: 1, maximum: 999 },
    sessions_used: { type: 'integer', minimum: 0 },
    sessions_left: { type: 'integer', minimum: 0 },
    is_package: { type: 'boolean', description: 'More than one session' },
    valid_until: {
      type: 'string',
      format: 'date',
      nullable: true,
      description: 'None = no expiry',
    },
    status: { type: 'string', enum: ['active', 'used_up', 'expired'] },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `PatientOfferingOutput`. */
export const patientOfferingsRecordExample = {
  id: 'poff_k7x9m2pqr4w8n1v3a1b2c',
  patient_id: 'pat_k7x9m2pqr4w8n1v3a1b2c',
  offering_id: 'off_k7x9m2pqr4w8n1v3a1b2c',
  offering_name: 'Laser hair reduction — 7 sessions',
  invoice_id: 'invc_k7x9m2pqr4w8n1v3a1b2c',
  invoice_item_id: null,
  sessions_total: 7,
  sessions_used: 2,
  sessions_left: 5,
  is_package: true,
  valid_until: '2027-04-08',
  status: 'active',
  created_at: '2026-10-08T10:30:00.000Z',
  updated_at: '2026-10-08T10:30:00.000Z',
};

/** `PatientOfferingSuggestionOutput` — a row of the patient's plan (launch #135, routes-final 7.M.6). */
export const patientOfferingSuggestionsRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'osug_k7x9m2pqr4w8n1v3a1b2c' },
    patient_id: { type: 'string' },
    offering_id: { type: 'string' },
    offering_name: { type: 'string' },
    quantity: { type: 'integer', minimum: 1, maximum: 99 },
    price: {
      type: 'number',
      nullable: true,
      description: "The whole quantity's final amount; none = the billed price × quantity",
    },
    status: { type: 'string', enum: ['planned', 'accepted', 'next_time', 'declined'] },
    reason: { type: 'string', maxLength: 200, nullable: true },
    appointment_id: { type: 'string', nullable: true },
    patient_check_in_id: { type: 'string', nullable: true },
    source_label: {
      type: 'string',
      description: '"Check-in · 26 Sep", "Appt #2790 · Consultation", else "Patient file" (PK8)',
    },
    suggested_by_membership_id: { type: 'string', nullable: true },
    invoiced_quantity: { type: 'integer', minimum: 0 },
    is_fully_invoiced: { type: 'boolean' },
    is_below_lowest_price: {
      type: 'boolean',
      description: "Below the offering's lowest price × quantity — the invoice refuses it",
    },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `PatientOfferingSuggestionOutput`. */
export const patientOfferingSuggestionsRecordExample = {
  id: 'osug_k7x9m2pqr4w8n1v3a1b2c',
  patient_id: 'pat_k7x9m2pqr4w8n1v3a1b2c',
  offering_id: 'off_k7x9m2pqr4w8n1v3a1b2c',
  offering_name: 'Glycolic peel',
  quantity: 2,
  price: 5000,
  status: 'planned',
  reason: 'Pigmentation on the cheeks',
  appointment_id: 'appt_k7x9m2pqr4w8n1v3a1b2c',
  patient_check_in_id: null,
  source_label: 'Appt #2790 · Consultation',
  suggested_by_membership_id: 'mem_k7x9m2pqr4w8n1v3a1b2c',
  invoiced_quantity: 0,
  is_fully_invoiced: false,
  is_below_lowest_price: false,
  created_at: '2026-10-08T10:30:00.000Z',
  updated_at: '2026-10-08T10:30:00.000Z',
};

/** One split of a payment as a change records it — `{ mode, amount }`. */
const paymentEditSplitSchema = {
  type: 'object',
  properties: {
    mode: { type: 'string', enum: [...PAYMENT_MODE_VALUES] },
    amount: { type: 'number' },
  },
  required: ['mode', 'amount'],
};

/** What each recorded field's `from` / `to` holds (PAY-M5) — typed by the code's recorded fields. */
const paymentEditValueSchemas: Record<(typeof PAYMENT_EDIT_RECORDED_FIELDS)[number], object> = {
  splits: {
    type: 'array',
    items: paymentEditSplitSchema,
    description: 'The splits, each `{ mode, amount }`',
  },
  paid_at: { type: 'string', format: 'date-time' },
  contact_id: { type: 'string', nullable: true, description: 'A contact id (`con_…`)' },
  invoice_id: { type: 'string', nullable: true, description: 'An invoice id (`invc_…`)' },
  stock_purchase_id: {
    type: 'string',
    nullable: true,
    description: 'A stock purchase id (`spur_…`)',
  },
  medical_purchase_order_id: {
    type: 'string',
    nullable: true,
    description: 'A medical order id (`mpo_…`)',
  },
  payee_name: { type: 'string', nullable: true },
  expense_category: { type: 'string', nullable: true, enum: [...PAYMENT_EXPENSE_CATEGORY_VALUES] },
  reference: { type: 'string', nullable: true },
  note: { type: 'string', nullable: true },
  attachment_keys: { type: 'array', items: { type: 'string' } },
};

/** `PaymentEditOutput` — what one change to a payment changed (launch #136, routes-final 8.C.6). */
export const paymentEditsRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'pedit_k7x9m2pqr4w8n1v3a1b2c' },
    changes: {
      type: 'object',
      description:
        'The changed fields only, each `{ from, to }` — the value before and after, shaped as the field: `splits` lists of `{ mode, amount }`, `paid_at` an instant, the links public ids, the texts strings, `attachment_keys` a list; null where the field was empty',
      properties: Object.fromEntries(
        PAYMENT_EDIT_RECORDED_FIELDS.map((field) => [
          field,
          {
            type: 'object',
            properties: {
              from: paymentEditValueSchemas[field],
              to: paymentEditValueSchemas[field],
            },
            required: ['from', 'to'],
          },
        ]),
      ),
      additionalProperties: false,
    },
    author_membership_id: { type: 'string', nullable: true },
    created_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `PaymentEditOutput`. */
export const paymentEditsRecordExample = {
  id: 'pedit_k7x9m2pqr4w8n1v3a1b2c',
  changes: {
    splits: { from: [{ mode: 'upi', amount: 600 }], to: [{ mode: 'upi', amount: 700 }] },
  },
  author_membership_id: 'mem_k7x9m2pqr4w8n1v3a1b2c',
  created_at: '2026-10-08T11:00:00.000Z',
};

/** `PaymentOutput` — one entry of money in or out (launch #136, routes-final 8.C.6). */
export const paymentsRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'pay_k7x9m2pqr4w8n1v3a1b2c' },
    payment_number: { type: 'integer', description: 'PAY-12' },
    direction: { type: 'string', enum: ['received', 'paid'] },
    kind: {
      type: 'string',
      enum: ['receipt', 'money_back', 'expense', 'supplier_bill', 'refund', 'reversal'],
    },
    branch_id: { type: 'string' },
    amount: { type: 'number' },
    splits: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['cash', 'upi', 'card', 'credit'] },
          amount: { type: 'number' },
        },
      },
    },
    paid_at: { type: 'string', format: 'date-time' },
    contact: {
      type: 'object',
      nullable: true,
      description: 'The billed contact (B3)',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        primary_phone: { type: 'string' },
      },
    },
    patient_id: { type: 'string', nullable: true, description: "The contact's patient file" },
    invoice_id: { type: 'string', nullable: true },
    invoice: {
      type: 'object',
      nullable: true,
      description: "The invoice's numbers, type and what is still due on it (D81)",
      properties: {
        invoice_sequence: { type: 'integer', description: '#1042' },
        invoice_number: { type: 'string', description: '2026-27/0412' },
        type: { type: 'string', enum: ['clinic', 'consultation', 'medical'] },
        due_amount: { type: 'number' },
      },
    },
    invoice_credit_note_id: { type: 'string', nullable: true },
    invoice_credit_note_number: {
      type: 'integer',
      nullable: true,
      description: "The credit note's number (CN-3, D81)",
    },
    pending_credit_id: { type: 'string', nullable: true },
    pending_credit_number: {
      type: 'integer',
      nullable: true,
      description: "The pending credit's number (CR-2, D81)",
    },
    stock_purchase_id: {
      type: 'string',
      nullable: true,
      description: 'The stock purchase a supplier bill pays (S11)',
    },
    stock_purchase: {
      type: 'object',
      nullable: true,
      description: "The stock purchase's number and the vendor's bill number (D81)",
      properties: {
        stock_purchase_number: { type: 'integer' },
        bill_number: { type: 'string', nullable: true },
      },
    },
    medical_purchase_order_id: {
      type: 'string',
      nullable: true,
      description: 'The received medical order a supplier bill pays (MD7)',
    },
    medical_purchase_order: {
      type: 'object',
      nullable: true,
      description: "The medical order's number and the supplier's bill number (D81)",
      properties: {
        purchase_order_number: { type: 'integer' },
        supplier_bill_number: { type: 'string', nullable: true },
      },
    },
    reverses_payment_id: { type: 'string', nullable: true },
    reversed_by_payment_id: { type: 'string', nullable: true },
    payee_name: {
      type: 'string',
      nullable: true,
      description:
        "Who was paid — an expense's or a supplier bill's (required on those; a stock purchase's \"Paid\" writes the vendor's name); optional on the other kinds",
    },
    expense_category: {
      type: 'string',
      nullable: true,
      enum: [...PAYMENT_EXPENSE_CATEGORY_VALUES],
      description:
        'An expense\'s category — only an expense has one: null on every other kind, a supplier bill (a stock purchase\'s "Paid") included',
    },
    reference: { type: 'string', nullable: true },
    note: { type: 'string', nullable: true },
    attachment_keys: { type: 'array', items: { type: 'string' } },
    is_settled: { type: 'boolean', description: 'Its day is closed (B6)' },
    edit_count: { type: 'integer' },
    last_edit: { ...paymentEditsRecordSchema, nullable: true },
    created_by_membership_id: {
      type: 'string',
      nullable: true,
      description: 'Who recorded it — their membership (D81); null for an API key',
    },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `PaymentOutput`. */
export const paymentsRecordExample = {
  id: 'pay_k7x9m2pqr4w8n1v3a1b2c',
  payment_number: 12,
  direction: 'received',
  kind: 'receipt',
  branch_id: 'brn_k7x9m2pqr4w8n1v3a1b2c',
  amount: 700,
  splits: [{ mode: 'upi', amount: 700 }],
  paid_at: '2026-10-08T10:30:00.000Z',
  contact: { id: 'con_k7x9m2pqr4w8n1v3a1b2c', name: 'Asha Mehta', primary_phone: '+919876543210' },
  patient_id: 'pat_k7x9m2pqr4w8n1v3a1b2c',
  invoice_id: 'invc_k7x9m2pqr4w8n1v3a1b2c',
  invoice: {
    invoice_sequence: 1042,
    invoice_number: '2026-27/0412',
    type: 'clinic',
    due_amount: 680,
  },
  invoice_credit_note_id: null,
  invoice_credit_note_number: null,
  pending_credit_id: null,
  pending_credit_number: null,
  stock_purchase_id: null,
  stock_purchase: null,
  medical_purchase_order_id: null,
  medical_purchase_order: null,
  reverses_payment_id: null,
  reversed_by_payment_id: null,
  payee_name: null,
  expense_category: null,
  reference: 'UPI 4412',
  note: null,
  attachment_keys: [],
  is_settled: false,
  edit_count: 1,
  last_edit: paymentEditsRecordExample,
  created_by_membership_id: 'mem_k7x9m2pqr4w8n1v3a1b2c',
  created_at: '2026-10-08T10:30:00.000Z',
  updated_at: '2026-10-08T11:00:00.000Z',
};

/** `InvoiceCreditNoteOutput` — an invoice's refund (launch #136, routes-final 8.B.6). */
export const invoiceCreditNotesRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'cn_k7x9m2pqr4w8n1v3a1b2c' },
    credit_note_number: { type: 'integer', description: 'CN-001' },
    invoice_id: { type: 'string' },
    amount: { type: 'number' },
    reason: { type: 'string' },
    payment_id: { type: 'string', nullable: true, description: 'Its refund payment' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `InvoiceCreditNoteOutput`. */
export const invoiceCreditNotesRecordExample = {
  id: 'cn_k7x9m2pqr4w8n1v3a1b2c',
  credit_note_number: 1,
  invoice_id: 'invc_k7x9m2pqr4w8n1v3a1b2c',
  amount: 200,
  reason: 'Unhappy with the result',
  payment_id: 'pay_k7x9m2pqr4w8n1v3a1b2c',
  created_at: '2026-10-08T10:30:00.000Z',
  updated_at: '2026-10-08T10:30:00.000Z',
};

/** `PendingCreditOutput` — money owed to or by someone (launch #136, routes-final 8.D.6). */
export const pendingCreditsRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'pcr_k7x9m2pqr4w8n1v3a1b2c' },
    pending_credit_number: { type: 'integer', description: 'CR-2' },
    direction: { type: 'string', enum: ['give', 'take'] },
    contact: {
      type: 'object',
      nullable: true,
      description: 'The billed contact (B3)',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        primary_phone: { type: 'string' },
      },
    },
    patient_id: { type: 'string', nullable: true, description: "The contact's patient file" },
    party_name: { type: 'string', nullable: true },
    amount: { type: 'number' },
    settled_amount: { type: 'number' },
    left_amount: { type: 'number' },
    status: { type: 'string', enum: ['open', 'given_back', 'got_back', 'used'] },
    reason: { type: 'string' },
    note: { type: 'string', nullable: true },
    invoice_id: { type: 'string', nullable: true },
    source_payment_id: { type: 'string', nullable: true },
    settle_by: { type: 'string', format: 'date', nullable: true },
    payment_ids: { type: 'array', items: { type: 'string' }, description: 'Its settlements' },
    created_by_membership_id: {
      type: 'string',
      nullable: true,
      description: 'Who recorded it — their membership (D81); null for an API key',
    },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `PendingCreditOutput`. */
export const pendingCreditsRecordExample = {
  id: 'pcr_k7x9m2pqr4w8n1v3a1b2c',
  pending_credit_number: 2,
  direction: 'give',
  contact: { id: 'con_k7x9m2pqr4w8n1v3a1b2c', name: 'Asha Mehta', primary_phone: '+919876543210' },
  patient_id: 'pat_k7x9m2pqr4w8n1v3a1b2c',
  party_name: null,
  amount: 500,
  settled_amount: 200,
  left_amount: 300,
  status: 'open',
  reason: 'Advance to return',
  note: null,
  invoice_id: null,
  source_payment_id: null,
  settle_by: '2026-10-15',
  payment_ids: ['pay_k7x9m2pqr4w8n1v3a1b2c'],
  created_by_membership_id: 'mem_k7x9m2pqr4w8n1v3a1b2c',
  created_at: '2026-10-08T10:30:00.000Z',
  updated_at: '2026-10-08T11:00:00.000Z',
};

/** `DayCloseOutput` — a branch's day of cash (launch #136, routes-final 8.E.6). */
export const dayClosesRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'dcl_k7x9m2pqr4w8n1v3a1b2c' },
    branch_id: { type: 'string' },
    close_date: { type: 'string', format: 'date' },
    status: { type: 'string', enum: ['open', 'closed'] },
    opening_cash: { type: 'number' },
    opening_source: { type: 'string', enum: ['carried', 'recounted'] },
    opening_accepted_at: { type: 'string', format: 'date-time' },
    opening_accepted_by_membership_id: { type: 'string', nullable: true },
    cash_in: { type: 'number' },
    cash_out: { type: 'number' },
    expected_cash: { type: 'number', nullable: true, description: 'Live while open' },
    counted_cash: { type: 'number', nullable: true },
    difference: { type: 'number', nullable: true },
    difference_reason: { type: 'string', nullable: true },
    close_kind: { type: 'string', enum: ['manual', 'auto'], nullable: true },
    closed_at: { type: 'string', format: 'date-time', nullable: true },
    closed_by_membership_id: { type: 'string', nullable: true },
    net_by_mode: {
      type: 'object',
      properties: {
        cash: { type: 'number' },
        upi: { type: 'number' },
        card: { type: 'number' },
        credit: { type: 'number' },
      },
    },
    by_member: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          membership_id: { type: 'string', nullable: true },
          count: { type: 'integer' },
          amount: { type: 'number' },
        },
      },
    },
    entry_count: { type: 'integer' },
    events: {
      type: 'array',
      description:
        "What happened to the day, oldest first. Render each by its `kind` and the day's figures, not by `text` (PAY-M4): `opened` — `opening_cash` (`opening_source`); `recounted` — `opening_cash` (the carried figure it replaced is only in the text); `closed` — `counted_cash`, `expected_cash`, `difference` and `difference_reason`; `auto_closed` — `expected_cash` (counted as expected); `reopened` — `text` is the reason as typed. After a reopen the figures are the latest close's (a reopen clears them, the next close stores its own): an earlier close's count is only in its event's text.",
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          kind: {
            type: 'string',
            enum: ['opened', 'recounted', 'closed', 'auto_closed', 'reopened'],
          },
          text: {
            type: 'string',
            nullable: true,
            description:
              'On `reopened`, the reason as typed. On the other kinds the server\'s English line, written when the step happened, with rupees formatted in it ("Opening cash ₹2,000.00", "Counted ₹5,950.00, expected ₹6,000.00", "Auto-closed: counted as expected ₹6000.00") — a log line, not for display in another language',
          },
          membership_id: {
            type: 'string',
            nullable: true,
            description:
              'Who did it; null for an `auto_closed` (the server closed it) or an API key',
          },
          occurred_at: { type: 'string', format: 'date-time' },
        },
      },
    },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `DayCloseOutput`. */
export const dayClosesRecordExample = {
  id: 'dcl_k7x9m2pqr4w8n1v3a1b2c',
  branch_id: 'brn_k7x9m2pqr4w8n1v3a1b2c',
  close_date: '2026-10-08',
  status: 'closed',
  opening_cash: 2000,
  opening_source: 'carried',
  opening_accepted_at: '2026-10-08T03:30:00.000Z',
  opening_accepted_by_membership_id: 'mem_k7x9m2pqr4w8n1v3a1b2c',
  cash_in: 4500,
  cash_out: 500,
  expected_cash: 6000,
  counted_cash: 5950,
  difference: -50,
  difference_reason: 'Short by 50',
  close_kind: 'manual',
  closed_at: '2026-10-08T14:30:00.000Z',
  closed_by_membership_id: 'mem_k7x9m2pqr4w8n1v3a1b2c',
  net_by_mode: { cash: 4000, upi: 3200, card: 0, credit: 0 },
  by_member: [{ membership_id: 'mem_k7x9m2pqr4w8n1v3a1b2c', count: 6, amount: 7200 }],
  entry_count: 6,
  events: [
    {
      id: 'dce_k7x9m2pqr4w8n1v3a1b2c',
      kind: 'opened',
      text: 'Opening cash ₹2,000.00',
      membership_id: 'mem_k7x9m2pqr4w8n1v3a1b2c',
      occurred_at: '2026-10-08T03:30:00.000Z',
    },
  ],
  created_at: '2026-10-08T03:30:00.000Z',
  updated_at: '2026-10-08T14:30:00.000Z',
};

/** `PatientFeedbackActionOutput` — what was done about a check-in or a review (routes-final 7.K.6). */
export const patientFeedbackActionSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'fba_k7x9m2pqr4w8n1v3a1b2c' },
    action: {
      type: 'string',
      enum: [
        'doctor_called',
        'asked_revisit',
        'free_review_booked',
        'plan_changed',
        'replied_google',
        'replied_instagram',
        'replied_whatsapp',
        'refund_credit',
        'other',
      ],
    },
    note: { type: 'string', maxLength: 280, nullable: true },
    author_membership_id: { type: 'string', nullable: true, description: 'The caller ("by")' },
    created_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `PatientFeedbackActionOutput`. */
const patientFeedbackActionExample = {
  id: 'fba_k7x9m2pqr4w8n1v3a1b2c',
  action: 'doctor_called',
  note: null,
  author_membership_id: 'mem_k7x9m2pqr4w8n1v3a1b2c',
  created_at: '2026-10-08T11:00:00.000Z',
};

/** `PatientTreatmentOutput` — one session (launch #134, routes-final 7.H.6). */
export const patientTreatmentsRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'trt_k7x9m2pqr4w8n1v3a1b2c' },
    patient_id: { type: 'string' },
    appointment_id: { type: 'string', nullable: true },
    offering_id: { type: 'string', nullable: true },
    name: { type: 'string', maxLength: 120 },
    template: { type: 'string', enum: ['skin', 'dental', 'physio', 'gynac', 'general'] },
    performed_at: { type: 'string', format: 'date-time' },
    doctor_membership_id: { type: 'string', nullable: true },
    therapist_membership_id: { type: 'string', nullable: true },
    body_parts: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'string',
        enum: [
          'face',
          'upper_lip',
          'chin',
          'neck',
          'scalp',
          'hair',
          'chest',
          'back',
          'underarm',
          'arms',
          'hands',
          'legs',
          'body',
          'full_body',
          'other',
        ],
      },
    },
    session_number: { type: 'integer', minimum: 1, maximum: 999 },
    parameters: {
      type: 'object',
      additionalProperties: { type: 'string', maxLength: 80 },
      description: "The template's detail (teeth, regions — TR8)",
    },
    remark: { type: 'string', maxLength: 2000, nullable: true },
    aftercare_call: { type: 'string', enum: ['none', 'next_day', 'in_two_days', 'in_week'] },
    patient_offering_id: {
      type: 'string',
      nullable: true,
      description: 'The bought session it spent (TR7, TR13)',
    },
    is_billed: {
      type: 'boolean',
      nullable: true,
      description:
        'true with a bought offering, false done with an offering and none, else null (TR13)',
    },
    status: { type: 'string', enum: ['done', 'reversed'] },
    reversed_reason: { type: 'string', maxLength: 280, nullable: true },
    reversed_at: { type: 'string', format: 'date-time', nullable: true },
    latest_check_in: {
      type: 'object',
      nullable: true,
      description: 'The Feedback column',
      properties: {
        id: { type: 'string' },
        feel: { type: 'string', enum: ['much_better', 'better', 'same', 'worse'] },
        score: { type: 'integer', minimum: 1, maximum: 10 },
        check_in_date: { type: 'string', format: 'date' },
      },
    },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `PatientTreatmentOutput`. */
export const patientTreatmentsRecordExample = {
  id: 'trt_k7x9m2pqr4w8n1v3a1b2c',
  patient_id: 'pat_k7x9m2pqr4w8n1v3a1b2c',
  appointment_id: 'appt_k7x9m2pqr4w8n1v3a1b2c',
  offering_id: 'off_k7x9m2pqr4w8n1v3a1b2c',
  name: 'Hydrafacial',
  template: 'skin',
  performed_at: '2026-10-08T10:30:00.000Z',
  doctor_membership_id: 'mem_k7x9m2pqr4w8n1v3a1b2c',
  therapist_membership_id: null,
  body_parts: ['face'],
  session_number: 2,
  parameters: { pressure: 'medium' },
  remark: null,
  aftercare_call: 'next_day',
  patient_offering_id: 'poff_k7x9m2pqr4w8n1v3a1b2c',
  is_billed: true,
  status: 'done',
  reversed_reason: null,
  reversed_at: null,
  latest_check_in: {
    id: 'chk_k7x9m2pqr4w8n1v3a1b2c',
    feel: 'better',
    score: 8,
    check_in_date: '2026-10-09',
  },
  created_at: '2026-10-08T10:30:00.000Z',
  updated_at: '2026-10-08T10:30:00.000Z',
};

/** `PatientCheckInOutput` — how a patient is doing (launch #134, routes-final 7.I.6). */
export const patientCheckInsRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'chk_k7x9m2pqr4w8n1v3a1b2c' },
    patient_id: { type: 'string' },
    appointment_id: { type: 'string', nullable: true },
    patient_treatment_id: { type: 'string', nullable: true },
    context: { type: 'string', maxLength: 80, description: 'Server-filled when not sent (TR9)' },
    feel: { type: 'string', enum: ['much_better', 'better', 'same', 'worse'] },
    score: { type: 'integer', minimum: 1, maximum: 10 },
    score_change: {
      type: 'integer',
      nullable: true,
      description: 'Against the previous check-in (the ▲▼ trend)',
    },
    followed: {
      type: 'string',
      enum: ['fully', 'mostly', 'partly', 'not_at_all'],
      nullable: true,
    },
    followed_note: { type: 'string', maxLength: 280, nullable: true },
    current_state: { type: 'string', maxLength: 500, nullable: true },
    next_plan: { type: 'string', maxLength: 500, nullable: true },
    next_offering_ids: {
      type: 'array',
      items: { type: 'string' },
      description: 'Read back from its plan rows (TR10)',
    },
    check_in_date: { type: 'string', format: 'date' },
    needs_action: {
      type: 'boolean',
      description: 'Feel worse or a score ≤ 4 with no action logged',
    },
    actions: { type: 'array', items: patientFeedbackActionSchema, description: 'Newest first' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `PatientCheckInOutput`. */
export const patientCheckInsRecordExample = {
  id: 'chk_k7x9m2pqr4w8n1v3a1b2c',
  patient_id: 'pat_k7x9m2pqr4w8n1v3a1b2c',
  appointment_id: null,
  patient_treatment_id: 'trt_k7x9m2pqr4w8n1v3a1b2c',
  context: 'After Hydrafacial',
  feel: 'worse',
  score: 4,
  score_change: -3,
  followed: 'mostly',
  followed_note: null,
  current_state: 'Some redness on the left cheek',
  next_plan: null,
  next_offering_ids: ['off_k7x9m2pqr4w8n1v3a1b2c'],
  check_in_date: '2026-10-09',
  needs_action: false,
  actions: [patientFeedbackActionExample],
  created_at: '2026-10-09T09:00:00.000Z',
  updated_at: '2026-10-09T09:00:00.000Z',
};

/** `PatientReviewOutput` — a review the patient gave (launch #134, routes-final 7.J.6). */
export const patientReviewsRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'rev_k7x9m2pqr4w8n1v3a1b2c' },
    patient_id: { type: 'string' },
    appointment_id: { type: 'string', nullable: true },
    source: {
      type: 'string',
      enum: ['google', 'video', 'instagram', 'internal_form', 'whatsapp'],
    },
    rating: { type: 'integer', minimum: 1, maximum: 5, nullable: true },
    text: { type: 'string', maxLength: 2000, nullable: true },
    link: { type: 'string', format: 'uri', nullable: true, description: '`https://` only (TR11)' },
    file_keys: {
      type: 'array',
      maxItems: 10,
      items: { type: 'string' },
      description: 'Confirmed uploads (video or screenshots)',
    },
    review_date: { type: 'string', format: 'date' },
    needs_action: { type: 'boolean', description: 'A rating ≤ 3 with no action logged' },
    actions: { type: 'array', items: patientFeedbackActionSchema, description: 'Newest first' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `PatientReviewOutput`. */
export const patientReviewsRecordExample = {
  id: 'rev_k7x9m2pqr4w8n1v3a1b2c',
  patient_id: 'pat_k7x9m2pqr4w8n1v3a1b2c',
  appointment_id: 'appt_k7x9m2pqr4w8n1v3a1b2c',
  source: 'google',
  rating: 5,
  text: 'Lovely staff and a calm clinic.',
  link: 'https://g.page/r/example',
  file_keys: [],
  review_date: '2026-10-08',
  needs_action: false,
  actions: [],
  created_at: '2026-10-08T12:00:00.000Z',
  updated_at: '2026-10-08T12:00:00.000Z',
};

/** A linked record by id and name (a manufacturer's suppliers and MRs, 11.A.6). */
const namedLinkSchema = {
  type: 'object',
  properties: { id: { type: 'string' }, name: { type: 'string' } },
};

/** A manufacturer chip — id, name and tone (11.B.6, 11.D.6, 11.F.6). */
const manufacturerChipSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'mfr_k7x9m2pqr4w8n1v3a1b2c' },
    name: { type: 'string', example: 'ALVI' },
    tone: { type: 'string', enum: ['lav', 'sky', 'butter', 'blush', 'sage', 'mint'] },
  },
};

/** `ManufacturerOutput` — a brand on the store's packs (launch #153, routes-final 11.A.6). */
export const manufacturersRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'mfr_k7x9m2pqr4w8n1v3a1b2c' },
    name: { type: 'string', example: 'ALVI', description: 'Stored upper case, unique in any case' },
    tone: { type: 'string', enum: ['lav', 'sky', 'butter', 'blush', 'sage', 'mint'] },
    is_quick: { type: 'boolean' },
    medicine_count: { type: 'integer', description: 'Live medicines of this brand' },
    suppliers: { type: 'array', items: namedLinkSchema },
    medical_reps: { type: 'array', items: namedLinkSchema },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `ManufacturerOutput`. */
export const manufacturersRecordExample = {
  id: 'mfr_k7x9m2pqr4w8n1v3a1b2c',
  name: 'ALVI',
  tone: 'sky',
  is_quick: false,
  medicine_count: 4,
  suppliers: [{ id: 'sup_k7x9m2pqr4w8n1v3a1b2c', name: 'Shree Medical Agency' }],
  medical_reps: [{ id: 'mrep_k7x9m2pqr4w8n1v3a1b2c', name: 'Alvio Pharma · Rakesh' }],
  created_at: '2026-10-08T10:30:00.000Z',
  updated_at: '2026-10-08T10:30:00.000Z',
};

/** `SupplierOutput` — an agency the store buys from, with what it is owed (11.B.6). */
export const suppliersRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'sup_k7x9m2pqr4w8n1v3a1b2c' },
    name: { type: 'string' },
    phone: { type: 'string', example: '+919825044120', nullable: true },
    gst_number: { type: 'string', example: '24ABCDE1234F1Z5', nullable: true },
    is_quick: { type: 'boolean' },
    manufacturers: { type: 'array', items: manufacturerChipSchema },
    payable: {
      type: 'number',
      description: "Received orders' dues less open credits, rupees (never below 0)",
    },
    ageing_days: {
      type: 'integer',
      nullable: true,
      description: 'Days since the oldest received order still due',
    },
    order_count: { type: 'integer' },
    order_total: {
      type: 'number',
      description:
        "The live orders' totals — an ordered one at its lines, a received one at its received lines",
    },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `SupplierOutput`. */
export const suppliersRecordExample = {
  id: 'sup_k7x9m2pqr4w8n1v3a1b2c',
  name: 'Shree Medical Agency',
  phone: '+919825044120',
  gst_number: '24ABCDE1234F1Z5',
  is_quick: false,
  manufacturers: [{ id: 'mfr_k7x9m2pqr4w8n1v3a1b2c', name: 'ALVI', tone: 'sky' }],
  payable: 827,
  ageing_days: 12,
  order_count: 3,
  order_total: 4236,
  created_at: '2026-10-08T10:30:00.000Z',
  updated_at: '2026-10-08T10:30:00.000Z',
};

/** `MedicalRepOutput` — a medical representative (11.F.6). */
export const medicalRepsRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'mrep_k7x9m2pqr4w8n1v3a1b2c' },
    name: { type: 'string', example: 'Alvio Pharma · Rakesh' },
    phone: { type: 'string', nullable: true },
    next_visit_on: { type: 'string', format: 'date', nullable: true },
    is_visit_overdue: { type: 'boolean' },
    last_visit_on: { type: 'string', format: 'date', nullable: true },
    last_samples: { type: 'string', nullable: true },
    manufacturers: { type: 'array', items: manufacturerChipSchema },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `MedicalRepOutput`. */
export const medicalRepsRecordExample = {
  id: 'mrep_k7x9m2pqr4w8n1v3a1b2c',
  name: 'Alvio Pharma · Rakesh',
  phone: '+919825044121',
  next_visit_on: '2026-10-22',
  is_visit_overdue: false,
  last_visit_on: '2026-10-08',
  last_samples: '2 strips Alvi-D',
  manufacturers: [{ id: 'mfr_k7x9m2pqr4w8n1v3a1b2c', name: 'ALVI', tone: 'sky' }],
  created_at: '2026-10-08T10:30:00.000Z',
  updated_at: '2026-10-08T10:30:00.000Z',
};

/** `MedicalRepVisitOutput` — one logged MR visit (11.G.6). */
export const medicalRepVisitsRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'mrv_k7x9m2pqr4w8n1v3a1b2c' },
    medical_rep_id: { type: 'string' },
    visit_date: { type: 'string', format: 'date' },
    next_visit_on: { type: 'string', format: 'date', nullable: true },
    samples: { type: 'string', nullable: true },
    notes: { type: 'string', nullable: true },
    logged_by_membership_id: { type: 'string', nullable: true },
    created_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `MedicalRepVisitOutput`. */
export const medicalRepVisitsRecordExample = {
  id: 'mrv_k7x9m2pqr4w8n1v3a1b2c',
  medical_rep_id: 'mrep_k7x9m2pqr4w8n1v3a1b2c',
  visit_date: '2026-10-08',
  next_visit_on: '2026-10-22',
  samples: '2 strips Alvi-D',
  notes: 'New moisturiser launch next month',
  logged_by_membership_id: 'mem_k7x9m2pqr4w8n1v3a1b2c',
  created_at: '2026-10-08T10:30:00.000Z',
};

/** `MedicineOutput` — a medicine with its stock by batch (11.D.6). */
export const medicinesRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'med_k7x9m2pqr4w8n1v3a1b2c' },
    medicine_number: { type: 'integer', description: '#458' },
    name: { type: 'string' },
    composition: { type: 'string', nullable: true },
    manufacturer: { ...manufacturerChipSchema, nullable: true },
    is_prescription_only: { type: 'boolean' },
    mrp: { type: 'number', description: 'GST inside, rupees' },
    gst_percent: { type: 'integer', enum: [0, 5, 12, 18, 28] },
    price_before_gst: { type: 'number' },
    min_stock: { type: 'integer', description: 'Reorder at' },
    max_stock: { type: 'integer', description: 'Fill up to' },
    quantity: { type: 'integer', description: "Its batches' sum" },
    stock_level: { type: 'string', enum: ['ok', 'low', 'out'] },
    nearest_expiry: {
      type: 'object',
      nullable: true,
      properties: {
        expiry_month: { type: 'string', example: '2027-03' },
        batch_number: { type: 'string' },
      },
    },
    near_expiry_discount_percent: { type: 'number', nullable: true },
    best_rate: {
      type: 'object',
      nullable: true,
      properties: {
        rate: { type: 'number' },
        supplier_id: { type: 'string' },
        supplier_name: { type: 'string' },
      },
    },
    margin_percent: { type: 'number', nullable: true },
    is_quick: { type: 'boolean' },
    needs_details: { type: 'boolean' },
    batches: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'mbt_k7x9m2pqr4w8n1v3a1b2c' },
          batch_number: { type: 'string' },
          expiry_month: { type: 'string', example: '2027-03' },
          quantity: { type: 'integer' },
          purchase_rate: { type: 'number', nullable: true },
          supplier_id: { type: 'string', nullable: true },
          is_expired: { type: 'boolean' },
        },
      },
    },
    supplier_prices: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          supplier_id: { type: 'string' },
          supplier_name: { type: 'string' },
          rate: { type: 'number' },
          free_quantity: { type: 'integer' },
          lead_days: { type: 'integer' },
        },
      },
    },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `MedicineOutput`. */
export const medicinesRecordExample = {
  id: 'med_k7x9m2pqr4w8n1v3a1b2c',
  medicine_number: 458,
  name: 'Glycolac Cream',
  composition: 'Glycolic acid 6%',
  manufacturer: { id: 'mfr_k7x9m2pqr4w8n1v3a1b2c', name: 'ALVI', tone: 'sky' },
  is_prescription_only: false,
  mrp: 369,
  gst_percent: 12,
  price_before_gst: 329.46,
  min_stock: 2,
  max_stock: 10,
  quantity: 7,
  stock_level: 'ok',
  nearest_expiry: { expiry_month: '2027-03', batch_number: 'GC2403' },
  near_expiry_discount_percent: null,
  best_rate: {
    rate: 246,
    supplier_id: 'sup_k7x9m2pqr4w8n1v3a1b2c',
    supplier_name: 'Shree Medical Agency',
  },
  margin_percent: 33.33,
  is_quick: false,
  needs_details: false,
  batches: [
    {
      id: 'mbt_k7x9m2pqr4w8n1v3a1b2c',
      batch_number: 'GC2403',
      expiry_month: '2027-03',
      quantity: 7,
      purchase_rate: 246,
      supplier_id: 'sup_k7x9m2pqr4w8n1v3a1b2c',
      is_expired: false,
    },
  ],
  supplier_prices: [
    {
      supplier_id: 'sup_k7x9m2pqr4w8n1v3a1b2c',
      supplier_name: 'Shree Medical Agency',
      rate: 246,
      free_quantity: 0,
      lead_days: 2,
    },
  ],
  created_at: '2026-10-08T10:30:00.000Z',
  updated_at: '2026-10-08T10:30:00.000Z',
};

/** `{ updated_count }` — what the near-expiry discount changed (11.D.8 #24). */
export const nearExpiryDiscountResultSchema = {
  type: 'object',
  properties: { updated_count: { type: 'integer' } },
};

/** Example near-expiry discount result. */
export const nearExpiryDiscountResultExample = { updated_count: 3 };

/** `MedicalPurchaseOrderOutput` — an order to a supplier: ordered, then received (11.E.6). */
export const medicalPurchaseOrdersRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'mpo_k7x9m2pqr4w8n1v3a1b2c' },
    purchase_order_number: { type: 'integer', description: 'PO #431' },
    supplier: {
      type: 'object',
      description: "The supplier — with its phone and GSTIN, a deleted one's too (the PO sheet)",
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        phone: { type: 'string', nullable: true },
        gst_number: { type: 'string', nullable: true },
      },
    },
    supplier_bill_number: { type: 'string', nullable: true },
    order_date: { type: 'string', format: 'date' },
    stage: { type: 'string', enum: ['ordered', 'received'] },
    received_at: { type: 'string', format: 'date-time', nullable: true },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'mpoi_k7x9m2pqr4w8n1v3a1b2c' },
          line_number: { type: 'integer' },
          medicine_id: { type: 'string' },
          medicine_name: { type: 'string' },
          quantity: { type: 'integer' },
          free_quantity: { type: 'integer' },
          rate: { type: 'number' },
          amount: {
            type: 'number',
            description: 'taxable_amount + gst_amount — quantity × rate when the rate includes GST',
          },
          gst_percent: { type: 'integer', enum: [0, 5, 12, 18, 28] },
          is_gst_inclusive: { type: 'boolean', description: 'The rate includes GST' },
          taxable_amount: { type: 'number' },
          gst_amount: { type: 'number' },
          is_received: { type: 'boolean', nullable: true },
          batch_number: { type: 'string', nullable: true },
          expiry_month: { type: 'string', nullable: true, example: '2028-10' },
        },
      },
    },
    item_count: { type: 'integer' },
    free_count: { type: 'integer' },
    total: { type: 'number', description: 'taxable_total + gst_total' },
    taxable_total: { type: 'number' },
    gst_total: { type: 'number' },
    paid_amount: { type: 'number' },
    credited_amount: { type: 'number' },
    due_amount: { type: 'number' },
    payment_status: { type: 'string', enum: ['unpaid', 'partial', 'paid'] },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
    deleted_at: { type: 'string', format: 'date-time', nullable: true },
    delete_reason: {
      type: 'string',
      nullable: true,
      enum: ['mistake', 'supplier_cant_deliver', 'price_changed', 'other'],
    },
    delete_note: { type: 'string', nullable: true },
  },
};

/** Example `MedicalPurchaseOrderOutput`. */
export const medicalPurchaseOrdersRecordExample = {
  id: 'mpo_k7x9m2pqr4w8n1v3a1b2c',
  purchase_order_number: 431,
  supplier: {
    id: 'sup_k7x9m2pqr4w8n1v3a1b2c',
    name: 'Shree Medical Agency',
    phone: '+919825011223',
    gst_number: '24AABCS1429B1Z5',
  },
  supplier_bill_number: 'SMA-2291',
  order_date: '2026-10-08',
  stage: 'received',
  received_at: '2026-10-08T12:00:00.000Z',
  items: [
    {
      id: 'mpoi_k7x9m2pqr4w8n1v3a1b2c',
      line_number: 1,
      medicine_id: 'med_k7x9m2pqr4w8n1v3a1b2c',
      medicine_name: 'Glycolac Cream',
      quantity: 10,
      free_quantity: 1,
      rate: 246,
      amount: 2460,
      gst_percent: 12,
      is_gst_inclusive: true,
      taxable_amount: 2196.43,
      gst_amount: 263.57,
      is_received: true,
      batch_number: 'GC2403',
      expiry_month: '2028-10',
    },
  ],
  item_count: 1,
  free_count: 1,
  total: 2460,
  taxable_total: 2196.43,
  gst_total: 263.57,
  paid_amount: 1633,
  credited_amount: 0,
  due_amount: 827,
  payment_status: 'partial',
  created_at: '2026-10-08T10:30:00.000Z',
  updated_at: '2026-10-08T12:00:00.000Z',
  deleted_at: null,
  delete_reason: null,
  delete_note: null,
};

/** The amounts of one group of the purchase GST summary. */
const purchaseGstAmountsProperties = {
  line_count: { type: 'integer' },
  taxable_amount: { type: 'number' },
  gst_amount: { type: 'number' },
  total_amount: { type: 'number' },
};

/** `MedicalPurchaseGstSummaryOutput` — one month's purchase GST by rate and HSN code (PG9). */
export const medicalPurchaseGstSummarySchema = {
  type: 'object',
  properties: {
    month: { type: 'string', example: '2026-10' },
    by_rate: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          gst_percent: { type: 'integer', enum: [0, 5, 12, 18, 28] },
          ...purchaseGstAmountsProperties,
        },
      },
    },
    by_hsn: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          hsn_code: { type: 'string', nullable: true, description: 'Null: medicines without one' },
          gst_percent: { type: 'integer', enum: [0, 5, 12, 18, 28] },
          ...purchaseGstAmountsProperties,
        },
      },
    },
    totals: {
      type: 'object',
      properties: { order_count: { type: 'integer' }, ...purchaseGstAmountsProperties },
    },
  },
};

/** Example `MedicalPurchaseGstSummaryOutput`. */
export const medicalPurchaseGstSummaryExample = {
  month: '2026-10',
  by_rate: [
    { gst_percent: 0, line_count: 1, taxable_amount: 500, gst_amount: 0, total_amount: 500 },
    {
      gst_percent: 12,
      line_count: 2,
      taxable_amount: 3196.43,
      gst_amount: 383.57,
      total_amount: 3580,
    },
  ],
  by_hsn: [
    {
      hsn_code: '30049099',
      gst_percent: 12,
      line_count: 2,
      taxable_amount: 3196.43,
      gst_amount: 383.57,
      total_amount: 3580,
    },
    {
      hsn_code: null,
      gst_percent: 0,
      line_count: 1,
      taxable_amount: 500,
      gst_amount: 0,
      total_amount: 500,
    },
  ],
  totals: {
    order_count: 2,
    line_count: 3,
    taxable_amount: 3696.43,
    gst_amount: 383.57,
    total_amount: 4080,
  },
};

/** `MedicalSaleOutput` — one sale and its `medical` invoice (11.H.6). */
export const medicalSalesRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'msal_k7x9m2pqr4w8n1v3a1b2c' },
    sale_number: { type: 'integer', description: 'S-983' },
    status: { type: 'string', enum: ['unpaid', 'paid', 'returned', 'voided'] },
    contact: {
      type: 'object',
      nullable: true,
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        primary_phone: { type: 'string' },
      },
    },
    patient_id: { type: 'string', nullable: true },
    branch_id: { type: 'string' },
    invoice: {
      type: 'object',
      nullable: true,
      properties: {
        id: { type: 'string' },
        invoice_number: { type: 'string' },
        total: { type: 'number' },
        paid_amount: { type: 'number' },
        due_amount: { type: 'number' },
        payment_status: { type: 'string', enum: ['unpaid', 'partial', 'paid'] },
      },
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          invoice_item_id: { type: 'string' },
          medicine_id: { type: 'string', nullable: true },
          name: { type: 'string' },
          description: {
            type: 'string',
            nullable: true,
            description: "The line's free text, printed under its name (up to 280).",
          },
          batch_number: { type: 'string', nullable: true },
          expiry_month: { type: 'string', nullable: true },
          quantity: { type: 'integer' },
          rate: { type: 'number' },
          discount_percent: { type: 'number' },
          amount: { type: 'number' },
          returned_quantity: { type: 'integer' },
        },
      },
    },
    returned_amount: { type: 'number' },
    margin_amount: { type: 'number' },
    margin_percent: { type: 'number', nullable: true },
    member_ids: { type: 'array', items: { type: 'string' } },
    patient_prescription_id: { type: 'string', nullable: true },
    remark: { type: 'string', nullable: true },
    returns: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'msrt_k7x9m2pqr4w8n1v3a1b2c' },
          reason: {
            type: 'string',
            enum: ['unused', 'reaction', 'doctor_changed', 'wrong_item', 'damaged'],
          },
          refund_mode: {
            type: 'string',
            enum: ['cash', 'upi', 'card', 'credit'],
            description: '`credit` — kept as store credit, no money moved (MD33)',
          },
          note: { type: 'string', nullable: true },
          amount: { type: 'number' },
          invoice_credit_note_id: { type: 'string' },
          pending_credit_id: {
            type: 'string',
            nullable: true,
            description: "A store-credit return's `give` pending credit (MD33)",
          },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                invoice_item_id: { type: 'string' },
                quantity: { type: 'integer' },
                amount: { type: 'number' },
                is_restocked: { type: 'boolean' },
              },
            },
          },
          returned_by_membership_id: { type: 'string', nullable: true },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
    },
    sold_at: { type: 'string', format: 'date-time' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
    deleted_at: { type: 'string', format: 'date-time', nullable: true },
    delete_reason: {
      type: 'string',
      nullable: true,
      enum: ['billed_by_mistake', 'wrong_items', 'customer_changed_mind', 'other'],
    },
    delete_note: { type: 'string', nullable: true },
  },
};

/** Example `MedicalSaleOutput`. */
export const medicalSalesRecordExample = {
  id: 'msal_k7x9m2pqr4w8n1v3a1b2c',
  sale_number: 983,
  status: 'paid',
  contact: { id: 'con_k7x9m2pqr4w8n1v3a1b2c', name: 'Asha Patel', primary_phone: '+919825044122' },
  patient_id: 'pat_k7x9m2pqr4w8n1v3a1b2c',
  branch_id: 'brn_k7x9m2pqr4w8n1v3a1b2c',
  invoice: {
    id: 'inv_k7x9m2pqr4w8n1v3a1b2c',
    invoice_number: '2026-27/0412',
    total: 563,
    paid_amount: 563,
    due_amount: 0,
    payment_status: 'paid',
  },
  items: [
    {
      invoice_item_id: 'invi_k7x9m2pqr4w8n1v3a1b2c',
      medicine_id: 'med_k7x9m2pqr4w8n1v3a1b2c',
      name: 'Glycolac Cream',
      description: null,
      batch_number: 'GC2403',
      expiry_month: '2027-03',
      quantity: 1,
      rate: 369,
      discount_percent: 0,
      amount: 369,
      returned_quantity: 0,
    },
  ],
  returned_amount: 0,
  margin_amount: 123,
  margin_percent: 33.33,
  member_ids: ['mem_k7x9m2pqr4w8n1v3a1b2c'],
  patient_prescription_id: null,
  remark: null,
  returns: [],
  sold_at: '2026-10-08T12:00:00.000Z',
  created_at: '2026-10-08T12:00:00.000Z',
  updated_at: '2026-10-08T12:00:00.000Z',
  deleted_at: null,
  delete_reason: null,
  delete_note: null,
};

/** `SupplierCreditOutput` — stock returned to a supplier, owed back (11.C.6). */
export const supplierCreditsRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'scr_k7x9m2pqr4w8n1v3a1b2c' },
    supplier_id: { type: 'string' },
    supplier_name: { type: 'string' },
    medicine_id: { type: 'string' },
    medicine_name: { type: 'string' },
    medicine_batch_id: { type: 'string' },
    batch_number: { type: 'string' },
    quantity: { type: 'integer' },
    rate: { type: 'number', description: "The batch's purchase rate" },
    amount: { type: 'number', description: 'quantity × rate' },
    applied_amount: { type: 'number', description: "Set against the supplier's dues" },
    status: { type: 'string', enum: ['open', 'adjusted'] },
    created_by_membership_id: { type: 'string', nullable: true },
    created_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `SupplierCreditOutput`. */
export const supplierCreditsRecordExample = {
  id: 'scr_k7x9m2pqr4w8n1v3a1b2c',
  supplier_id: 'sup_k7x9m2pqr4w8n1v3a1b2c',
  supplier_name: 'Shree Medical Agency',
  medicine_id: 'med_k7x9m2pqr4w8n1v3a1b2c',
  medicine_name: 'Glycolac Cream',
  medicine_batch_id: 'mbt_k7x9m2pqr4w8n1v3a1b2c',
  batch_number: 'GC2403',
  quantity: 1,
  rate: 369,
  amount: 369,
  applied_amount: 369,
  status: 'adjusted',
  created_by_membership_id: 'mem_k7x9m2pqr4w8n1v3a1b2c',
  created_at: '2026-10-08T12:00:00.000Z',
};

/** `StockVendorOutput` — who the clinic buys consumables from (launch #137, routes-final 9.E.6). */
export const stockVendorsRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'svnd_k7x9m2pqr4w8n1v3a1b2c' },
    name: { type: 'string' },
    phone: { type: 'string', example: '+919825044120', nullable: true },
    is_quick: { type: 'boolean', description: 'Added inline from a picker' },
    payable: { type: 'number', description: 'The open dues of its live purchases (S13)' },
    purchase_count: {
      type: 'integer',
      description: 'How many live purchases it has, paid or not (D81)',
    },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `StockVendorOutput`. */
export const stockVendorsRecordExample = {
  id: 'svnd_k7x9m2pqr4w8n1v3a1b2c',
  name: 'Skin Supplies',
  phone: '+919800000001',
  is_quick: false,
  payable: 350,
  purchase_count: 3,
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `StockItemOutput` — a consumable or piece of equipment (launch #137, routes-final 9.A.6). */
export const stockItemsRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'sitm_k7x9m2pqr4w8n1v3a1b2c' },
    stock_item_number: { type: 'integer', description: '#167' },
    name: { type: 'string' },
    category: {
      type: 'string',
      enum: ['creams_serums', 'peels', 'masks', 'consumables', 'equipment', 'other'],
    },
    unit: {
      type: 'string',
      enum: [
        'piece',
        'tube',
        'bottle',
        'kit',
        'pack',
        'box',
        'vial',
        'ampoule',
        'sachet',
        'jar',
        'roll',
        'pair',
        'ml',
        'g',
        'litre',
      ],
    },
    size_per_unit: { type: 'number', nullable: true, description: '1 tube = 30 g' },
    measure_unit: { type: 'string', enum: ['ml', 'g', 'pcs', 'units'], nullable: true },
    quantity: { type: 'number', description: 'The balance — moved only by movements (S5)' },
    min_quantity: { type: 'number' },
    max_quantity: { type: 'number' },
    usage_per_week: { type: 'number' },
    stock_vendor_id: { type: 'string', nullable: true },
    last_rate: { type: 'number', nullable: true, description: "The latest purchase line's rate" },
    stock_level: { type: 'string', enum: ['ok', 'low', 'out'] },
    lasts_days: { type: 'integer', nullable: true, description: 'Null without a weekly usage' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `StockItemOutput`. */
export const stockItemsRecordExample = {
  id: 'sitm_k7x9m2pqr4w8n1v3a1b2c',
  stock_item_number: 167,
  name: 'Glycolic peel 30%',
  category: 'peels',
  unit: 'bottle',
  size_per_unit: 30,
  measure_unit: 'ml',
  quantity: 3.5,
  min_quantity: 2,
  max_quantity: 6,
  usage_per_week: 1.5,
  stock_vendor_id: 'svnd_k7x9m2pqr4w8n1v3a1b2c',
  last_rate: 450,
  stock_level: 'ok',
  lasts_days: 16,
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `StockItemMovementOutput` — one change to an item's quantity (launch #137, routes-final 9.B.6). */
export const stockItemMovementsRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'smov_k7x9m2pqr4w8n1v3a1b2c' },
    stock_item_id: { type: 'string' },
    type: {
      type: 'string',
      enum: ['opening', 'received', 'used', 'damaged', 'returned', 'adjust', 'reverted'],
    },
    quantity_change: { type: 'number', description: 'Signed by the type (S7)' },
    quantity_after: { type: 'number', description: 'The balance this row left' },
    used_for: { type: 'string', nullable: true },
    note: { type: 'string', nullable: true },
    patient_treatment_id: { type: 'string', nullable: true },
    stock_purchase_id: { type: 'string', nullable: true },
    stock_purchase_number: {
      type: 'integer',
      nullable: true,
      description: "The purchase's number (#16) — on a row with a purchase (D81)",
    },
    bill_number: {
      type: 'string',
      nullable: true,
      description: "The purchase's bill number, when it has one (D81)",
    },
    stock_count_id: { type: 'string', nullable: true },
    reverts_stock_item_movement_id: { type: 'string', nullable: true },
    reverts_type: {
      type: 'string',
      enum: ['opening', 'received', 'used', 'damaged', 'returned', 'adjust'],
      nullable: true,
      description: 'On a reverted row: the type of the movement it undid (D81)',
    },
    reverts_created_at: {
      type: 'string',
      format: 'date-time',
      nullable: true,
      description: 'On a reverted row: when the movement it undid was written (D81)',
    },
    reverted_by_stock_item_movement_id: { type: 'string', nullable: true },
    revert_reason: {
      type: 'string',
      enum: ['mistake', 'wrong_item', 'wrong_quantity', 'other'],
      nullable: true,
    },
    author_membership_id: { type: 'string', nullable: true },
    created_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `StockItemMovementOutput`. */
export const stockItemMovementsRecordExample = {
  id: 'smov_k7x9m2pqr4w8n1v3a1b2c',
  stock_item_id: 'sitm_k7x9m2pqr4w8n1v3a1b2c',
  type: 'used',
  quantity_change: -1.5,
  quantity_after: 3.5,
  used_for: 'Peel session',
  note: null,
  patient_treatment_id: 'ptrt_k7x9m2pqr4w8n1v3a1b2c',
  stock_purchase_id: null,
  stock_purchase_number: null,
  bill_number: null,
  stock_count_id: null,
  reverts_stock_item_movement_id: null,
  reverts_type: null,
  reverts_created_at: null,
  reverted_by_stock_item_movement_id: null,
  revert_reason: null,
  author_membership_id: 'mem_k7x9m2pqr4w8n1v3a1b2c',
  created_at: '2026-10-07T10:30:00.000Z',
};

/** `StockCountOutput` — one stock check (launch #137, routes-final 9.C.6). */
export const stockCountsRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'scnt_k7x9m2pqr4w8n1v3a1b2c' },
    counted_at: { type: 'string', format: 'date-time' },
    author_membership_id: { type: 'string', nullable: true },
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          stock_item_id: { type: 'string' },
          system_quantity: { type: 'number', description: 'The balance when saved' },
          counted_quantity: { type: 'number' },
          difference: { type: 'number' },
        },
      },
    },
    changed_item_count: { type: 'integer' },
    created_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `StockCountOutput`. */
export const stockCountsRecordExample = {
  id: 'scnt_k7x9m2pqr4w8n1v3a1b2c',
  counted_at: '2026-10-08T10:00:00.000Z',
  author_membership_id: 'mem_k7x9m2pqr4w8n1v3a1b2c',
  lines: [
    {
      stock_item_id: 'sitm_k7x9m2pqr4w8n1v3a1b2c',
      system_quantity: 3.5,
      counted_quantity: 3,
      difference: -0.5,
    },
  ],
  changed_item_count: 1,
  created_at: '2026-10-08T10:00:00.000Z',
};

/** `StockPurchaseOutput` — a vendor bill (launch #137, routes-final 9.D.6). */
export const stockPurchasesRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'spur_k7x9m2pqr4w8n1v3a1b2c' },
    stock_purchase_number: { type: 'integer', description: '#16' },
    stock_vendor_id: { type: 'string' },
    bill_number: { type: 'string', nullable: true },
    purchase_date: { type: 'string', format: 'date' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          line_number: { type: 'integer' },
          stock_item_id: { type: 'string' },
          quantity: { type: 'number' },
          rate: { type: 'number' },
          amount: { type: 'number' },
        },
      },
    },
    bill_amount: { type: 'number' },
    paid_amount: { type: 'number', description: 'Kept by its supplier-bill payments (S11)' },
    due_amount: { type: 'number' },
    payment_status: { type: 'string', enum: ['paid', 'partial', 'unpaid'] },
    payment_ids: { type: 'array', items: { type: 'string' } },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `StockPurchaseOutput`. */
export const stockPurchasesRecordExample = {
  id: 'spur_k7x9m2pqr4w8n1v3a1b2c',
  stock_purchase_number: 16,
  stock_vendor_id: 'svnd_k7x9m2pqr4w8n1v3a1b2c',
  bill_number: 'SS-2041',
  purchase_date: '2026-10-08',
  items: [
    {
      line_number: 1,
      stock_item_id: 'sitm_k7x9m2pqr4w8n1v3a1b2c',
      quantity: 4,
      rate: 450,
      amount: 1800,
    },
  ],
  bill_amount: 1800,
  paid_amount: 1000,
  due_amount: 800,
  payment_status: 'partial',
  payment_ids: ['pay_k7x9m2pqr4w8n1v3a1b2c'],
  created_at: '2026-10-08T10:30:00.000Z',
  updated_at: '2026-10-08T10:30:00.000Z',
};

/** `TaskOutput` (routes-final 10.A.6). */
export const tasksRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'task_k7x9m2pqr4w8n1v3a1b2c' },
    kind: { type: 'string', enum: ['rule', 'follow_up', 'manual'] },
    rule_key: { type: 'string', enum: [...TASK_RULE_VALUES], nullable: true },
    title: {
      type: 'string',
      description:
        'A rule task\'s (`kind` `rule`) is the server\'s English line, written once when the rule opened it, with the person\'s first name in it ("Reply to Anaya", "Collect the due on 2026-27/0412") — a client in another language builds its own from `rule_key` and the linked record (`contact`, `appointment_id`, `invoice_id`, …). A hand-made or follow-up task\'s is what its author typed',
    },
    why: {
      type: 'string',
      nullable: true,
      description:
        'A rule task\'s is the server\'s English reason, written when the rule opened it ("Their message is waiting for a reply", "Visit on 12 Oct" — dates as `DD Mon`, money unformatted: "₹3540.00 due from Anaya"); a pending credit\'s is the credit\'s reason as typed. A hand-made task\'s is what its author typed',
    },
    owner_membership_id: { type: 'string', nullable: true },
    owner_role: {
      type: 'string',
      enum: [
        'owner',
        'admin',
        'doctor',
        'therapist',
        'front_desk',
        'counsellor',
        'pharmacist',
        'accountant',
        'marketing',
      ],
      nullable: true,
    },
    contact: {
      type: 'object',
      nullable: true,
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        primary_phone: { type: 'string', nullable: true },
        preference_tags: { type: 'array', items: { type: 'string' } },
      },
    },
    lead_id: { type: 'string', nullable: true },
    appointment_id: { type: 'string', nullable: true },
    patient_treatment_id: { type: 'string', nullable: true },
    patient_check_in_id: { type: 'string', nullable: true },
    patient_review_id: { type: 'string', nullable: true },
    invoice_id: { type: 'string', nullable: true },
    pending_credit_id: { type: 'string', nullable: true },
    medical_rep_id: { type: 'string', nullable: true },
    branch_id: { type: 'string', nullable: true },
    due_at: { type: 'string', format: 'date-time' },
    status: { type: 'string', enum: ['open', 'snoozed', 'done'] },
    snoozed_until: { type: 'string', format: 'date-time', nullable: true },
    snooze_label: {
      type: 'string',
      nullable: true,
      description: `What the snoozer sent ("Tomorrow 10:00"); \`No answer\` (English) when a \`no_answer\` outcome snoozed it for ${TASK_NO_ANSWER_SNOOZE_HOURS} hours — read \`snoozed_until\` for the time`,
    },
    outcome: {
      type: 'string',
      enum: ['done', 'no_answer', 'doing_well', 'log_check_in', 'happy', 'unhappy'],
      nullable: true,
    },
    result_text: {
      type: 'string',
      nullable: true,
      description: `The outcome's label as the resolver sent it; \`${TASK_DONE_BY_CLINOZY}\` (English) when the rule closed the task itself (\`is_resolved_automatically\`) — render by \`outcome\` and \`is_resolved_automatically\``,
    },
    note: { type: 'string', nullable: true },
    resolved_at: { type: 'string', format: 'date-time', nullable: true },
    is_resolved_automatically: { type: 'boolean' },
    resolved_by_membership_id: { type: 'string', nullable: true },
    priority: { type: 'string', enum: ['low', 'normal', 'high'] },
    owner_changes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from_membership_id: { type: 'string', nullable: true },
          from_role: { type: 'string', nullable: true },
          to_membership_id: { type: 'string', nullable: true },
          to_role: { type: 'string', nullable: true },
          changed_by_membership_id: { type: 'string', nullable: true },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
    },
    can_clinozy_handle: { type: 'boolean' },
    next_task_id: { type: 'string', nullable: true },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `TaskOutput` — a Confirm task in the front desk queue. */
export const tasksRecordExample = {
  id: 'task_k7x9m2pqr4w8n1v3a1b2c',
  kind: 'rule',
  rule_key: 'confirm',
  title: "Confirm Asha's visit",
  why: 'Visit on 09 Oct at 11:30',
  owner_membership_id: null,
  owner_role: 'front_desk',
  contact: {
    id: 'con_k7x9m2pqr4w8n1v3a1b2c',
    name: 'Asha Rao',
    primary_phone: '+919812345678',
    preference_tags: ['prefers_whatsapp'],
  },
  lead_id: null,
  appointment_id: 'appt_k7x9m2pqr4w8n1v3a1b2c',
  patient_treatment_id: null,
  patient_check_in_id: null,
  patient_review_id: null,
  invoice_id: null,
  pending_credit_id: null,
  medical_rep_id: null,
  branch_id: 'brn_k7x9m2pqr4w8n1v3a1b2c',
  due_at: '2026-10-08T12:30:00.000Z',
  status: 'open',
  snoozed_until: null,
  snooze_label: null,
  outcome: null,
  result_text: null,
  note: null,
  resolved_at: null,
  is_resolved_automatically: false,
  resolved_by_membership_id: null,
  priority: 'normal',
  owner_changes: [],
  can_clinozy_handle: true,
  next_task_id: null,
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `TaskRuleSettingOutput` (routes-final 10.B.6) — `id` and `updated_at` null for a rule never saved. */
export const taskRuleSettingsRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', nullable: true, example: 'trs_k7x9m2pqr4w8n1v3a1b2c' },
    rule_key: { type: 'string', enum: [...TASK_RULE_VALUES] },
    is_on: { type: 'boolean' },
    is_automatic: { type: 'boolean' },
    can_be_automatic: { type: 'boolean' },
    updated_at: { type: 'string', format: 'date-time', nullable: true },
  },
};

/** Example `TaskRuleSettingOutput`. */
export const taskRuleSettingsRecordExample = {
  id: 'trs_k7x9m2pqr4w8n1v3a1b2c',
  rule_key: 'confirm',
  is_on: true,
  is_automatic: true,
  can_be_automatic: true,
  updated_at: '2026-10-07T10:30:00.000Z',
};

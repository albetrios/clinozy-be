/** OpenAPI response schemas — the app record tables (launch iteration, generated from the table specs). */

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
      description: 'The CSV text (RFC 4180, CRLF)',
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
    default_doctor_membership_id: {
      type: 'string',
      nullable: true,
    },
    default_room_id: {
      type: 'string',
      nullable: true,
    },
    gst_percent: {
      type: 'integer',
    },
    is_active: {
      type: 'boolean',
    },
    group_id: {
      type: 'string',
      nullable: true,
    },
    offer_price: {
      type: 'number',
      nullable: true,
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
  min_price: 100,
  duration_minutes: 5,
  sessions: 1,
  validity_days: 1,
  default_doctor_membership_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  default_room_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  gst_percent: 1,
  is_active: true,
  group_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  offer_price: 100,
  branch_ids: ['ref_k7x9m2pqr4w8n1v3a1b2c'],
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
    is_paused: {
      type: 'boolean',
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
  code: 'Sample code',
  kind: 'percent',
  value: 100,
  offering_ids: ['ref_k7x9m2pqr4w8n1v3a1b2c'],
  branch_ids: ['ref_k7x9m2pqr4w8n1v3a1b2c'],
  starts_on: '2026-10-08',
  ends_on: '2026-10-08',
  is_paused: true,
  tone: 'sky',
  note: 'Sample note',
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `PatientOutput`. */
export const patientsRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'pat_k7x9m2pqr4w8n1v3a1b2c',
    },
    patient_number: {
      type: 'integer',
    },
    first_name: {
      type: 'string',
    },
    last_name: {
      type: 'string',
      nullable: true,
    },
    phone: {
      type: 'string',
      example: '+919825044120',
    },
    phones: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
    email: {
      type: 'string',
      format: 'email',
      nullable: true,
    },
    gender: {
      type: 'string',
      enum: ['female', 'male', 'other'],
      nullable: true,
    },
    date_of_birth: {
      type: 'string',
      format: 'date',
      nullable: true,
    },
    address: {
      type: 'string',
      nullable: true,
    },
    home_branch_id: {
      type: 'string',
    },
    types: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['aesthetic', 'clinical', 'lhr', 'dental', 'physio', 'gynac'],
      },
    },
    status: {
      type: 'string',
      enum: ['new', 'regular', 'vip', 'inactive'],
    },
    conversion: {
      type: 'string',
      enum: ['converted', 'not_converted'],
    },
    referral_source: {
      type: 'string',
      enum: ['patient', 'doctor', 'instagram', 'google', 'walk_in', 'other'],
      nullable: true,
    },
    referred_by_patient_id: {
      type: 'string',
      nullable: true,
    },
    referred_by_name: {
      type: 'string',
      nullable: true,
    },
    doctor_membership_id: {
      type: 'string',
      nullable: true,
    },
    follow_up_at: {
      type: 'string',
      format: 'date-time',
      nullable: true,
    },
    notes: {
      type: 'string',
      nullable: true,
    },
    lead_id: {
      type: 'string',
      nullable: true,
    },
    has_data_consent: {
      type: 'boolean',
    },
    has_photo_consent: {
      type: 'boolean',
    },
    has_marketing_consent: {
      type: 'boolean',
    },
    language: {
      type: 'string',
      nullable: true,
    },
    instagram_handles: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
    default_channel: {
      type: 'string',
      enum: ['whatsapp', 'call', 'sms', 'instagram', 'email', 'note'],
      nullable: true,
    },
    preferences: {},
    household: {
      type: 'string',
      nullable: true,
    },
    allergies: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
    contraindications: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
    last_visit_on: {
      type: 'string',
      nullable: true,
      description:
        'The date of the latest checked-in or completed appointment (YYYY-MM-DD) (per viewer, computed on read)',
    },
    next_visit_on: {
      type: 'string',
      nullable: true,
      description:
        'The date of the next scheduled or confirmed appointment (YYYY-MM-DD) (per viewer, computed on read)',
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

/** Example `PatientOutput`. */
export const patientsRecordExample = {
  id: 'pat_k7x9m2pqr4w8n1v3a1b2c',
  patient_number: 12,
  first_name: 'Sample first name',
  last_name: 'Sample last name',
  phone: '+919800000001',
  phones: ['sample'],
  email: 'sample@example.com',
  gender: 'female',
  date_of_birth: '2026-10-08',
  address: 'Sample address',
  home_branch_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  types: ['aesthetic'],
  status: 'new',
  conversion: 'not_converted',
  referral_source: 'patient',
  referred_by_patient_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  referred_by_name: 'Sample referred by name',
  doctor_membership_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  follow_up_at: '2026-10-08T10:00:00+05:30',
  notes: 'Sample notes',
  lead_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  has_data_consent: true,
  has_photo_consent: true,
  has_marketing_consent: true,
  language: 'Sample language',
  instagram_handles: ['sample'],
  default_channel: 'whatsapp',
  preferences: {},
  household: 'Sample household',
  allergies: ['sample'],
  contraindications: ['sample'],
  last_visit_on: null,
  next_visit_on: null,
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `LeadOutput`. */
export const leadsRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'lead_k7x9m2pqr4w8n1v3a1b2c',
    },
    lead_number: {
      type: 'integer',
    },
    name: {
      type: 'string',
    },
    phone: {
      type: 'string',
      example: '+919825044120',
    },
    email: {
      type: 'string',
      format: 'email',
      nullable: true,
    },
    status: {
      type: 'string',
      enum: [
        'new',
        'contacted',
        'follow_up',
        'clinic_visited',
        'no_response',
        'not_interested',
        'invalid',
        'lost',
      ],
      nullable: true,
    },
    source: {
      type: 'string',
      enum: ['instagram', 'google', 'whatsapp', 'facebook', 'walk_in', 'referral', 'retarget'],
      nullable: true,
    },
    interests: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['others', 'clinical', 'peel', 'lhr', 'hydrafacial', 'prp'],
      },
    },
    owner_membership_id: {
      type: 'string',
      nullable: true,
    },
    involved_membership_ids: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
    follow_up_at: {
      type: 'string',
      format: 'date-time',
      nullable: true,
    },
    branch_id: {
      type: 'string',
      nullable: true,
    },
    patient_id: {
      type: 'string',
      nullable: true,
    },
    is_contact_thread: {
      type: 'boolean',
    },
    kind: {
      type: 'string',
      enum: ['enquiry', 'retarget', 'contact_thread'],
    },
    retarget_reason: {
      type: 'string',
      nullable: true,
    },
    notes: {
      type: 'string',
      nullable: true,
    },
    last_touch_at: {
      type: 'string',
      format: 'date-time',
      nullable: true,
    },
    phones: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
    instagram_handles: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
    default_channel: {
      type: 'string',
      enum: ['whatsapp', 'call', 'sms', 'instagram', 'email', 'note'],
      nullable: true,
    },
    preferences: {},
    household: {
      type: 'string',
      nullable: true,
    },
    held_until: {
      type: 'string',
      format: 'date-time',
      nullable: true,
    },
    is_unread: {
      type: 'boolean',
      description:
        'The conversation has lines the caller has not read (per viewer, computed on read)',
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

/** Example `LeadOutput`. */
export const leadsRecordExample = {
  id: 'lead_k7x9m2pqr4w8n1v3a1b2c',
  lead_number: 12,
  name: 'Sample name',
  phone: '+919800000001',
  email: 'sample@example.com',
  status: 'new',
  source: 'instagram',
  interests: ['others'],
  owner_membership_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  involved_membership_ids: ['ref_k7x9m2pqr4w8n1v3a1b2c'],
  follow_up_at: '2026-10-08T10:00:00+05:30',
  branch_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  patient_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  is_contact_thread: true,
  kind: 'enquiry',
  retarget_reason: 'Sample retarget reason',
  notes: 'Sample notes',
  last_touch_at: '2026-10-08T10:00:00+05:30',
  phones: ['sample'],
  instagram_handles: ['sample'],
  default_channel: 'whatsapp',
  preferences: {},
  household: 'Sample household',
  held_until: '2026-10-08T10:00:00+05:30',
  is_unread: false,
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `MessageTemplateOutput`. */
export const messageTemplatesRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'mtpl_k7x9m2pqr4w8n1v3a1b2c',
    },
    name: {
      type: 'string',
    },
    body: {
      type: 'string',
    },
    channel: {
      type: 'string',
      enum: ['whatsapp', 'call', 'sms', 'instagram', 'email', 'note'],
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

/** Example `MessageTemplateOutput`. */
export const messageTemplatesRecordExample = {
  id: 'mtpl_k7x9m2pqr4w8n1v3a1b2c',
  name: 'Sample name',
  body: 'Sample body',
  channel: 'whatsapp',
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `AppointmentOutput`. */
export const appointmentsRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'appt_k7x9m2pqr4w8n1v3a1b2c',
    },
    appointment_number: {
      type: 'integer',
    },
    patient_id: {
      type: 'string',
      nullable: true,
    },
    lead_id: {
      type: 'string',
      nullable: true,
    },
    branch_id: {
      type: 'string',
    },
    type: {
      type: 'string',
      enum: ['consultation', 'follow_up', 'treatment', 'package_session', 'other'],
    },
    offering_id: {
      type: 'string',
      nullable: true,
    },
    service_label: {
      type: 'string',
    },
    doctor_membership_id: {
      type: 'string',
    },
    therapist_membership_id: {
      type: 'string',
      nullable: true,
    },
    branch_room_id: {
      type: 'string',
      nullable: true,
    },
    branch_machine_id: {
      type: 'string',
      nullable: true,
    },
    appointment_date: {
      type: 'string',
      format: 'date',
    },
    start_time: {
      type: 'string',
      example: '10:00',
    },
    duration_minutes: {
      type: 'integer',
    },
    status: {
      type: 'string',
      enum: ['scheduled', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show'],
    },
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
    cancel_note: {
      type: 'string',
      nullable: true,
    },
    rescheduled_from: {
      type: 'string',
      format: 'date-time',
      nullable: true,
    },
    reason: {
      type: 'string',
      nullable: true,
    },
    notes: {
      type: 'string',
      nullable: true,
    },
    follow_up_at: {
      type: 'string',
      format: 'date-time',
      nullable: true,
    },
    checked_in_at: {
      type: 'string',
      format: 'date-time',
      nullable: true,
    },
    completed_at: {
      type: 'string',
      format: 'date-time',
      nullable: true,
    },
    copied_from_appointment_id: {
      type: 'string',
      nullable: true,
    },
    reminder_status: {
      type: 'string',
      enum: ['not_sent', 'confirm_requested', 'reminder_queued', 'reminder_sent', 'failed'],
    },
    is_confirmed_by_reply: {
      type: 'boolean',
    },
    move_count: {
      type: 'integer',
    },
    is_walk_in: {
      type: 'boolean',
    },
    patient_package_id: {
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

/** Example `AppointmentOutput`. */
export const appointmentsRecordExample = {
  id: 'appt_k7x9m2pqr4w8n1v3a1b2c',
  appointment_number: 12,
  patient_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  lead_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  branch_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  type: 'consultation',
  offering_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  service_label: 'Sample service label',
  doctor_membership_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  therapist_membership_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  branch_room_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  branch_machine_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  appointment_date: '2026-10-08',
  start_time: '10:00',
  duration_minutes: 5,
  status: 'scheduled',
  cancel_reason: 'patient_asked',
  cancel_note: 'Sample cancel note',
  rescheduled_from: '2026-10-08T10:00:00+05:30',
  reason: 'Sample reason',
  notes: 'Sample notes',
  follow_up_at: '2026-10-08T10:00:00+05:30',
  checked_in_at: '2026-10-08T10:00:00+05:30',
  completed_at: '2026-10-08T10:00:00+05:30',
  copied_from_appointment_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  reminder_status: 'not_sent',
  is_confirmed_by_reply: true,
  move_count: 1,
  is_walk_in: true,
  patient_package_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `VisitOutput`. */
export const visitsRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'vis_k7x9m2pqr4w8n1v3a1b2c',
    },
    appointment_id: {
      type: 'string',
    },
    patient_id: {
      type: 'string',
    },
    stage: {
      type: 'string',
      enum: ['waiting', 'with_doctor', 'treatment', 'checkout', 'pharmacy', 'done'],
    },
    stage_changed_at: {
      type: 'string',
      format: 'date-time',
    },
    started_at: {
      type: 'string',
      format: 'date-time',
    },
    paused_at: {
      type: 'string',
      format: 'date-time',
      nullable: true,
    },
    completed_at: {
      type: 'string',
      format: 'date-time',
      nullable: true,
    },
    last_saved_at: {
      type: 'string',
      format: 'date-time',
      nullable: true,
    },
    consult_complaint: {
      type: 'string',
      nullable: true,
    },
    consult_findings: {
      type: 'string',
      nullable: true,
    },
    consult_plan: {
      type: 'string',
      nullable: true,
    },
    diagnoses: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
    is_safety_consent_checked: {
      type: 'boolean',
    },
    is_safety_before_photos_taken: {
      type: 'boolean',
    },
    is_safety_allergies_checked: {
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

/** Example `VisitOutput`. */
export const visitsRecordExample = {
  id: 'vis_k7x9m2pqr4w8n1v3a1b2c',
  appointment_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  patient_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  stage: 'waiting',
  stage_changed_at: '2026-10-08T10:00:00+05:30',
  started_at: '2026-10-08T10:00:00+05:30',
  paused_at: '2026-10-08T10:00:00+05:30',
  completed_at: '2026-10-08T10:00:00+05:30',
  last_saved_at: '2026-10-08T10:00:00+05:30',
  consult_complaint: 'Sample consult complaint',
  consult_findings: 'Sample consult findings',
  consult_plan: 'Sample consult plan',
  diagnoses: ['sample'],
  is_safety_consent_checked: true,
  is_safety_before_photos_taken: true,
  is_safety_allergies_checked: true,
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `DiagnosisOutput`. */
export const diagnosesRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'dgn_k7x9m2pqr4w8n1v3a1b2c',
    },
    name: {
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

/** Example `DiagnosisOutput`. */
export const diagnosesRecordExample = {
  id: 'dgn_k7x9m2pqr4w8n1v3a1b2c',
  name: 'Sample name',
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `PatientClinicalNoteOutput`. */
export const patientClinicalNotesRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'pcn_k7x9m2pqr4w8n1v3a1b2c',
    },
    patient_id: {
      type: 'string',
    },
    kind: {
      type: 'string',
      enum: ['complaint', 'diagnosis', 'treatment_suggestion', 'future_suggestion'],
    },
    text: {
      type: 'string',
    },
    added_at: {
      type: 'string',
      format: 'date-time',
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

/** Example `PatientClinicalNoteOutput`. */
export const patientClinicalNotesRecordExample = {
  id: 'pcn_k7x9m2pqr4w8n1v3a1b2c',
  patient_id: 'pat_k7x9m2pqr4w8n1v3a1b2c',
  kind: 'complaint',
  text: 'Sample text',
  added_at: '2026-10-08T10:00:00+05:30',
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `PrescriptionOutput`. */
export const prescriptionsRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'rx_k7x9m2pqr4w8n1v3a1b2c',
    },
    patient_id: {
      type: 'string',
    },
    prescription_number: {
      type: 'integer',
    },
    appointment_id: {
      type: 'string',
      nullable: true,
    },
    doctor_membership_id: {
      type: 'string',
    },
    prescription_date: {
      type: 'string',
      format: 'date',
    },
    items: {},
    advice: {
      type: 'string',
      nullable: true,
    },
    lab_report: {
      type: 'string',
      nullable: true,
    },
    procedure_today: {
      type: 'string',
      nullable: true,
    },
    follow_up_date: {
      type: 'string',
      format: 'date',
      nullable: true,
    },
    status: {
      type: 'string',
      enum: ['draft', 'approved'],
    },
    approved_at: {
      type: 'string',
      format: 'date-time',
      nullable: true,
    },
    print_language: {
      type: 'string',
      enum: ['english', 'gujarati', 'hindi'],
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

/** Example `PrescriptionOutput`. */
export const prescriptionsRecordExample = {
  id: 'rx_k7x9m2pqr4w8n1v3a1b2c',
  patient_id: 'pat_k7x9m2pqr4w8n1v3a1b2c',
  prescription_number: 12,
  appointment_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  doctor_membership_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  prescription_date: '2026-10-08',
  items: [],
  advice: 'Sample advice',
  lab_report: 'Sample lab report',
  procedure_today: 'Sample procedure today',
  follow_up_date: '2026-10-08',
  status: 'draft',
  approved_at: '2026-10-08T10:00:00+05:30',
  print_language: 'english',
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `PrescriptionKitOutput`. */
export const prescriptionKitsRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'rxk_k7x9m2pqr4w8n1v3a1b2c',
    },
    name: {
      type: 'string',
    },
    items: {},
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

/** Example `PrescriptionKitOutput`. */
export const prescriptionKitsRecordExample = {
  id: 'rxk_k7x9m2pqr4w8n1v3a1b2c',
  name: 'Sample name',
  items: [],
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `PatientImageOutput`. */
export const patientImagesRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'pimg_k7x9m2pqr4w8n1v3a1b2c',
    },
    patient_id: {
      type: 'string',
    },
    appointment_id: {
      type: 'string',
      nullable: true,
    },
    album: {
      type: 'string',
      enum: ['general', 'private', 'lhr'],
    },
    file_key: {
      type: 'string',
    },
    file_name: {
      type: 'string',
    },
    body_part: {
      type: 'string',
      enum: ['face', 'scalp', 'hair', 'body', 'chest', 'back', 'underarm', 'legs', 'arms', 'other'],
      nullable: true,
    },
    taken_on: {
      type: 'string',
      format: 'date',
    },
    caption: {
      type: 'string',
      nullable: true,
    },
    display_name: {
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

/** Example `PatientImageOutput`. */
export const patientImagesRecordExample = {
  id: 'pimg_k7x9m2pqr4w8n1v3a1b2c',
  patient_id: 'pat_k7x9m2pqr4w8n1v3a1b2c',
  appointment_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  album: 'general',
  file_key: 'Sample file key',
  file_name: 'Sample file name',
  body_part: 'face',
  taken_on: '2026-10-08',
  caption: 'Sample caption',
  display_name: 'Sample display name',
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `PatientReportOutput`. */
export const patientReportsRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'prep_k7x9m2pqr4w8n1v3a1b2c',
    },
    patient_id: {
      type: 'string',
    },
    type: {
      type: 'string',
      enum: ['lab', 'scan', 'consent', 'other'],
    },
    name: {
      type: 'string',
    },
    report_date: {
      type: 'string',
      format: 'date',
    },
    file_keys: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
    notes: {
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

/** Example `PatientReportOutput`. */
export const patientReportsRecordExample = {
  id: 'prep_k7x9m2pqr4w8n1v3a1b2c',
  patient_id: 'pat_k7x9m2pqr4w8n1v3a1b2c',
  type: 'lab',
  name: 'Sample name',
  report_date: '2026-10-08',
  file_keys: ['sample'],
  notes: 'Sample notes',
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `PatientNoteOutput`. */
export const patientNotesRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'pnote_k7x9m2pqr4w8n1v3a1b2c',
    },
    patient_id: {
      type: 'string',
    },
    body: {
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

/** Example `PatientNoteOutput`. */
export const patientNotesRecordExample = {
  id: 'pnote_k7x9m2pqr4w8n1v3a1b2c',
  patient_id: 'pat_k7x9m2pqr4w8n1v3a1b2c',
  body: 'Sample body',
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `InvoiceOutput`. */
export const invoicesRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'invc_k7x9m2pqr4w8n1v3a1b2c',
    },
    invoice_sequence: {
      type: 'integer',
    },
    invoice_number: {
      type: 'string',
    },
    financial_year: {
      type: 'string',
    },
    type: {
      type: 'string',
      enum: ['clinic', 'medical', 'consultation'],
    },
    branch_id: {
      type: 'string',
    },
    patient_id: {
      type: 'string',
      nullable: true,
    },
    team_membership_ids: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
    items: {},
    overall_discount: {
      type: 'number',
    },
    invoice_date: {
      type: 'string',
      format: 'date',
    },
    remark: {
      type: 'string',
      nullable: true,
    },
    prescription_id: {
      type: 'string',
      nullable: true,
    },
    medical_contact_id: {
      type: 'string',
      nullable: true,
    },
    medical_sale_id: {
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

/** Example `InvoiceOutput`. */
export const invoicesRecordExample = {
  id: 'invc_k7x9m2pqr4w8n1v3a1b2c',
  invoice_sequence: 12,
  invoice_number: 'Sample invoice number',
  financial_year: 'Sample fi',
  type: 'clinic',
  branch_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  patient_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  team_membership_ids: ['ref_k7x9m2pqr4w8n1v3a1b2c'],
  items: [],
  overall_discount: 100,
  invoice_date: '2026-10-08',
  remark: 'Sample remark',
  prescription_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  medical_contact_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  medical_sale_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `PatientPackageOutput`. */
export const patientPackagesRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'ppkg_k7x9m2pqr4w8n1v3a1b2c',
    },
    patient_id: {
      type: 'string',
    },
    offering_id: {
      type: 'string',
    },
    invoice_id: {
      type: 'string',
      nullable: true,
    },
    sessions_total: {
      type: 'integer',
    },
    sessions_used: {
      type: 'integer',
    },
    valid_until: {
      type: 'string',
      format: 'date',
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

/** Example `PatientPackageOutput`. */
export const patientPackagesRecordExample = {
  id: 'ppkg_k7x9m2pqr4w8n1v3a1b2c',
  patient_id: 'pat_k7x9m2pqr4w8n1v3a1b2c',
  offering_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  invoice_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  sessions_total: 1,
  sessions_used: 1,
  valid_until: '2026-10-08',
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `OfferingSuggestionOutput`. */
export const offeringSuggestionsRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'osug_k7x9m2pqr4w8n1v3a1b2c',
    },
    patient_id: {
      type: 'string',
    },
    offering_id: {
      type: 'string',
    },
    quantity: {
      type: 'integer',
    },
    price: {
      type: 'number',
      nullable: true,
    },
    status: {
      type: 'string',
      enum: ['planned', 'accepted', 'next_time', 'declined'],
    },
    source_label: {
      type: 'string',
    },
    appointment_id: {
      type: 'string',
      nullable: true,
    },
    reason: {
      type: 'string',
      nullable: true,
    },
    invoice_links: {},
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

/** Example `OfferingSuggestionOutput`. */
export const offeringSuggestionsRecordExample = {
  id: 'osug_k7x9m2pqr4w8n1v3a1b2c',
  patient_id: 'pat_k7x9m2pqr4w8n1v3a1b2c',
  offering_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  quantity: 1,
  price: 100,
  status: 'planned',
  source_label: 'Sample source label',
  appointment_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  reason: 'Sample reason',
  invoice_links: [],
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `PaymentOutput`. */
export const paymentsRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'pay_k7x9m2pqr4w8n1v3a1b2c',
    },
    payment_number: {
      type: 'integer',
    },
    direction: {
      type: 'string',
      enum: ['received', 'paid'],
    },
    kind: {
      type: 'string',
      enum: ['receipt', 'refund', 'expense', 'supplier_bill', 'money_back', 'reversal'],
    },
    branch_id: {
      type: 'string',
    },
    amount: {
      type: 'number',
    },
    splits: {},
    patient_id: {
      type: 'string',
      nullable: true,
    },
    invoice_id: {
      type: 'string',
      nullable: true,
    },
    payee_name: {
      type: 'string',
      nullable: true,
    },
    expense_category: {
      type: 'string',
      enum: [
        'medicines',
        'consumables',
        'salary',
        'rent',
        'marketing',
        'utilities',
        'maintenance',
        'misc',
      ],
      nullable: true,
    },
    bill_ref: {},
    credit_note_id: {
      type: 'string',
      nullable: true,
    },
    pending_credit_id: {
      type: 'string',
      nullable: true,
    },
    note: {
      type: 'string',
      nullable: true,
    },
    paid_at: {
      type: 'string',
      format: 'date-time',
    },
    day_close_id: {
      type: 'string',
      nullable: true,
    },
    bill_allocations: {},
    reference: {
      type: 'string',
      nullable: true,
    },
    attachment_keys: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
    is_checked_at_close: {
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

/** Example `PaymentOutput`. */
export const paymentsRecordExample = {
  id: 'pay_k7x9m2pqr4w8n1v3a1b2c',
  payment_number: 12,
  direction: 'received',
  kind: 'receipt',
  branch_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  amount: 100,
  splits: [],
  patient_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  invoice_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  payee_name: 'Sample payee name',
  expense_category: 'medicines',
  bill_ref: {},
  credit_note_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  pending_credit_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  note: 'Sample note',
  paid_at: '2026-10-08T10:00:00+05:30',
  day_close_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  bill_allocations: [],
  reference: 'Sample reference',
  attachment_keys: ['sample'],
  is_checked_at_close: true,
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `CreditNoteOutput`. */
export const creditNotesRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'cn_k7x9m2pqr4w8n1v3a1b2c',
    },
    credit_note_number: {
      type: 'integer',
    },
    invoice_id: {
      type: 'string',
    },
    amount: {
      type: 'number',
    },
    reason: {
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

/** Example `CreditNoteOutput`. */
export const creditNotesRecordExample = {
  id: 'cn_k7x9m2pqr4w8n1v3a1b2c',
  credit_note_number: 12,
  invoice_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  amount: 100,
  reason: 'Sample reason',
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `PendingCreditOutput`. */
export const pendingCreditsRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'pcr_k7x9m2pqr4w8n1v3a1b2c',
    },
    pending_credit_number: {
      type: 'integer',
    },
    direction: {
      type: 'string',
      enum: ['give', 'take'],
    },
    party_kind: {
      type: 'string',
      enum: ['patient', 'supplier', 'staff', 'other'],
    },
    party_name: {
      type: 'string',
    },
    patient_id: {
      type: 'string',
      nullable: true,
    },
    amount: {
      type: 'number',
    },
    reason: {
      type: 'string',
    },
    source_payment_id: {
      type: 'string',
      nullable: true,
    },
    status: {
      type: 'string',
      enum: ['open', 'given_back', 'got_back', 'used'],
    },
    settled_payment_id: {
      type: 'string',
      nullable: true,
    },
    invoice_id: {
      type: 'string',
      nullable: true,
    },
    settle_by: {
      type: 'string',
      format: 'date',
      nullable: true,
    },
    settled_amount: {
      type: 'number',
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

/** Example `PendingCreditOutput`. */
export const pendingCreditsRecordExample = {
  id: 'pcr_k7x9m2pqr4w8n1v3a1b2c',
  pending_credit_number: 12,
  direction: 'give',
  party_kind: 'patient',
  party_name: 'Sample party name',
  patient_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  amount: 100,
  reason: 'Sample reason',
  source_payment_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  status: 'open',
  settled_payment_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  invoice_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  settle_by: '2026-10-08',
  settled_amount: 100,
  note: 'Sample note',
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `DayCloseOutput`. */
export const dayClosesRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'dcl_k7x9m2pqr4w8n1v3a1b2c',
    },
    branch_id: {
      type: 'string',
    },
    close_date: {
      type: 'string',
      format: 'date',
    },
    status: {
      type: 'string',
      enum: ['open', 'closed'],
    },
    opening_cash: {
      type: 'number',
    },
    opening_source: {
      type: 'string',
      enum: ['carried', 'default_float'],
    },
    opening_accepted_at: {
      type: 'string',
      format: 'date-time',
    },
    counted_cash: {
      type: 'number',
      nullable: true,
    },
    closed_at: {
      type: 'string',
      format: 'date-time',
      nullable: true,
    },
    difference_reason: {
      type: 'string',
      nullable: true,
    },
    reopened_at: {
      type: 'string',
      format: 'date-time',
      nullable: true,
    },
    is_auto_closed: {
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

/** Example `DayCloseOutput`. */
export const dayClosesRecordExample = {
  id: 'dcl_k7x9m2pqr4w8n1v3a1b2c',
  branch_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  close_date: '2026-10-08',
  status: 'open',
  opening_cash: 100,
  opening_source: 'carried',
  opening_accepted_at: '2026-10-08T10:00:00+05:30',
  counted_cash: 100,
  closed_at: '2026-10-08T10:00:00+05:30',
  difference_reason: 'Sample difference reason',
  reopened_at: '2026-10-08T10:00:00+05:30',
  is_auto_closed: true,
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `TreatmentOutput`. */
export const treatmentsRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'trt_k7x9m2pqr4w8n1v3a1b2c',
    },
    patient_id: {
      type: 'string',
    },
    appointment_id: {
      type: 'string',
      nullable: true,
    },
    offering_id: {
      type: 'string',
      nullable: true,
    },
    name: {
      type: 'string',
    },
    template: {
      type: 'string',
      enum: ['skin', 'dental', 'physio', 'gynac', 'general'],
    },
    performed_at: {
      type: 'string',
      format: 'date-time',
    },
    doctor_membership_id: {
      type: 'string',
      nullable: true,
    },
    therapist_membership_id: {
      type: 'string',
      nullable: true,
    },
    body_parts: {
      type: 'array',
      items: {
        type: 'string',
        enum: [
          'face',
          'scalp',
          'hair',
          'body',
          'chest',
          'back',
          'underarm',
          'legs',
          'arms',
          'other',
        ],
      },
    },
    session_number: {
      type: 'integer',
    },
    parameters: {},
    remark: {
      type: 'string',
      nullable: true,
    },
    aftercare_call: {
      type: 'string',
      enum: ['none', 'next_day', 'in_two_days', 'in_week'],
    },
    patient_package_id: {
      type: 'string',
      nullable: true,
    },
    status: {
      type: 'string',
      enum: ['done', 'reversed'],
    },
    reversed_reason: {
      type: 'string',
      nullable: true,
    },
    reversed_at: {
      type: 'string',
      format: 'date-time',
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

/** Example `TreatmentOutput`. */
export const treatmentsRecordExample = {
  id: 'trt_k7x9m2pqr4w8n1v3a1b2c',
  patient_id: 'pat_k7x9m2pqr4w8n1v3a1b2c',
  appointment_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  offering_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  name: 'Sample name',
  template: 'skin',
  performed_at: '2026-10-08T10:00:00+05:30',
  doctor_membership_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  therapist_membership_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  body_parts: ['face'],
  session_number: 1,
  parameters: {},
  remark: 'Sample remark',
  aftercare_call: 'next_day',
  patient_package_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  status: 'done',
  reversed_reason: 'Sample reversed reason',
  reversed_at: '2026-10-08T10:00:00+05:30',
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `CheckInOutput`. */
export const checkInsRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'chk_k7x9m2pqr4w8n1v3a1b2c',
    },
    patient_id: {
      type: 'string',
    },
    appointment_id: {
      type: 'string',
      nullable: true,
    },
    treatment_id: {
      type: 'string',
      nullable: true,
    },
    context: {
      type: 'string',
    },
    feel: {
      type: 'string',
      enum: ['much_better', 'better', 'same', 'worse'],
    },
    score: {
      type: 'integer',
    },
    followed: {
      type: 'string',
      enum: ['fully', 'mostly', 'partly', 'not_at_all'],
      nullable: true,
    },
    followed_note: {
      type: 'string',
      nullable: true,
    },
    current_state: {
      type: 'string',
      nullable: true,
    },
    next_plan: {
      type: 'string',
      nullable: true,
    },
    next_offering_ids: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
    check_in_date: {
      type: 'string',
      format: 'date',
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

/** Example `CheckInOutput`. */
export const checkInsRecordExample = {
  id: 'chk_k7x9m2pqr4w8n1v3a1b2c',
  patient_id: 'pat_k7x9m2pqr4w8n1v3a1b2c',
  appointment_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  treatment_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  context: 'Sample context',
  feel: 'much_better',
  score: 1,
  followed: 'fully',
  followed_note: 'Sample followed note',
  current_state: 'Sample current state',
  next_plan: 'Sample next plan',
  next_offering_ids: ['ref_k7x9m2pqr4w8n1v3a1b2c'],
  check_in_date: '2026-10-08',
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `ReviewOutput`. */
export const reviewsRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'rev_k7x9m2pqr4w8n1v3a1b2c',
    },
    patient_id: {
      type: 'string',
    },
    appointment_id: {
      type: 'string',
      nullable: true,
    },
    source: {
      type: 'string',
      enum: ['google', 'video', 'instagram', 'internal_form', 'whatsapp'],
    },
    rating: {
      type: 'integer',
      nullable: true,
    },
    text: {
      type: 'string',
      nullable: true,
    },
    link: {
      type: 'string',
      nullable: true,
    },
    file_keys: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
    review_date: {
      type: 'string',
      format: 'date',
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

/** Example `ReviewOutput`. */
export const reviewsRecordExample = {
  id: 'rev_k7x9m2pqr4w8n1v3a1b2c',
  patient_id: 'pat_k7x9m2pqr4w8n1v3a1b2c',
  appointment_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  source: 'google',
  rating: 1,
  text: 'Sample text',
  link: 'Sample link',
  file_keys: ['sample'],
  review_date: '2026-10-08',
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `FeedbackActionOutput`. */
export const feedbackActionsRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'fba_k7x9m2pqr4w8n1v3a1b2c',
    },
    check_in_id: {
      type: 'string',
      nullable: true,
    },
    review_id: {
      type: 'string',
      nullable: true,
    },
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

/** Example `FeedbackActionOutput`. */
export const feedbackActionsRecordExample = {
  id: 'fba_k7x9m2pqr4w8n1v3a1b2c',
  check_in_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  review_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  action: 'doctor_called',
  note: 'Sample note',
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `ManufacturerOutput`. */
export const manufacturersRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'mfr_k7x9m2pqr4w8n1v3a1b2c',
    },
    name: {
      type: 'string',
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
    is_quick: {
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

/** Example `ManufacturerOutput`. */
export const manufacturersRecordExample = {
  id: 'mfr_k7x9m2pqr4w8n1v3a1b2c',
  name: 'Sample name',
  tone: 'sky',
  is_quick: true,
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `SupplierOutput`. */
export const suppliersRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'sup_k7x9m2pqr4w8n1v3a1b2c',
    },
    name: {
      type: 'string',
    },
    phone: {
      type: 'string',
      example: '+919825044120',
      nullable: true,
    },
    gst_number: {
      type: 'string',
      nullable: true,
    },
    manufacturer_ids: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
    is_quick: {
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

/** Example `SupplierOutput`. */
export const suppliersRecordExample = {
  id: 'sup_k7x9m2pqr4w8n1v3a1b2c',
  name: 'Sample name',
  phone: '+919800000001',
  gst_number: 'Sample gst numb',
  manufacturer_ids: ['ref_k7x9m2pqr4w8n1v3a1b2c'],
  is_quick: true,
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `MedicalRepOutput`. */
export const medicalRepsRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'mrep_k7x9m2pqr4w8n1v3a1b2c',
    },
    name: {
      type: 'string',
    },
    phone: {
      type: 'string',
      example: '+919825044120',
      nullable: true,
    },
    manufacturer_ids: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
    next_visit_on: {
      type: 'string',
      format: 'date',
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

/** Example `MedicalRepOutput`. */
export const medicalRepsRecordExample = {
  id: 'mrep_k7x9m2pqr4w8n1v3a1b2c',
  name: 'Sample name',
  phone: '+919800000001',
  manufacturer_ids: ['ref_k7x9m2pqr4w8n1v3a1b2c'],
  next_visit_on: '2026-10-08',
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `MedicalRepVisitOutput`. */
export const medicalRepVisitsRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'mrv_k7x9m2pqr4w8n1v3a1b2c',
    },
    medical_rep_id: {
      type: 'string',
    },
    visit_date: {
      type: 'string',
      format: 'date',
    },
    samples: {
      type: 'string',
      nullable: true,
    },
    notes: {
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

/** Example `MedicalRepVisitOutput`. */
export const medicalRepVisitsRecordExample = {
  id: 'mrv_k7x9m2pqr4w8n1v3a1b2c',
  medical_rep_id: 'med_k7x9m2pqr4w8n1v3a1b2c',
  visit_date: '2026-10-08',
  samples: 'Sample samples',
  notes: 'Sample notes',
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `MedicineOutput`. */
export const medicinesRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'med_k7x9m2pqr4w8n1v3a1b2c',
    },
    medicine_number: {
      type: 'integer',
    },
    name: {
      type: 'string',
    },
    composition: {
      type: 'string',
      nullable: true,
    },
    manufacturer_id: {
      type: 'string',
    },
    mrp: {
      type: 'number',
    },
    gst_percent: {
      type: 'integer',
    },
    min_stock: {
      type: 'integer',
    },
    max_stock: {
      type: 'integer',
    },
    batches: {},
    supplier_rates: {},
    is_quick: {
      type: 'boolean',
    },
    is_prescription_only: {
      type: 'boolean',
    },
    near_expiry_discount_percent: {
      type: 'number',
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

/** Example `MedicineOutput`. */
export const medicinesRecordExample = {
  id: 'med_k7x9m2pqr4w8n1v3a1b2c',
  medicine_number: 12,
  name: 'Sample name',
  composition: 'Sample composition',
  manufacturer_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  mrp: 100,
  gst_percent: 1,
  min_stock: 1,
  max_stock: 1,
  batches: [],
  supplier_rates: [],
  is_quick: true,
  is_prescription_only: true,
  near_expiry_discount_percent: 10,
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `MedicalPurchaseOrderOutput`. */
export const medicalPurchaseOrdersRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'mpo_k7x9m2pqr4w8n1v3a1b2c',
    },
    purchase_order_number: {
      type: 'integer',
    },
    supplier_id: {
      type: 'string',
    },
    supplier_bill_number: {
      type: 'string',
      nullable: true,
    },
    order_date: {
      type: 'string',
      format: 'date',
    },
    stage: {
      type: 'string',
      enum: ['ordered', 'received', 'paid', 'cancelled'],
    },
    items: {},
    paid_amount: {
      type: 'number',
    },
    cancel_reason: {
      type: 'string',
      enum: ['mistake', 'duplicate', 'not_needed', 'other'],
      nullable: true,
    },
    received_at: {
      type: 'string',
      format: 'date-time',
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

/** Example `MedicalPurchaseOrderOutput`. */
export const medicalPurchaseOrdersRecordExample = {
  id: 'mpo_k7x9m2pqr4w8n1v3a1b2c',
  purchase_order_number: 12,
  supplier_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  supplier_bill_number: 'Sample supplier bill number',
  order_date: '2026-10-08',
  stage: 'ordered',
  items: [],
  paid_amount: 100,
  cancel_reason: 'mistake',
  received_at: '2026-10-08T10:00:00+05:30',
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `MedicalContactOutput`. */
export const medicalContactsRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'mcon_k7x9m2pqr4w8n1v3a1b2c',
    },
    name: {
      type: 'string',
    },
    phone: {
      type: 'string',
      example: '+919825044120',
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

/** Example `MedicalContactOutput`. */
export const medicalContactsRecordExample = {
  id: 'mcon_k7x9m2pqr4w8n1v3a1b2c',
  name: 'Sample name',
  phone: '+919800000001',
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `MedicalSaleOutput`. */
export const medicalSalesRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'msal_k7x9m2pqr4w8n1v3a1b2c',
    },
    sale_number: {
      type: 'integer',
    },
    invoice_id: {
      type: 'string',
      nullable: true,
    },
    patient_id: {
      type: 'string',
      nullable: true,
    },
    medical_contact_id: {
      type: 'string',
      nullable: true,
    },
    prescription_id: {
      type: 'string',
      nullable: true,
    },
    lead_id: {
      type: 'string',
      nullable: true,
    },
    status: {
      type: 'string',
      enum: ['sold', 'voided'],
    },
    sold_at: {
      type: 'string',
      format: 'date-time',
    },
    voided_at: {
      type: 'string',
      format: 'date-time',
      nullable: true,
    },
    returns: {},
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

/** Example `MedicalSaleOutput`. */
export const medicalSalesRecordExample = {
  id: 'msal_k7x9m2pqr4w8n1v3a1b2c',
  sale_number: 12,
  invoice_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  patient_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  medical_contact_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  prescription_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  lead_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  status: 'sold',
  sold_at: '2026-10-08T10:00:00+05:30',
  voided_at: '2026-10-08T10:00:00+05:30',
  returns: [],
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `SupplierCreditOutput`. */
export const supplierCreditsRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'scr_k7x9m2pqr4w8n1v3a1b2c',
    },
    supplier_id: {
      type: 'string',
    },
    medicine_id: {
      type: 'string',
      nullable: true,
    },
    batch_number: {
      type: 'string',
      nullable: true,
    },
    quantity: {
      type: 'integer',
    },
    amount: {
      type: 'number',
    },
    adjusted_at: {
      type: 'string',
      format: 'date-time',
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

/** Example `SupplierCreditOutput`. */
export const supplierCreditsRecordExample = {
  id: 'scr_k7x9m2pqr4w8n1v3a1b2c',
  supplier_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  medicine_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  batch_number: 'Sample batch number',
  quantity: 1,
  amount: 100,
  adjusted_at: '2026-10-08T10:00:00+05:30',
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `StockVendorOutput`. */
export const stockVendorsRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'svnd_k7x9m2pqr4w8n1v3a1b2c',
    },
    name: {
      type: 'string',
    },
    phone: {
      type: 'string',
      example: '+919825044120',
      nullable: true,
    },
    is_quick: {
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

/** Example `StockVendorOutput`. */
export const stockVendorsRecordExample = {
  id: 'svnd_k7x9m2pqr4w8n1v3a1b2c',
  name: 'Sample name',
  phone: '+919800000001',
  is_quick: true,
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `StockItemOutput`. */
export const stockItemsRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'sitm_k7x9m2pqr4w8n1v3a1b2c',
    },
    stock_item_number: {
      type: 'integer',
    },
    name: {
      type: 'string',
    },
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
    size_per_unit_milli: {
      type: 'integer',
      nullable: true,
    },
    measure_unit: {
      type: 'string',
      enum: ['ml', 'g', 'pcs', 'units'],
      nullable: true,
    },
    quantity_milli: {
      type: 'integer',
    },
    min_quantity: {
      type: 'integer',
    },
    max_quantity: {
      type: 'integer',
    },
    usage_per_week_milli: {
      type: 'integer',
    },
    stock_vendor_id: {
      type: 'string',
      nullable: true,
    },
    last_rate: {
      type: 'number',
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

/** Example `StockItemOutput`. */
export const stockItemsRecordExample = {
  id: 'sitm_k7x9m2pqr4w8n1v3a1b2c',
  stock_item_number: 12,
  name: 'Sample name',
  category: 'creams_serums',
  unit: 'piece',
  size_per_unit_milli: 1,
  measure_unit: 'ml',
  quantity_milli: 1,
  min_quantity: 1,
  max_quantity: 1,
  usage_per_week_milli: 1,
  stock_vendor_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  last_rate: 100,
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `StockPurchaseOutput`. */
export const stockPurchasesRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'spur_k7x9m2pqr4w8n1v3a1b2c',
    },
    stock_purchase_number: {
      type: 'integer',
    },
    stock_vendor_id: {
      type: 'string',
    },
    bill_number: {
      type: 'string',
      nullable: true,
    },
    purchase_date: {
      type: 'string',
      format: 'date',
    },
    lines: {},
    bill_amount: {
      type: 'number',
    },
    paid_amount: {
      type: 'number',
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

/** Example `StockPurchaseOutput`. */
export const stockPurchasesRecordExample = {
  id: 'spur_k7x9m2pqr4w8n1v3a1b2c',
  stock_purchase_number: 12,
  stock_vendor_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  bill_number: 'Sample bill number',
  purchase_date: '2026-10-08',
  lines: [],
  bill_amount: 100,
  paid_amount: 100,
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `StockCountOutput`. */
export const stockCountsRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'scnt_k7x9m2pqr4w8n1v3a1b2c',
    },
    lines: {},
    counted_at: {
      type: 'string',
      format: 'date-time',
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

/** Example `StockCountOutput`. */
export const stockCountsRecordExample = {
  id: 'scnt_k7x9m2pqr4w8n1v3a1b2c',
  lines: [],
  counted_at: '2026-10-08T10:00:00+05:30',
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `StockMovementOutput`. */
export const stockMovementsRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'smov_k7x9m2pqr4w8n1v3a1b2c',
    },
    stock_item_id: {
      type: 'string',
    },
    type: {
      type: 'string',
      enum: ['used', 'received', 'adjust', 'damaged', 'returned', 'reverted'],
    },
    delta_milli: {
      type: 'integer',
    },
    used_for: {
      type: 'string',
      nullable: true,
    },
    patient_id: {
      type: 'string',
      nullable: true,
    },
    stock_purchase_id: {
      type: 'string',
      nullable: true,
    },
    stock_count_id: {
      type: 'string',
      nullable: true,
    },
    reverts_stock_movement_id: {
      type: 'string',
      nullable: true,
    },
    reverted_by_stock_movement_id: {
      type: 'string',
      nullable: true,
    },
    revert_reason: {
      type: 'string',
      enum: ['mistake', 'wrong_item', 'wrong_quantity', 'other'],
      nullable: true,
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

/** Example `StockMovementOutput`. */
export const stockMovementsRecordExample = {
  id: 'smov_k7x9m2pqr4w8n1v3a1b2c',
  stock_item_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  type: 'used',
  delta_milli: 1,
  used_for: 'Sample used for',
  patient_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  stock_purchase_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  stock_count_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  reverts_stock_movement_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  reverted_by_stock_movement_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  revert_reason: 'mistake',
  note: 'Sample note',
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `TaskOutput`. */
export const tasksRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'task_k7x9m2pqr4w8n1v3a1b2c',
    },
    kind: {
      type: 'string',
      enum: [
        'manual',
        'follow_up',
        'aftercare_call',
        'callback',
        'payment_reminder',
        'confirm_visit',
        'review_request',
      ],
    },
    rule_key: {
      type: 'string',
      enum: [
        'reply',
        'failed_message',
        'follow_up',
        'call_back',
        'claim',
        'confirm',
        'arrive',
        'rebook',
        'feedback',
        'aftercare',
        'next_visit',
        'gone_quiet',
        'payment_due',
        'onboarding',
        'unhappy',
        'settle_by',
        'medical_rep_visit',
      ],
      nullable: true,
    },
    title: {
      type: 'string',
    },
    why: {
      type: 'string',
      nullable: true,
    },
    owner_membership_id: {
      type: 'string',
      nullable: true,
    },
    owner_role: {
      type: 'string',
      enum: [
        'admin',
        'doctor',
        'therapist',
        'front_desk',
        'counsellor',
        'pharmacist',
        'accountant',
        'marketing',
        'owner',
      ],
    },
    patient_id: {
      type: 'string',
      nullable: true,
    },
    lead_id: {
      type: 'string',
      nullable: true,
    },
    source_type: {
      type: 'string',
      enum: ['lead', 'appointment', 'treatment', 'check_in', 'review', 'invoice'],
      nullable: true,
    },
    source_id: {
      type: 'string',
      nullable: true,
    },
    due_at: {
      type: 'string',
      format: 'date-time',
    },
    status: {
      type: 'string',
      enum: ['open', 'snoozed', 'done'],
    },
    snoozed_until: {
      type: 'string',
      format: 'date-time',
      nullable: true,
    },
    snooze_label: {
      type: 'string',
      nullable: true,
    },
    outcome: {
      type: 'string',
      enum: ['log_check_in', 'doing_well', 'no_answer', 'happy', 'done'],
      nullable: true,
    },
    resolved_at: {
      type: 'string',
      format: 'date-time',
      nullable: true,
    },
    is_resolved_automatically: {
      type: 'boolean',
    },
    result_text: {
      type: 'string',
      nullable: true,
    },
    note: {
      type: 'string',
      nullable: true,
    },
    priority: {
      type: 'string',
      enum: ['low', 'normal', 'high'],
    },
    should_remind_before: {
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

/** Example `TaskOutput`. */
export const tasksRecordExample = {
  id: 'task_k7x9m2pqr4w8n1v3a1b2c',
  kind: 'manual',
  rule_key: 'reply',
  title: 'Sample title',
  why: 'Sample why',
  owner_membership_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  owner_role: 'admin',
  patient_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  lead_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  source_type: 'lead',
  source_id: 'Sample source id',
  due_at: '2026-10-08T10:00:00+05:30',
  status: 'open',
  snoozed_until: '2026-10-08T10:00:00+05:30',
  snooze_label: 'Sample snooze label',
  outcome: 'log_check_in',
  resolved_at: '2026-10-08T10:00:00+05:30',
  is_resolved_automatically: true,
  result_text: 'Sample result text',
  note: 'Sample note',
  priority: 'normal',
  should_remind_before: true,
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `TaskRuleSettingOutput`. */
export const taskRuleSettingsRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'trs_k7x9m2pqr4w8n1v3a1b2c',
    },
    rule_key: {
      type: 'string',
      enum: [
        'reply',
        'failed_message',
        'follow_up',
        'call_back',
        'claim',
        'confirm',
        'arrive',
        'rebook',
        'feedback',
        'aftercare',
        'next_visit',
        'gone_quiet',
        'payment_due',
        'onboarding',
        'unhappy',
        'settle_by',
        'medical_rep_visit',
      ],
    },
    is_on: {
      type: 'boolean',
    },
    is_automatic: {
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

/** Example `TaskRuleSettingOutput`. */
export const taskRuleSettingsRecordExample = {
  id: 'trs_k7x9m2pqr4w8n1v3a1b2c',
  rule_key: 'reply',
  is_on: true,
  is_automatic: true,
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

/** `MessageOutput`. */
export const messagesRecordSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      example: 'msg_k7x9m2pqr4w8n1v3a1b2c',
    },
    lead_id: {
      type: 'string',
      nullable: true,
    },
    patient_id: {
      type: 'string',
      nullable: true,
    },
    medical_contact_id: {
      type: 'string',
      nullable: true,
    },
    channel: {
      type: 'string',
      enum: ['whatsapp', 'call', 'sms', 'instagram', 'email', 'note'],
    },
    direction: {
      type: 'string',
      enum: ['sent', 'received'],
    },
    kind: {
      type: 'string',
      enum: ['text', 'template', 'media', 'call_log', 'note', 'system'],
    },
    body: {
      type: 'string',
    },
    message_template_id: {
      type: 'string',
      nullable: true,
    },
    attachment_keys: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
    reply_to_message_id: {
      type: 'string',
      nullable: true,
    },
    delivery_status: {
      type: 'string',
      enum: ['queued', 'sent', 'delivered', 'read', 'failed'],
    },
    provider_message_id: {
      type: 'string',
      nullable: true,
    },
    failure_reason: {
      type: 'string',
      nullable: true,
    },
    sent_at: {
      type: 'string',
      format: 'date-time',
    },
    delivered_at: {
      type: 'string',
      format: 'date-time',
      nullable: true,
    },
    read_at: {
      type: 'string',
      format: 'date-time',
      nullable: true,
    },
    failed_at: {
      type: 'string',
      format: 'date-time',
      nullable: true,
    },
    is_system: {
      type: 'boolean',
    },
    author_membership_id: {
      type: 'string',
      nullable: true,
    },
    record_type: {
      type: 'string',
      enum: [
        'appointment',
        'invoice',
        'payment',
        'prescription',
        'patient_package',
        'review',
        'check_in',
        'task',
      ],
      nullable: true,
    },
    record_id: {
      type: 'string',
      nullable: true,
    },
    task_id: {
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

/** Example `MessageOutput`. */
export const messagesRecordExample = {
  id: 'msg_k7x9m2pqr4w8n1v3a1b2c',
  lead_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  patient_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  medical_contact_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  channel: 'whatsapp',
  direction: 'sent',
  kind: 'text',
  body: 'Sample body',
  message_template_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  attachment_keys: ['sample'],
  reply_to_message_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  delivery_status: 'queued',
  provider_message_id: 'Sample provider message id',
  failure_reason: 'Sample failure reason',
  sent_at: '2026-10-08T10:00:00+05:30',
  delivered_at: '2026-10-08T10:00:00+05:30',
  read_at: '2026-10-08T10:00:00+05:30',
  failed_at: '2026-10-08T10:00:00+05:30',
  is_system: true,
  author_membership_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  record_type: 'appointment',
  record_id: 'Sample record id',
  task_id: 'ref_k7x9m2pqr4w8n1v3a1b2c',
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

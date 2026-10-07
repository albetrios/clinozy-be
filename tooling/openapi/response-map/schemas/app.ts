/** OpenAPI response schemas — app domain (the app's own records). */

const nullableString = { type: ['string', 'null'] };
const hourMinute = { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' };
const workingDays = {
  type: 'array',
  items: { type: 'string', enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] },
};

// ── Branch ──
export const branchSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    tone: { type: 'string' },
    is_main: { type: 'boolean' },
    address_line_one: { type: 'string' },
    address_line_two: nullableString,
    area: { type: 'string' },
    city: { type: 'string' },
    state: { type: 'string' },
    postal_code: { type: 'string' },
    phone: { type: 'string' },
    email: { type: 'string', format: 'email' },
    gst_number: nullableString,
    opens_at: hourMinute,
    closes_at: hourMinute,
    working_days: workingDays,
    default_doctor_membership_id: nullableString,
    default_front_desk_membership_id: nullableString,
    default_therapist_membership_id: nullableString,
    default_pharmacist_membership_id: nullableString,
    is_active: { type: 'boolean' },
    maps_link: nullableString,
    review_link: nullableString,
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

export const branchExample = {
  id: 'brn_q4w8e2r6t1y5u9i3o7p0a',
  name: 'Adajan',
  tone: 'sage',
  is_main: true,
  address_line_one: '12 Anand Mahal Road',
  address_line_two: null,
  area: 'Adajan',
  city: 'Surat',
  state: 'Gujarat',
  postal_code: '395009',
  phone: '+919825012345',
  email: 'adajan@example.com',
  gst_number: '24ABCDE1234F1Z5',
  opens_at: '10:00',
  closes_at: '20:00',
  working_days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
  default_doctor_membership_id: 'mem_a1s2d3f4g5h6j7k8l9z0x',
  default_front_desk_membership_id: null,
  default_therapist_membership_id: null,
  default_pharmacist_membership_id: null,
  is_active: true,
  maps_link: 'https://maps.example.com/adajan',
  review_link: null,
  created_at: '2026-10-07T09:00:00.000Z',
  updated_at: '2026-10-07T09:00:00.000Z',
};

// ── Branch summary (GET /app/branches/my) ──
export const branchSummarySchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    tone: { type: 'string' },
    is_main: { type: 'boolean' },
    opens_at: hourMinute,
    closes_at: hourMinute,
    working_days: workingDays,
  },
};

export const branchSummaryExample = {
  id: 'brn_q4w8e2r6t1y5u9i3o7p0a',
  name: 'Adajan',
  tone: 'sage',
  is_main: true,
  opens_at: '10:00',
  closes_at: '20:00',
  working_days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
};

// ── Branch user access ──
export const branchUserAccessSchema = {
  type: 'object',
  properties: {
    membership_id: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
  },
};

export const branchUserAccessExample = {
  membership_id: 'mem_a1s2d3f4g5h6j7k8l9z0x',
  created_at: '2026-10-07T09:00:00.000Z',
};

/** `AppUserOutput` — one active team member (`GET /app/users`). */
export const appUserSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'The membership (`mbr_…`)' },
    user_id: { type: 'string' },
    name: { type: 'string' },
    avatar_url: { type: 'string', nullable: true },
    staff_number: { type: 'integer' },
    tone: { type: 'string' },
    role_ids: { type: 'array', items: { type: 'string' } },
    branch_ids: { type: 'array', items: { type: 'string' } },
  },
};

/** Example `AppUserOutput`. */
export const appUserExample = {
  id: 'mbr_k7x9m2pqr4w8n1v3a1b2c',
  user_id: 'usr_a1b2c3d4e5f6g7h8i9j0k',
  name: 'Dr. Mehta',
  avatar_url: null,
  staff_number: 3,
  tone: 'sky',
  role_ids: ['rol_w3o6gphad7e9bvudnyovy'],
  branch_ids: ['brn_q4w8e2r6t1y5u9i3o7p0a'],
};

/** `ContactOutput` — a patient, lead or walk-in buyer (`GET /app/contacts`). */
export const contactSchema = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['patient', 'lead', 'medical_contact'] },
    id: { type: 'string' },
    name: { type: 'string' },
    phone: { type: 'string', nullable: true },
    email: { type: 'string', nullable: true },
    number: { type: 'integer', nullable: true },
    created_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `ContactOutput`. */
export const contactExample = {
  kind: 'patient',
  id: 'pat_k7x9m2pqr4w8n1v3a1b2c',
  name: 'Riya Shah',
  phone: '+919825044120',
  email: null,
  number: 3508,
  created_at: '2026-10-07T10:30:00.000Z',
};

/** `SearchOutput` — 10 records per kind (`GET /app/searches`). */
export const searchSchema = {
  type: 'object',
  properties: {
    patients: { type: 'array', items: { type: 'object' } },
    leads: { type: 'array', items: { type: 'object' } },
    appointments: { type: 'array', items: { type: 'object' } },
    invoices: { type: 'array', items: { type: 'object' } },
  },
};

/** Example `SearchOutput`. */
export const searchExample = { patients: [], leads: [], appointments: [], invoices: [] };

const contactAppointmentSummarySchema = {
  type: 'object',
  nullable: true,
  properties: {
    id: { type: 'string' },
    appointment_date: { type: 'string', format: 'date' },
    start_time: { type: 'string', example: '10:30' },
    service_label: { type: 'string' },
    status: { type: 'string' },
  },
};

/** `ContactPreviewOutput` — the hover preview (`GET /app/contacts/{contact_id}/preview`). */
export const contactPreviewSchema = {
  type: 'object',
  properties: {
    ...contactSchema.properties,
    next_appointment: contactAppointmentSummarySchema,
    last_appointment: contactAppointmentSummarySchema,
    lead_status: { type: 'string', nullable: true },
    linked_patient_id: { type: 'string', nullable: true },
  },
};

/** Example `ContactPreviewOutput`. */
export const contactPreviewExample = {
  ...contactExample,
  next_appointment: {
    id: 'appt_k7x9m2pqr4w8n1v3a1b2c',
    appointment_date: '2026-10-09',
    start_time: '11:00',
    service_label: 'Hydrafacial',
    status: 'confirmed',
  },
  last_appointment: null,
  lead_status: null,
  linked_patient_id: null,
};

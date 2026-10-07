/** OpenAPI response schemas — app domain (the clinic records). */

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
  email: 'adajan@clinic.example.com',
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

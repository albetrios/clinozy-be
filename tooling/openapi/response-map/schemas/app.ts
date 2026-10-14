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

// ── Branch summary (GET /app/branches/my) — with the address, phone and GSTIN a bill prints (D81) ──
export const branchSummarySchema = {
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
    gst_number: nullableString,
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
  address_line_one: '12 Anand Mahal Road',
  address_line_two: null,
  area: 'Adajan',
  city: 'Surat',
  state: 'Gujarat',
  postal_code: '395009',
  phone: '+919825012345',
  gst_number: '24ABCDE1234F1Z5',
  opens_at: '10:00',
  closes_at: '20:00',
  working_days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
};

// ── Branch user access ──
export const branchMemberSchema = {
  type: 'object',
  properties: {
    membership_id: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
  },
};

export const branchMemberExample = {
  membership_id: 'mem_a1s2d3f4g5h6j7k8l9z0x',
  created_at: '2026-10-07T09:00:00.000Z',
};

/** `AppMembershipOutput` — one team member in the picker and directory (`GET /app/memberships`). */
export const appMembershipSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'The membership (`mem_…`)' },
    user_id: { type: 'string' },
    display_name: { type: 'string', description: 'The name the organization keeps' },
    avatar_url: { type: 'string', nullable: true },
    staff_number: { type: 'integer' },
    tone: { type: 'string' },
    role_ids: { type: 'array', items: { type: 'string' } },
    branch_ids: { type: 'array', items: { type: 'string' } },
    is_active: { type: 'boolean', description: 'Live and active — what a picker offers' },
    is_owner: { type: 'boolean', description: "The organization's owner" },
    ended_at: { type: 'string', format: 'date-time', nullable: true },
  },
};

/** Example `AppMembershipOutput`. */
export const appMembershipExample = {
  id: 'mem_k7x9m2pqr4w8n1v3a1b2c',
  user_id: 'usr_a1b2c3d4e5f6g7h8i9j0k',
  display_name: 'Dr. Mehta',
  avatar_url: null,
  staff_number: 3,
  tone: 'sky',
  role_ids: ['rol_w3o6gphad7e9bvudnyovy'],
  branch_ids: ['brn_q4w8e2r6t1y5u9i3o7p0a'],
  is_active: true,
  is_owner: false,
  ended_at: null,
};

/** `AppRoleOutput` — one role in the role directory (`GET /app/roles`, launch D81 (4)). */
export const appRoleSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'The role (`rol_…`) — the id `role_ids` holds' },
    name: { type: 'string', description: "A system role's name never changes" },
    tone: { type: 'string', example: 'sky' },
    is_system: {
      type: 'boolean',
      description: 'A clinic preset — its name is fixed, it is never deleted',
    },
    is_locked: {
      type: 'boolean',
      description:
        "Its codes never change (`PUT /tenancy/organization/roles/{role_id}/permissions` is a 403 `role_locked`) — Owner and Admin as a clinic is provisioned. Not the only fixed role: the role the organization's owner holds as their main role is a 403 `owner_role_fixed` whatever this says — it is the first of `role_ids` on the `is_owner` membership (USERS-M3)",
    },
  },
};

/** Example `AppRoleOutput`. */
export const appRoleExample = {
  id: 'rol_w3o6gphad7e9bvudnyovy',
  name: 'Doctor',
  tone: 'sky',
  is_system: true,
  is_locked: false,
};

/** `MembershipPreferencesOutput` — a member's own settings (launch §2.F); `id` and times null before the first save. */
export const membershipPreferencesSchema = {
  type: 'object',
  properties: {
    id: { type: ['string', 'null'], example: 'upref_k7x9m2pqr4w8n1v3a1b2c' },
    pinned_sections: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'string',
        enum: [
          'today',
          'contacts',
          'activity',
          'leads',
          'appointments',
          'patients',
          'medical',
          'stock',
          'payments',
          'tasks',
          'offerings',
          'users',
        ],
      },
    },
    theme: { type: 'string', enum: ['light', 'dark', 'system'] },
    branch_ids: { type: 'array', maxItems: 20, items: { type: 'string' } },
    patient_file_pins: {
      type: 'array',
      maxItems: 11,
      items: {
        type: 'string',
        enum: [
          'overview',
          'activity',
          'clinical_notes',
          'appointments',
          'prescriptions',
          'treatments',
          'images',
          'reports',
          'packages',
          'invoices',
          'payments',
        ],
      },
    },
    recent_picks: { type: 'array', maxItems: 60, items: { type: 'string' } },
    created_at: { type: ['string', 'null'], format: 'date-time' },
    updated_at: { type: ['string', 'null'], format: 'date-time' },
  },
};

/** Example `MembershipPreferencesOutput`. */
export const membershipPreferencesExample = {
  id: 'upref_k7x9m2pqr4w8n1v3a1b2c',
  pinned_sections: ['appointments', 'leads', 'patients', 'payments'],
  theme: 'light',
  branch_ids: ['brn_k7x9m2pqr4w8n1v3a1b2c'],
  patient_file_pins: ['clinical_notes', 'appointments', 'prescriptions', 'invoices'],
  recent_picks: ['appointments:doctor:mem_k7x9m2pqr4w8n1v3a1b2c'],
  created_at: '2026-10-08T10:30:00.000Z',
  updated_at: '2026-10-08T10:30:00.000Z',
};

/** `MembershipSavedViewOutput` — a list's filters under a label (launch §2.G). */
export const membershipSavedViewSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'svw_k7x9m2pqr4w8n1v3a1b2c' },
    list_key: {
      type: 'string',
      enum: [
        'patients',
        'leads',
        'appointments',
        'invoices',
        'payments',
        'offerings',
        'memberships',
      ],
    },
    label: { type: 'string', maxLength: 60 },
    filters: { type: 'object', additionalProperties: true },
    hidden_columns: { type: 'array', maxItems: 40, items: { type: 'string' } },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `MembershipSavedViewOutput`. */
export const membershipSavedViewExample = {
  id: 'svw_k7x9m2pqr4w8n1v3a1b2c',
  list_key: 'patients',
  label: 'Due this week',
  filters: { q: 'shah' },
  hidden_columns: ['phone'],
  created_at: '2026-10-08T10:30:00.000Z',
  updated_at: '2026-10-08T10:30:00.000Z',
};

const nullableInstant = { type: ['string', 'null'], format: 'date-time' };

/** `ContactPhoneOutput` — one of a contact's numbers (routes-final 4.A.6). */
const contactPhoneSchema = {
  type: 'object',
  properties: {
    phone: { type: 'string', pattern: '^\\+91\\d{10}$' },
    is_primary: { type: 'boolean' },
    is_on_whatsapp: { type: 'boolean' },
  },
};

/** `ContactOutput` — one person, shared by leads, patients and appointments (launch #129, 4.A.6). */
export const contactSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'con_k7x9m2pqr4w8n1v3a1b2c' },
    contact_number: { type: 'integer', description: 'Shown as "C-12345"' },
    first_name: { type: 'string', maxLength: 60 },
    last_name: { ...nullableString, maxLength: 60 },
    gender: { type: 'string', enum: ['female', 'male', 'other'], nullable: true },
    date_of_birth: { type: 'string', format: 'date', nullable: true },
    primary_phone: { type: 'string', pattern: '^\\+91\\d{10}$' },
    phones: {
      type: 'array',
      minItems: 1,
      maxItems: 5,
      items: contactPhoneSchema,
      description: 'On single-contact responses only (routes 2–6)',
    },
    email: nullableString,
    address: nullableString,
    instagram_handles: { type: 'array', maxItems: 5, items: { type: 'string' } },
    default_channel: { type: 'string', enum: ['whatsapp', 'call', 'instagram'] },
    preference_tags: {
      type: 'array',
      maxItems: 12,
      items: { type: 'string', pattern: '^[a-z][a-z0-9_]{1,39}$' },
    },
    has_marketing_consent: { type: 'boolean' },
    referral_source: {
      type: 'string',
      enum: ['patient', 'doctor', 'instagram', 'google', 'walk_in', 'other'],
      nullable: true,
    },
    referred_by_contact_id: nullableString,
    referred_by_name: nullableString,
    household_contact_id: { type: 'string', description: "The household's first contact" },
    member_membership_ids: { type: 'array', items: { type: 'string' } },
    patient_id: nullableString,
    patient_number: { type: 'integer', nullable: true },
    open_lead_id: nullableString,
    open_lead_status: nullableString,
    last_visit_on: { type: 'string', format: 'date', nullable: true },
    next_visit_on: { type: 'string', format: 'date', nullable: true },
    last_activity_at: nullableInstant,
    last_sent_at: nullableInstant,
    last_received_at: nullableInstant,
    is_awaiting_reply: { type: 'boolean' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `ContactOutput` (a single-contact response — with `phones`). */
export const contactExample = {
  id: 'con_k7x9m2pqr4w8n1v3a1b2c',
  contact_number: 12345,
  first_name: 'Riya',
  last_name: 'Shah',
  gender: 'female',
  date_of_birth: '1994-03-12',
  primary_phone: '+919825044120',
  phones: [{ phone: '+919825044120', is_primary: true, is_on_whatsapp: true }],
  email: null,
  address: 'Satellite, Ahmedabad',
  instagram_handles: [],
  default_channel: 'whatsapp',
  preference_tags: ['no_calls', 'after_six_pm'],
  has_marketing_consent: false,
  referral_source: 'instagram',
  referred_by_contact_id: null,
  referred_by_name: null,
  household_contact_id: 'con_k7x9m2pqr4w8n1v3a1b2c',
  member_membership_ids: ['mem_a1s2d3f4g5h6j7k8l9z0x'],
  patient_id: null,
  patient_number: null,
  open_lead_id: null,
  open_lead_status: null,
  last_visit_on: null,
  next_visit_on: null,
  last_activity_at: null,
  last_sent_at: null,
  last_received_at: null,
  is_awaiting_reply: false,
  created_at: '2026-10-07T10:30:00.000Z',
  updated_at: '2026-10-07T10:30:00.000Z',
};

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

/** `ContactPreviewOutput` — the hover card (`GET /app/contacts/{contact_id}/preview`). */
export const contactPreviewSchema = {
  type: 'object',
  properties: {
    ...contactSchema.properties,
    open_lead: {
      type: 'object',
      nullable: true,
      properties: {
        id: { type: 'string' },
        status: { type: 'string' },
        owner_membership_id: nullableString,
      },
    },
    patient: {
      type: 'object',
      nullable: true,
      properties: { id: { type: 'string' }, patient_number: { type: 'integer' } },
    },
    next_appointment: contactAppointmentSummarySchema,
    last_appointment: contactAppointmentSummarySchema,
  },
};

/** Example `ContactPreviewOutput`. */
export const contactPreviewExample = {
  ...Object.fromEntries(Object.entries(contactExample).filter(([key]) => key !== 'phones')),
  open_lead: null,
  patient: null,
  next_appointment: null,
  last_appointment: null,
};

/** `ContactMemberOutput` — a team member who handles a contact (CT11). */
export const contactMemberSchema = branchMemberSchema;

/** Example `ContactMemberOutput`. */
export const contactMemberExample = branchMemberExample;

/** `ContactActivityOutput` — one entry of a contact's stream (launch #130, routes-final 4.C.6). */
export const contactActivitySchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'msg_k7x9m2pqr4w8n1v3a1b2c' },
    contact_id: { type: 'string' },
    type: { type: 'string', enum: ['whatsapp', 'instagram', 'call_log', 'note', 'system'] },
    direction: { type: ['string', 'null'], enum: ['sent', 'received', null] },
    body: { type: 'string', maxLength: 1000 },
    contact_message_template_id: nullableString,
    attachment_keys: { type: 'array', maxItems: 5, items: { type: 'string' } },
    reply_to_contact_activity_id: nullableString,
    delivery_status: {
      type: ['string', 'null'],
      enum: ['queued', 'sent', 'delivered', 'read', 'failed', null],
    },
    failure_reason: nullableString,
    occurred_at: { type: 'string', format: 'date-time' },
    delivered_at: nullableInstant,
    read_at: nullableInstant,
    failed_at: nullableInstant,
    author_membership_id: nullableString,
    appointment_id: nullableString,
    invoice_id: nullableString,
    payment_id: nullableString,
    patient_prescription_id: nullableString,
    patient_offering_id: nullableString,
    patient_review_id: nullableString,
    patient_check_in_id: nullableString,
    task_id: nullableString,
    patient_treatment_id: nullableString,
    patient_clinical_note_id: nullableString,
    patient_image_id: nullableString,
    patient_report_id: nullableString,
    group: { type: 'string', enum: ['messages', 'clinical', 'money', 'tasks'] },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `ContactActivityOutput` — a queued WhatsApp message. */
export const contactActivityExample = {
  id: 'msg_k7x9m2pqr4w8n1v3a1b2c',
  contact_id: 'con_k7x9m2pqr4w8n1v3a1b2c',
  type: 'whatsapp',
  direction: 'sent',
  body: 'Hi Riya, your slot is confirmed for tomorrow at 11.',
  contact_message_template_id: null,
  attachment_keys: [],
  reply_to_contact_activity_id: null,
  delivery_status: 'queued',
  failure_reason: null,
  occurred_at: '2026-10-08T10:30:00.000Z',
  delivered_at: null,
  read_at: null,
  failed_at: null,
  author_membership_id: 'mem_a1s2d3f4g5h6j7k8l9z0x',
  appointment_id: null,
  invoice_id: null,
  payment_id: null,
  patient_prescription_id: null,
  patient_offering_id: null,
  patient_review_id: null,
  patient_check_in_id: null,
  task_id: null,
  patient_treatment_id: null,
  patient_clinical_note_id: null,
  patient_image_id: null,
  patient_report_id: null,
  group: 'messages',
  created_at: '2026-10-08T10:30:00.000Z',
  updated_at: '2026-10-08T10:30:00.000Z',
};

/** `ContactMessageTemplateOutput` — a reusable outgoing text (launch #130, routes-final 4.D.6). */
export const contactMessageTemplateSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', example: 'mtpl_k7x9m2pqr4w8n1v3a1b2c' },
    name: { type: 'string', maxLength: 60 },
    body: { type: 'string', maxLength: 1000 },
    type: { type: 'string', enum: ['whatsapp', 'instagram'] },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

/** Example `ContactMessageTemplateOutput`. */
export const contactMessageTemplateExample = {
  id: 'mtpl_k7x9m2pqr4w8n1v3a1b2c',
  name: 'Slot confirmed',
  body: 'Hi <first>, your slot is confirmed.',
  type: 'whatsapp',
  created_at: '2026-10-08T10:30:00.000Z',
  updated_at: '2026-10-08T10:30:00.000Z',
};

// ── Who owes on medical sales (GET /app/medical-sales/dues — "Send payment reminders", MD25) ──
export const medicalSaleDuesSchema = {
  type: 'object',
  properties: {
    contact: {
      type: 'object',
      nullable: true,
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        primary_phone: { type: 'string' },
      },
    },
    patient_id: nullableString,
    due_total: { type: 'number' },
    sale_count: { type: 'integer' },
    sales: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'msal_k7x9m2pqr4w8n1v3a1b2c' },
          sale_number: { type: 'integer', description: 'S-983' },
          due_amount: { type: 'number' },
          sold_at: { type: 'string', format: 'date-time' },
        },
      },
    },
    oldest_sold_at: { type: 'string', format: 'date-time' },
  },
};

export const medicalSaleDuesExample = {
  contact: { id: 'con_k7x9m2pqr4w8n1v3a1b2c', name: 'Asha Patel', primary_phone: '+919825044122' },
  patient_id: 'pat_k7x9m2pqr4w8n1v3a1b2c',
  due_total: 1101,
  sale_count: 2,
  sales: [
    {
      id: 'msal_k7x9m2pqr4w8n1v3a1b2c',
      sale_number: 981,
      due_amount: 738,
      sold_at: '2026-10-11T10:12:00.000Z',
    },
    {
      id: 'msal_q4w8e2r6t1y5u9i3o7p0a',
      sale_number: 983,
      due_amount: 363,
      sold_at: '2026-10-13T10:12:00.000Z',
    },
  ],
  oldest_sold_at: '2026-10-11T10:12:00.000Z',
};

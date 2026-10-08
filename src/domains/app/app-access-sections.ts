/**
 * The access sections of the Users › Roles matrix (D10, D12): each section is the resources whose
 * `<resource>:read|create|update|delete` codes it holds — the permission catalog's `category`.
 * A branch's rooms, machines and holidays carry no codes of their own — the branch's (`users` section)
 * gate them (D12). A member's own preferences and saved views carry none either: every member reaches
 * their own with `organization:read` (launch U2). Offerings have no View code — every member reads
 * them (launch O2); their row adds Lowest price (`offering:lower_price:read`) and Export
 * (`offering:export`). The Leads and Appointments rows add Export (`lead:export`, `appointment:export` — launch #131
 * L4, #132 A9).
 *
 * @remarks
 * - **Notes:** generated with the app tables; the catalog seed carries the same categories.
 */
export const APP_ACCESS_SECTION_RESOURCES = {
  // The person every lead, patient file and appointment points at (launch #129, CT5).
  contacts: ['contact'],
  // The stream and its templates (launch #130, M4) — the Activity row.
  activity: ['contact_activity'],
  leads: ['lead'],
  appointments: ['appointment'],
  patients: ['patient', 'patient_prescription', 'treatment', 'review'],
  medical: [
    'manufacturer',
    'supplier',
    'medical_rep',
    'medicine',
    'medical_purchase_order',
    'medical_sale',
  ],
  stock: ['stock_vendor', 'stock_item', 'stock_purchase'],
  payments: ['invoice', 'payment', 'day_close'],
  tasks: ['task'],
  // One code set for groups, offerings and offers (launch #128, O2); no `offering:read` — every
  // member reads them.
  offerings: ['offering'],
  // The team's codes are tenancy's (membership, role — launch T8); they sit in the Users row.
  users: ['branch', 'membership', 'role'],
} as const;

/** A section key of {@link APP_ACCESS_SECTION_RESOURCES}. */
export type AppAccessSection = keyof typeof APP_ACCESS_SECTION_RESOURCES;

/** The matrix rows, in the Users › Roles order (Today is not a row). */
export const APP_MATRIX_SECTIONS = [
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
] as const satisfies readonly AppAccessSection[];

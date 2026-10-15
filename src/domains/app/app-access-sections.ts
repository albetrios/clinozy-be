/**
 * The access sections of the Users › Roles matrix (D10, D12): each section is the resources whose
 * `<resource>:read|create|update|delete` codes it holds — the permission catalog's `category`.
 * A branch's rooms, machines and holidays carry no codes of their own — the branch's (`branches`
 * section) gate them (D12). A member's own preferences and saved views carry none either: every member reaches
 * their own with `organization:read` (launch U2). Offerings have no View code — every member reads
 * them (launch O2); their row adds Lowest price (`offering:lower_price:read`) and Export
 * (`offering:export`). The Leads and Appointments rows add Export (`lead:export`, `appointment:export` — launch #131
 * L4, #132 A9); the Payments row adds Export (`payment:export` — launch #136, B2), the Clinic stock row Export
 * (`stock_item:export` — launch #137, S2), the Tasks row Export (`task:export` — launch #138, TK2),
 * the Medical row Export (`medicine:export` — launch #153, MD2).
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
  patients: ['patient', 'patient_prescription', 'patient_treatment'],
  // One code set for the medical store (launch #153, MD2); the row adds Export (`medicine:export`).
  medical: ['medicine'],
  // One code set for items, movements, counts, purchases and vendors (launch #137, S2); the row
  // adds Export (`stock_item:export`).
  stock: ['stock_item'],
  // One code set for invoices, credit notes, payments, pending credits and day closes (launch
  // #136, B2); the row adds Export (`payment:export`).
  payments: ['payment'],
  // The row adds Export (`task:export` — launch #138, TK2).
  tasks: ['task'],
  // One code set for groups, offerings and offers (launch #128, O2); no `offering:read` — every
  // member reads them.
  offerings: ['offering'],
  // The team's codes are tenancy's (membership, role — launch T8); they sit in the Users row.
  users: ['membership', 'role'],
  // The Branches room — its own section in the navbar and its own row, after Users
  // (change-branches-in-navbar).
  branches: ['branch'],
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
  'branches',
] as const satisfies readonly AppAccessSection[];

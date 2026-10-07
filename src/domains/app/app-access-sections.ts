/**
 * The access sections of the Users › Roles matrix (D10, D12): each section is the resources whose
 * `<resource>:read|create|update|delete` codes it holds — the permission catalog's `category`.
 * `settings` (rooms, machines, holidays) and `personal` (saved views) are not matrix rows.
 *
 * @remarks
 * - **Notes:** generated with the app tables; the catalog seed carries the same categories.
 */
export const APP_ACCESS_SECTION_RESOURCES = {
  leads: ['lead', 'message_template'],
  appointments: ['appointment'],
  patients: ['patient', 'prescription', 'treatment', 'review'],
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
  offerings: ['offering', 'offering_group', 'offer'],
  users: ['branch'],
  settings: ['room', 'machine', 'branch_holiday'],
  personal: ['saved_view'],
} as const;

/** A section key of {@link APP_ACCESS_SECTION_RESOURCES}. */
export type AppAccessSection = keyof typeof APP_ACCESS_SECTION_RESOURCES;

/** The matrix rows, in the Users › Roles order (Today is not a row). */
export const APP_MATRIX_SECTIONS: readonly AppAccessSection[] = [
  'leads',
  'appointments',
  'patients',
  'medical',
  'stock',
  'payments',
  'tasks',
  'offerings',
  'users',
];

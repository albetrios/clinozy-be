/**
 * Organization-scoped permission codes guarded by the app domain (the app's own records) — used by
 * `requireOrganizationPermission` preHandlers on branch routes and by `hasOrganizationPermission`
 * where a permission widens a result (`GET /app/branches/my`).
 */
export const APP_PERMISSIONS = {
  BRANCH_READ: 'branch:read',
  BRANCH_CREATE: 'branch:create',
  BRANCH_UPDATE: 'branch:update',
  BRANCH_DELETE: 'branch:delete',
  // Offerings (launch #128, O2): one code set for groups, offerings — prices included — and
  // offers; reads are every member's (`organization:read`).
  OFFERING_CREATE: 'offering:create',
  OFFERING_UPDATE: 'offering:update',
  OFFERING_DELETE: 'offering:delete',
  /** See an offering's `min_price` — null without it (O15). */
  OFFERING_LOWER_PRICE_READ: 'offering:lower_price:read',
  /** Download the offerings CSV (O14). */
  OFFERING_EXPORT: 'offering:export',
  // Contacts (launch #129, CT5): one person shared by leads, patients and appointments — not
  // branch-scoped (CT6).
  CONTACT_READ: 'contact:read',
  CONTACT_CREATE: 'contact:create',
  CONTACT_UPDATE: 'contact:update',
  CONTACT_DELETE: 'contact:delete',
  // Contact activity (launch #130, M4): the stream and the message templates — templates are read
  // by every member (`organization:read`).
  CONTACT_ACTIVITY_READ: 'contact_activity:read',
  CONTACT_ACTIVITY_CREATE: 'contact_activity:create',
  CONTACT_ACTIVITY_UPDATE: 'contact_activity:update',
  CONTACT_ACTIVITY_DELETE: 'contact_activity:delete',
  PATIENT_READ: 'patient:read',
  PATIENT_CREATE: 'patient:create',
  PATIENT_UPDATE: 'patient:update',
  PATIENT_DELETE: 'patient:delete',
  /** Download the patients CSV (launch #133, P5). */
  PATIENT_EXPORT: 'patient:export',
  LEAD_READ: 'lead:read',
  LEAD_CREATE: 'lead:create',
  LEAD_UPDATE: 'lead:update',
  LEAD_DELETE: 'lead:delete',
  /** Download the leads CSV (launch #131, L4). */
  LEAD_EXPORT: 'lead:export',
  APPOINTMENT_READ: 'appointment:read',
  APPOINTMENT_CREATE: 'appointment:create',
  APPOINTMENT_UPDATE: 'appointment:update',
  APPOINTMENT_DELETE: 'appointment:delete',
  /** Download the appointments CSV (launch #132, A9). */
  APPOINTMENT_EXPORT: 'appointment:export',
  // Prescriptions (launch #133, P5, P27): the doctors' own code set in the Patients row.
  PATIENT_PRESCRIPTION_READ: 'patient_prescription:read',
  PATIENT_PRESCRIPTION_CREATE: 'patient_prescription:create',
  PATIENT_PRESCRIPTION_UPDATE: 'patient_prescription:update',
  PATIENT_PRESCRIPTION_DELETE: 'patient_prescription:delete',
  PATIENT_TREATMENT_READ: 'patient_treatment:read',
  PATIENT_TREATMENT_CREATE: 'patient_treatment:create',
  PATIENT_TREATMENT_UPDATE: 'patient_treatment:update',
  PAYMENT_READ: 'payment:read',
  PAYMENT_CREATE: 'payment:create',
  PAYMENT_UPDATE: 'payment:update',
  PAYMENT_DELETE: 'payment:delete',
  PAYMENT_EXPORT: 'payment:export',
  // The medical store (launch #153, MD2): one code set for medicines, sales, orders, suppliers,
  // manufacturers, MRs and their visits; voiding a sale and cancelling an order are `medicine:delete`.
  MEDICINE_READ: 'medicine:read',
  MEDICINE_CREATE: 'medicine:create',
  MEDICINE_UPDATE: 'medicine:update',
  MEDICINE_DELETE: 'medicine:delete',
  /** Download the medicines, orders and sales CSVs (launch #153, MD2). */
  MEDICINE_EXPORT: 'medicine:export',
  // Clinic stock (launch #137, S2): one code set for items, movements, counts, purchases and
  // vendors; using, receiving, adjusting, reverting and counting are `stock_item:update`.
  STOCK_ITEM_READ: 'stock_item:read',
  STOCK_ITEM_CREATE: 'stock_item:create',
  STOCK_ITEM_UPDATE: 'stock_item:update',
  STOCK_ITEM_DELETE: 'stock_item:delete',
  /** Download the stock items and purchases CSVs (launch #137, S2). */
  STOCK_ITEM_EXPORT: 'stock_item:export',
  // Tasks (launch #138, TK2): one code set; turning rules on and off is `organization:update`.
  TASK_READ: 'task:read',
  TASK_CREATE: 'task:create',
  TASK_UPDATE: 'task:update',
  TASK_DELETE: 'task:delete',
  /** Download the tasks CSV (launch #138, TK2). */
  TASK_EXPORT: 'task:export',
  // ── Special permissions (D18) — not a table's own actions ──
  PATIENT_CLINICAL_RECORD_READ: 'patient:clinical_record:read',
  PATIENT_PRIVATE_ALBUM_READ: 'patient:private_album:read',
} as const;

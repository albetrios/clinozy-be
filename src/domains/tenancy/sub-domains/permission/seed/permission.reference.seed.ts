/**
 * Tenancy permission seed — system permission codes.
 * Domain-owned; used by scripts/seed orchestration.
 *
 * Codes must match domain permission constants (e.g. tenancy.permissions.ts,
 * billing.permissions.ts) and docs/routes.txt — routes enforce these exact strings.
 */
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { permissions } from '@/domains/tenancy/sub-domains/permission/permission.schema.js';

/**
 * Canonical list of system permission codes seeded into `tenancy.permissions`.
 * Codes must match the per-domain permission constants (e.g.
 * {@link TENANCY_PERMISSIONS}, `BILLING_PERMISSIONS`) and `docs/routes.txt`,
 * since route guards compare against these exact strings.
 */
export const SYSTEM_PERMISSIONS = [
  // Tenancy
  { code: 'organization:read', name: 'View Organization', category: 'tenancy' },
  { code: 'organization:update', name: 'Update Organization', category: 'tenancy' },
  { code: 'organization:delete', name: 'Delete Organization', category: 'tenancy' },
  // The team (launch T8): the Users row of the Roles matrix, with the branches.
  { code: 'membership:read', name: 'View Members', category: 'users' },
  { code: 'membership:create', name: 'Create Members', category: 'users' },
  { code: 'membership:update', name: 'Update Members', category: 'users' },
  { code: 'membership:delete', name: 'Delete Members', category: 'users' },
  { code: 'role:read', name: 'View Roles', category: 'users' },
  { code: 'role:create', name: 'Create Roles', category: 'users' },
  { code: 'role:update', name: 'Update Roles', category: 'users' },
  { code: 'role:delete', name: 'Delete Roles', category: 'users' },
  { code: 'api-key:read', name: 'View API Keys', category: 'tenancy' },
  { code: 'api-key:manage', name: 'Manage API Keys', category: 'tenancy' },
  {
    code: 'notification-policy:read',
    name: 'View Notification Policies',
    category: 'tenancy',
  },
  {
    code: 'notification-policy:manage',
    name: 'Manage Notification Policies',
    category: 'tenancy',
  },
  // Billing
  { code: 'subscription:read', name: 'View Subscription', category: 'billing' },
  { code: 'subscription:manage', name: 'Manage Subscription', category: 'billing' },
  // Notify
  { code: 'webhook:read', name: 'View Webhooks', category: 'notify' },
  { code: 'webhook:manage', name: 'Manage Webhooks', category: 'notify' },
  // Audit
  { code: 'audit-log:read', name: 'View Audit Logs', category: 'audit' },
  // Upload
  { code: 'upload:manage', name: 'Manage Uploads', category: 'upload' },
  // App (the app's own records)
  { code: 'branch:read', name: 'View Branches', category: 'users' },
  { code: 'branch:create', name: 'Create Branches', category: 'users' },
  { code: 'branch:update', name: 'Update Branches', category: 'users' },
  { code: 'branch:delete', name: 'Delete Branches', category: 'users' },
  { code: 'day_close:close', name: 'Close The Day', category: 'special' },
  { code: 'task:delete', name: 'Delete Tasks', category: 'tasks' },
  { code: 'task:update', name: 'Update Tasks', category: 'tasks' },
  { code: 'task:create', name: 'Create Tasks', category: 'tasks' },
  { code: 'task:read', name: 'View Tasks', category: 'tasks' },
  { code: 'stock_purchase:delete', name: 'Delete Stock Purchases', category: 'stock' },
  { code: 'stock_purchase:update', name: 'Update Stock Purchases', category: 'stock' },
  { code: 'stock_purchase:create', name: 'Create Stock Purchases', category: 'stock' },
  { code: 'stock_purchase:read', name: 'View Stock Purchases', category: 'stock' },
  { code: 'stock_item:delete', name: 'Delete Stock Items', category: 'stock' },
  { code: 'stock_item:update', name: 'Update Stock Items', category: 'stock' },
  { code: 'stock_item:create', name: 'Create Stock Items', category: 'stock' },
  { code: 'stock_item:read', name: 'View Stock Items', category: 'stock' },
  { code: 'stock_vendor:delete', name: 'Delete Stock Vendors', category: 'stock' },
  { code: 'stock_vendor:update', name: 'Update Stock Vendors', category: 'stock' },
  { code: 'stock_vendor:create', name: 'Create Stock Vendors', category: 'stock' },
  { code: 'stock_vendor:read', name: 'View Stock Vendors', category: 'stock' },
  { code: 'medical_sale:delete', name: 'Delete Medical Sales', category: 'medical' },
  { code: 'medical_sale:update', name: 'Update Medical Sales', category: 'medical' },
  { code: 'medical_sale:create', name: 'Create Medical Sales', category: 'medical' },
  { code: 'medical_sale:read', name: 'View Medical Sales', category: 'medical' },
  { code: 'medical_purchase_order:delete', name: 'Delete Purchase Orders', category: 'medical' },
  { code: 'medical_purchase_order:update', name: 'Update Purchase Orders', category: 'medical' },
  { code: 'medical_purchase_order:create', name: 'Create Purchase Orders', category: 'medical' },
  { code: 'medical_purchase_order:read', name: 'View Purchase Orders', category: 'medical' },
  { code: 'medicine:delete', name: 'Delete Medicines', category: 'medical' },
  { code: 'medicine:update', name: 'Update Medicines', category: 'medical' },
  { code: 'medicine:create', name: 'Create Medicines', category: 'medical' },
  { code: 'medicine:read', name: 'View Medicines', category: 'medical' },
  { code: 'medical_rep:delete', name: 'Delete Medical Reps', category: 'medical' },
  { code: 'medical_rep:update', name: 'Update Medical Reps', category: 'medical' },
  { code: 'medical_rep:create', name: 'Create Medical Reps', category: 'medical' },
  { code: 'medical_rep:read', name: 'View Medical Reps', category: 'medical' },
  { code: 'supplier:delete', name: 'Delete Suppliers', category: 'medical' },
  { code: 'supplier:update', name: 'Update Suppliers', category: 'medical' },
  { code: 'supplier:create', name: 'Create Suppliers', category: 'medical' },
  { code: 'supplier:read', name: 'View Suppliers', category: 'medical' },
  { code: 'manufacturer:delete', name: 'Delete Manufacturers', category: 'medical' },
  { code: 'manufacturer:update', name: 'Update Manufacturers', category: 'medical' },
  { code: 'manufacturer:create', name: 'Create Manufacturers', category: 'medical' },
  { code: 'manufacturer:read', name: 'View Manufacturers', category: 'medical' },
  { code: 'review:delete', name: 'Delete Reviews', category: 'patients' },
  { code: 'review:update', name: 'Update Reviews', category: 'patients' },
  { code: 'review:create', name: 'Create Reviews', category: 'patients' },
  { code: 'review:read', name: 'View Reviews', category: 'patients' },
  { code: 'treatment:delete', name: 'Delete Treatments', category: 'patients' },
  { code: 'treatment:update', name: 'Update Treatments', category: 'patients' },
  { code: 'treatment:create', name: 'Create Treatments', category: 'patients' },
  { code: 'treatment:read', name: 'View Treatments', category: 'patients' },
  { code: 'day_close:delete', name: 'Delete Day Closes', category: 'payments' },
  { code: 'day_close:update', name: 'Update Day Closes', category: 'payments' },
  { code: 'day_close:create', name: 'Create Day Closes', category: 'payments' },
  { code: 'day_close:read', name: 'View Day Closes', category: 'payments' },
  { code: 'payment:delete', name: 'Delete Payments', category: 'payments' },
  { code: 'payment:update', name: 'Update Payments', category: 'payments' },
  { code: 'payment:create', name: 'Create Payments', category: 'payments' },
  { code: 'payment:read', name: 'View Payments', category: 'payments' },
  { code: 'invoice:delete', name: 'Delete Invoices', category: 'payments' },
  { code: 'invoice:update', name: 'Update Invoices', category: 'payments' },
  { code: 'invoice:create', name: 'Create Invoices', category: 'payments' },
  { code: 'invoice:read', name: 'View Invoices', category: 'payments' },
  { code: 'prescription:delete', name: 'Delete Prescriptions', category: 'patients' },
  { code: 'prescription:update', name: 'Update Prescriptions', category: 'patients' },
  { code: 'prescription:create', name: 'Create Prescriptions', category: 'patients' },
  { code: 'prescription:read', name: 'View Prescriptions', category: 'patients' },
  { code: 'appointment:delete', name: 'Delete Appointments', category: 'appointments' },
  { code: 'appointment:update', name: 'Update Appointments', category: 'appointments' },
  { code: 'appointment:create', name: 'Create Appointments', category: 'appointments' },
  { code: 'appointment:read', name: 'View Appointments', category: 'appointments' },
  { code: 'lead:delete', name: 'Delete Leads', category: 'leads' },
  { code: 'lead:update', name: 'Update Leads', category: 'leads' },
  { code: 'lead:create', name: 'Create Leads', category: 'leads' },
  { code: 'lead:read', name: 'View Leads', category: 'leads' },
  { code: 'lead:export', name: 'Export Leads', category: 'leads' },
  { code: 'patient:delete', name: 'Delete Patients', category: 'patients' },
  { code: 'patient:update', name: 'Update Patients', category: 'patients' },
  { code: 'patient:create', name: 'Create Patients', category: 'patients' },
  { code: 'patient:read', name: 'View Patients', category: 'patients' },
  { code: 'contact_activity:delete', name: 'Delete Message Templates', category: 'activity' },
  {
    code: 'contact_activity:update',
    name: 'Resend Messages And Edit Templates',
    category: 'activity',
  },
  {
    code: 'contact_activity:create',
    name: 'Send Messages, Log Calls And Add Notes',
    category: 'activity',
  },
  { code: 'contact_activity:read', name: 'View Contact Activity', category: 'activity' },
  { code: 'contact:delete', name: 'Delete Contacts', category: 'contacts' },
  { code: 'contact:update', name: 'Update Contacts', category: 'contacts' },
  { code: 'contact:create', name: 'Create Contacts', category: 'contacts' },
  { code: 'contact:read', name: 'View Contacts', category: 'contacts' },
  { code: 'offering:delete', name: 'Delete Offerings', category: 'offerings' },
  { code: 'offering:update', name: 'Update Offerings', category: 'offerings' },
  { code: 'offering:create', name: 'Create Offerings', category: 'offerings' },
  { code: 'offering:lower_price:read', name: 'See The Lowest Price', category: 'offerings' },
  { code: 'offering:export', name: 'Export Offerings', category: 'offerings' },
  { code: 'payment:reverse_settled', name: 'Reverse Settled Payments', category: 'special' },
  { code: 'refund:create', name: 'Give Refunds And Credit Notes', category: 'special' },
  { code: 'sale:void', name: 'Void Sales And Delete Invoices', category: 'special' },
  { code: 'clinical_record:read', name: 'Read Clinical Notes', category: 'special' },
  { code: 'list:export', name: 'Export Lists', category: 'special' },
  { code: 'task_rule:update', name: 'Change Task Rules', category: 'special' },
  { code: 'private_album:read', name: 'See The Private Photo Album', category: 'special' },
] as const;

/**
 * Idempotently inserts the system permission catalog into
 * `tenancy.permissions`. `ON CONFLICT DO NOTHING` makes the seed safe to
 * re-run; callers may pass a custom code list for tests, otherwise
 * {@link SYSTEM_PERMISSIONS} is used.
 */
export async function seedPermissions(
  codes: Array<{
    code: string;
    name: string;
    category: string;
    description?: string;
  }> = [...SYSTEM_PERMISSIONS],
) {
  return getRequestDatabase().insert(permissions).values(codes).onConflictDoNothing().returning();
}

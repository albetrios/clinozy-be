import { publicIdPlaceholderFor } from '@/shared/utils/identity/public-id.util.js';
import {
  addDaysToCalendarDate,
  calendarDateInTimeZone,
} from '@/shared/utils/validation/record-fields.util.js';

/**
 * The ids and dates a request body names: real records of the caller's own organization (the
 * cross-organization matrix) or well-formed placeholders (the permission matrix, where the
 * permission check answers before any lookup).
 */
export interface AppRouteReferences {
  branchId: string;
  membershipId: string;
  doctorMembershipId: string;
  contactId: string;
  offeringId: string;
  uploadKey: string;
  invoiceItemId: string;
  medicineId: string;
  medicineBatchId: string;
  supplierId: string;
  stockItemId: string;
  stockVendorId: string;
  roleId: string;
  /** `YYYY-MM-DD` dates in the organization's time zone. */
  today: string;
  yesterday: string;
  tomorrow: string;
  /** A working day well ahead — a booking's or a holiday's date. */
  laterDay: string;
}

/** A calendar day `offset` days from now, `YYYY-MM-DD` in `timeZone`. */
function dayFrom(offset: number, timeZone: string): string {
  return addDaysToCalendarDate({ date: calendarDateInTimeZone({ timeZone }), days: offset });
}

/**
 * Well-formed placeholder references (`<prefix>_000…`) — enough to pass a route's body schema, so a
 * request reaches the permission check, which answers before any record is looked up.
 */
export function placeholderAppRouteReferences(timeZone = 'Asia/Kolkata'): AppRouteReferences {
  return {
    branchId: publicIdPlaceholderFor('branch'),
    membershipId: publicIdPlaceholderFor('membership'),
    doctorMembershipId: publicIdPlaceholderFor('membership'),
    contactId: publicIdPlaceholderFor('contact'),
    offeringId: publicIdPlaceholderFor('offering'),
    uploadKey: 'organizations/placeholder/uploads/placeholder.jpg',
    invoiceItemId: publicIdPlaceholderFor('invoiceItem'),
    medicineId: publicIdPlaceholderFor('medicine'),
    medicineBatchId: publicIdPlaceholderFor('medicineBatch'),
    supplierId: publicIdPlaceholderFor('supplier'),
    stockItemId: publicIdPlaceholderFor('stockItem'),
    stockVendorId: publicIdPlaceholderFor('stockVendor'),
    roleId: publicIdPlaceholderFor('memberRole'),
    today: dayFrom(0, timeZone),
    yesterday: dayFrom(-1, timeZone),
    tomorrow: dayFrom(1, timeZone),
    laterDay: dayFrom(50, timeZone),
  };
}

/**
 * A body the route's schema accepts — keyed `METHOD /path` with the `:params` left in, `undefined`
 * for a route that takes none (a `GET`, a `DELETE`, a restore, an action without a body).
 *
 * @remarks
 * - **Algorithm:** a table of each app write's smallest valid body (and the tenancy membership and
 *   role writes the permission matrix reaches), naming only `references`.
 * - **Notes:** shared by the app cross-organization matrix and the permission route matrix, so a
 *   body that stops passing its schema fails both; the per-section suites hold the full flows.
 */
export function appRouteBody(options: {
  method: string;
  path: string;
  references: AppRouteReferences;
}): unknown {
  const { method, path, references } = options;
  const splits = [{ mode: 'cash', amount: 1 }];
  const medicineLine = {
    medicine_name: 'Glycolac',
    medicine_id: references.medicineId,
    dose_night: 1,
    meal: 'after',
    quantity: 1,
  };
  const bodies: Record<string, unknown> = {
    // Creates.
    'POST /app/appointments': {
      contact_id: references.contactId,
      branch_id: references.branchId,
      doctor_membership_id: references.doctorMembershipId,
      appointment_date: references.laterDay,
      start_time: '11:00',
      service_label: 'Consultation',
    },
    'POST /app/branches': {
      name: 'Matrix branch',
      address_line_one: '1 Main Road',
      area: 'Adajan',
      city: 'Surat',
      postal_code: '395009',
      phone: '+919800000000',
      email: 'matrix@example.com',
    },
    'POST /app/contact-activities/message-batches': {
      contact_ids: [references.contactId],
      type: 'whatsapp',
      body: 'Hi',
    },
    'POST /app/contact-message-templates': { name: 'Hello', body: 'Hi <first>' },
    'POST /app/contacts': {
      first_name: 'Asha',
      last_name: 'Matrix',
      phones: [{ phone: '+919812300001', is_primary: true }],
    },
    'POST /app/day-closes': { branch_id: references.branchId, close_date: references.yesterday },
    'POST /app/invoices': {
      branch_id: references.branchId,
      contact_id: references.contactId,
      items: [{ offering_id: references.offeringId, quantity: 1 }],
    },
    'POST /app/invoices/preview': {
      branch_id: references.branchId,
      items: [{ offering_id: references.offeringId, quantity: 1 }],
    },
    'POST /app/invoices/:invoice_id/preview': { remark: 'Changed' },
    'POST /app/leads': { contact_id: references.contactId, branch_id: references.branchId },
    'POST /app/manufacturers': { name: 'Alvi' },
    'POST /app/medical-purchase-orders': {
      supplier_id: references.supplierId,
      items: [{ medicine_id: references.medicineId, quantity: 2, rate: 100 }],
    },
    'POST /app/medical-reps': { name: 'Rakesh' },
    'POST /app/medical-sales': {
      branch_id: references.branchId,
      contact_id: references.contactId,
      items: [{ medicine_id: references.medicineId, quantity: 1 }],
    },
    'POST /app/medicines': { name: 'Quickmed', is_quick: true },
    'POST /app/medicines/near-expiry-discount': { expiring_within_days: 90, discount_percent: 20 },
    'POST /app/memberships/me/saved-views': { list_key: 'leads', label: 'Hot', filters: {} },
    'POST /app/offering-groups': { name: 'Peels' },
    'POST /app/offerings': { name: 'Consultation', price: 500 },
    'POST /app/offers': {
      name: 'Glow week',
      value: 10,
      offering_ids: [references.offeringId],
      starts_on: references.yesterday,
      ends_on: references.laterDay,
    },
    'POST /app/patient-diagnoses': { name: 'Acne' },
    'POST /app/patients': { contact_id: references.contactId, home_branch_id: references.branchId },
    'POST /app/payments': {
      kind: 'receipt',
      branch_id: references.branchId,
      contact_id: references.contactId,
      splits,
    },
    'POST /app/pending-credits': {
      direction: 'give',
      amount: 100,
      reason: 'Advance to return',
      contact_id: references.contactId,
      settle_by: references.tomorrow,
    },
    'POST /app/prescription-kits': { name: 'Acne kit', items: [medicineLine] },
    'POST /app/stock-counts': {
      lines: [{ stock_item_id: references.stockItemId, counted_quantity: 1 }],
    },
    'POST /app/stock-items': { name: 'Gauze' },
    'POST /app/stock-purchases': {
      stock_vendor_id: references.stockVendorId,
      items: [{ stock_item_id: references.stockItemId, quantity: 1, rate: 10 }],
    },
    'POST /app/stock-vendors': { name: 'Skin Supplies' },
    'POST /app/supplier-credits': {
      medicine_batch_id: references.medicineBatchId,
      supplier_id: references.supplierId,
      quantity: 1,
    },
    'POST /app/suppliers': { name: 'Shree Agency' },
    'POST /app/tasks': {
      title: 'Call the lab',
      due_at: new Date(Date.now() + 3_600_000).toISOString(),
      owner_role: 'front_desk',
    },
    'PUT /app/task-rule-settings': {
      rules: [{ rule_key: 'reply', is_on: true, is_automatic: false }],
    },
    // Changes.
    'PATCH /app/appointments/:appointment_id': { notes: 'Changed' },
    'PATCH /app/branches/:branch_id': { name: 'Renamed' },
    'PATCH /app/branches/:branch_id/holidays/:branch_holiday_id': { label: 'Renamed' },
    'PATCH /app/branches/:branch_id/machines/:branch_machine_id': { name: 'Renamed' },
    'PATCH /app/branches/:branch_id/rooms/:branch_room_id': { name: 'Renamed' },
    'PATCH /app/contact-message-templates/:contact_message_template_id': { body: 'Hello' },
    'PATCH /app/contacts/:contact_id': { has_marketing_consent: true },
    'PATCH /app/invoices/:invoice_id': { remark: 'Changed' },
    'PATCH /app/leads/:lead_id': { status: 'lost' },
    'PATCH /app/manufacturers/:manufacturer_id': { tone: 'mint' },
    'PATCH /app/medical-purchase-orders/:medical_purchase_order_id': {
      supplier_bill_number: 'X-1',
    },
    'PATCH /app/medical-reps/:medical_rep_id': { name: 'Renamed' },
    'PATCH /app/medicines/:medicine_id': { mrp: 99 },
    'PATCH /app/memberships/me/preferences': { theme: 'dark' },
    'PATCH /app/memberships/me/saved-views/:membership_saved_view_id': { label: 'Renamed' },
    'PATCH /app/offering-groups/:offering_group_id': { sort_order: 5 },
    'PATCH /app/offerings/:offering_id': { price: 900 },
    'PATCH /app/offers/:offer_id': { is_active: false },
    'PATCH /app/patient-diagnoses/:patient_diagnosis_id': { name: 'Renamed' },
    'PATCH /app/patients/:patient_id': { status: 'regular' },
    'PATCH /app/patients/:patient_id/check-ins/:patient_check_in_id': { score: 2 },
    'PATCH /app/patients/:patient_id/images/:patient_image_id': { caption: 'Changed' },
    'PATCH /app/patients/:patient_id/offering-suggestions/:patient_offering_suggestion_id': {
      status: 'declined',
    },
    'PATCH /app/patients/:patient_id/offerings/:patient_offering_id': { sessions_total: 4 },
    'PATCH /app/patients/:patient_id/prescriptions/:patient_prescription_id': {
      advice: 'Changed',
    },
    'PATCH /app/patients/:patient_id/reports/:patient_report_id': { notes: 'Changed' },
    'PATCH /app/patients/:patient_id/reviews/:patient_review_id': { rating: 1 },
    'PATCH /app/patients/:patient_id/treatments/:patient_treatment_id': { remark: 'Changed' },
    'PATCH /app/payments/:payment_id': { splits },
    'PATCH /app/pending-credits/:pending_credit_id': { amount: 50 },
    'PATCH /app/prescription-kits/:prescription_kit_id': { name: 'Renamed' },
    'PATCH /app/stock-items/:stock_item_id': { min_quantity: 6 },
    'PATCH /app/stock-purchases/:stock_purchase_id': { bill_number: 'X-1' },
    'PATCH /app/stock-vendors/:stock_vendor_id': { phone: null },
    'PATCH /app/suppliers/:supplier_id': { phone: null },
    'PATCH /app/tasks/:task_id': { priority: 'high' },
    'PUT /app/branches/:branch_id/members': { membership_ids: [references.membershipId] },
    'PUT /app/contacts/:contact_id/members': { membership_ids: [references.membershipId] },
    // Actions and nested creates.
    'POST /app/appointments/:appointment_id/cancel': { cancel_reason: 'patient_asked' },
    'POST /app/appointments/:appointment_id/copy': {
      appointment_date: references.laterDay,
      start_time: '10:00',
    },
    'POST /app/appointments/:appointment_id/stage': { visit_stage: 'with_doctor' },
    'POST /app/branches/:branch_id/holidays': {
      holiday_date: references.laterDay,
      label: 'Festival',
    },
    'POST /app/branches/:branch_id/machines': { name: 'Laser' },
    'POST /app/branches/:branch_id/rooms': { name: 'Room' },
    'POST /app/contacts/:contact_id/activities/add-note': { body: 'Note' },
    'POST /app/contacts/:contact_id/activities/log-call': { direction: 'sent', body: 'Called' },
    'POST /app/contacts/:contact_id/activities/send-message': { type: 'whatsapp', body: 'Hi' },
    'POST /app/day-closes/:day_close_id/close': { counted_cash: 0 },
    'POST /app/day-closes/:day_close_id/reopen': { reason: 'Recount' },
    'POST /app/invoices/:invoice_id/credit-notes': { amount: 1, reason: 'Refund', splits },
    'POST /app/medical-purchase-orders/:medical_purchase_order_id/receive': {},
    'POST /app/medical-reps/:medical_rep_id/visits': { samples: 'Brochure' },
    'POST /app/medical-sales/:medical_sale_id/returns': {
      items: [{ invoice_item_id: references.invoiceItemId, quantity: 1 }],
      reason: 'unused',
      refund_mode: 'cash',
    },
    'POST /app/patients/:patient_id/check-ins': { feel: 'better', score: 8 },
    'POST /app/patients/:patient_id/check-ins/:patient_check_in_id/actions': {
      action: 'doctor_called',
    },
    'POST /app/patients/:patient_id/clinical-notes': { kind: 'complaint', text: 'Note' },
    'POST /app/patients/:patient_id/images': {
      file_key: references.uploadKey,
      album: 'lhr',
      body_part: 'full_body',
    },
    'POST /app/patients/:patient_id/offering-suggestions': {
      offering_id: references.offeringId,
      quantity: 1,
    },
    'POST /app/patients/:patient_id/prescriptions': {
      doctor_membership_id: references.doctorMembershipId,
      prescription_date: references.today,
      items: [],
    },
    'POST /app/patients/:patient_id/reports': {
      name: 'CBC',
      report_date: references.today,
      file_keys: [references.uploadKey],
    },
    'POST /app/patients/:patient_id/reviews': { source: 'google', rating: 5 },
    'POST /app/patients/:patient_id/reviews/:patient_review_id/actions': {
      action: 'replied_google',
    },
    'POST /app/patients/:patient_id/treatments': { name: 'Peel' },
    'POST /app/patients/:patient_id/treatments/:patient_treatment_id/reverse': {
      reason: 'Wrong patient',
    },
    'POST /app/payments/:payment_id/reverse': { reason: 'Wrong patient' },
    'POST /app/pending-credits/:pending_credit_id/settle': {
      amount: 1,
      method: 'money',
      branch_id: references.branchId,
      splits,
    },
    'POST /app/stock-items/:stock_item_id/movements': { type: 'used', quantity: 1 },
    'POST /app/stock-items/:stock_item_id/movements/:stock_item_movement_id/revert': {
      reason: 'mistake',
    },
    'POST /app/suppliers/:supplier_id/payments': { branch_id: references.branchId, splits },
    'POST /app/tasks/:task_id/reassign': { owner_role: 'front_desk' },
    'POST /app/tasks/:task_id/resolve': { outcome: 'done' },
    'POST /app/tasks/:task_id/snooze': {
      snoozed_until: new Date(Date.now() + 86_400_000).toISOString(),
    },
    // The tenancy team writes (§2).
    'POST /tenancy/organization/memberships': {
      email: 'matrix-member@example.test',
      role_ids: [references.roleId],
    },
    'PATCH /tenancy/organization/memberships/:membership_id': { status: 'active' },
    'POST /tenancy/organization/memberships/:membership_id/invitation/resend': {
      expires_in_days: 7,
    },
  };
  return bodies[`${method} ${path}`];
}

/** The reason query a route's `DELETE` takes (`?reason=…`), `''` for one that takes none. */
export function appRouteDeleteQuery(path: string): string {
  if (path.startsWith('/app/medical-purchase-orders/')) return '?reason=supplier_cant_deliver';
  if (path.startsWith('/app/medical-sales/')) return '?reason=customer_changed_mind';
  if (path.endsWith('/invitation')) return '';
  if (path.startsWith('/app/') || /^\/tenancy\/organization\/(memberships|roles)\//.test(path)) {
    return '?reason=mistake';
  }
  return '';
}

/** The query a `GET` needs to pass its schema (`?…`), `''` when it needs none. */
export function appRouteGetQuery(options: {
  path: string;
  references: AppRouteReferences;
}): string {
  const { path, references } = options;
  if (path === '/app/appointments/daily-counts') {
    return `?date_from=${references.today}&date_to=${references.laterDay}`;
  }
  if (path === '/app/appointments/slots') {
    return `?branch_id=${references.branchId}&appointment_date=${references.laterDay}&duration_minutes=30`;
  }
  return '';
}

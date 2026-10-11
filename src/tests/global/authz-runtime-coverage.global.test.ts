import { describe, it, expect } from 'vitest';
import { loadRouteAuthorizationModel } from '@/tests/helpers/route-authorization-model.js';

/**
 * Structural parity between the authorization model and the reviewed attack-test map.
 *
 * Every modeled route must have a descriptive mapping below, with no orphan entries.
 * These labels document the intended security scenarios. This gate does not resolve
 * labels to test declarations, execute attacker requests, or prove that mapped tests
 * still exist. Observed authorization coverage must come from the security test run.
 */
const RUNTIME_COVERAGE: Readonly<Record<string, string>> = {
  // ── model: user — cross-user BOLA (object-ownership.security.test.ts) ──────
  'DELETE /api/v1/auth/me/auth-methods/:auth_method_id':
    'object-ownership: auth methods (step-up gated)',
  'DELETE /api/v1/auth/me/sessions/:session_id': 'object-ownership: sessions (step-up gated)',
  'DELETE /api/v1/auth/me/mfa/:mfa_method_id': 'object-ownership: MFA methods (step-up gated)',
  'DELETE /api/v1/auth/me/webauthn/credentials/:credential_id':
    'object-ownership: WebAuthn passkeys (step-up gated)',
  'DELETE /api/v1/notify/notifications/:notification_id': 'object-ownership: notifications',
  'GET /api/v1/notify/notifications/:notification_id': 'object-ownership: notifications',
  'PATCH /api/v1/notify/notifications/:notification_id/read': 'object-ownership: notifications',
  'GET /api/v1/uploads/:upload_id': 'object-ownership: uploads',
  'DELETE /api/v1/uploads/:upload_id': 'object-ownership: uploads',
  'POST /api/v1/uploads/:upload_id/confirm': 'object-ownership: uploads',
  'GET /api/v1/users/me/data-export/:data_export_id': 'object-ownership: data exports',
  'GET /api/v1/app/memberships/me/saved-views/:membership_saved_view_id':
    "object-ownership: saved views (the member's own)",
  'PATCH /api/v1/app/memberships/me/saved-views/:membership_saved_view_id':
    "object-ownership: saved views (the member's own)",
  'DELETE /api/v1/app/memberships/me/saved-views/:membership_saved_view_id':
    "object-ownership: saved views (the member's own)",

  // ── model: organization — cross-organization reads (cross-organization-resource.security.test.ts) ─────
  'GET /api/v1/billing/subscriptions/:subscription_id':
    'object-ownership: subscriptions (cross-organization)',
  'GET /api/v1/billing/subscriptions/:subscription_id/payment-setup':
    'object-ownership: subscription payment-setup (cross-organization)',
  'GET /api/v1/notify/webhooks/:webhook_id': 'cross-organization-resource: webhook',
  'GET /api/v1/notify/webhooks/:webhook_id/delivery-attempts':
    'cross-organization-resource: webhook delivery-attempts',
  'GET /api/v1/tenancy/organization/api-keys/:api_key_id': 'cross-organization-resource: API key',
  'GET /api/v1/tenancy/organization/memberships/:membership_id':
    'cross-organization-resource: membership',
  'GET /api/v1/tenancy/organization/memberships/:membership_id/permissions':
    'cross-organization-resource: membership permissions',
  'GET /api/v1/tenancy/organization/notification-policies/:notification_policy_id':
    'cross-organization-resource: notification policy',
  'GET /api/v1/tenancy/organization/roles/:role_id': 'cross-organization-resource: role',
  'GET /api/v1/tenancy/organization/roles/:role_id/permissions':
    'cross-organization-resource: role permissions',
  'GET /api/v1/tenancy/organizations/by-slug/:slug':
    'cross-organization-resource: organization by-slug',

  // ── model: organization — cross-organization writes (cross-organization-mutation.security.test.ts) ────
  'POST /api/v1/billing/subscriptions/:subscription_id/cancel':
    'cross-organization-mutation: subscription cancel',
  'POST /api/v1/billing/subscriptions/:subscription_id/change-plan':
    'cross-organization-mutation: subscription change-plan',
  'POST /api/v1/billing/subscriptions/:subscription_id/resume':
    'cross-organization-mutation: subscription resume',
  'PATCH /api/v1/notify/webhooks/:webhook_id': 'cross-organization-mutation: webhook PATCH',
  'POST /api/v1/notify/webhooks/:webhook_id/test': 'cross-organization-mutation: webhook test',
  'PATCH /api/v1/tenancy/organization/api-keys/:api_key_id':
    'cross-organization-mutation: API key PATCH',
  'DELETE /api/v1/tenancy/organization/api-keys/:api_key_id':
    'cross-organization-mutation: API key DELETE',
  'POST /api/v1/tenancy/organization/api-keys/:api_key_id/rotate':
    'cross-organization-mutation: API key rotate',
  'DELETE /api/v1/notify/webhooks/:webhook_id': 'cross-organization-mutation: webhook DELETE',
  'PATCH /api/v1/tenancy/organization/notification-policies/:notification_policy_id':
    'cross-organization-mutation: notification policy PATCH',
  'DELETE /api/v1/tenancy/organization/notification-policies/:notification_policy_id':
    'cross-organization-mutation: notification policy DELETE',
  'PATCH /api/v1/tenancy/organization/roles/:role_id': 'cross-organization-mutation: role PATCH',
  'DELETE /api/v1/tenancy/organization/roles/:role_id': 'cross-organization-mutation: role DELETE',
  'POST /api/v1/tenancy/organization/roles/:role_id/restore':
    'cross-organization-mutation: role restore',
  'DELETE /api/v1/tenancy/organization/memberships/:membership_id/invitation':
    'cross-organization-mutation: invitation DELETE',
  'POST /api/v1/tenancy/organization/memberships/:membership_id/invitation/resend':
    'cross-organization-mutation: invitation resend',

  // ── model: tier:owner (tier-and-grant.security.test.ts) ────────────────────
  'POST /api/v1/tenancy/organization/transfer-ownership':
    'tier-and-grant: non-owner transfer-ownership → 403',
  'POST /api/v1/tenancy/organization/leave': 'tier-and-grant: owner cannot leave → 403',
  'PATCH /api/v1/tenancy/organization/memberships/:membership_id':
    "tier-and-grant: cannot modify owner's membership → 403",
  'DELETE /api/v1/tenancy/organization/memberships/:membership_id':
    "tier-and-grant: cannot remove owner's membership → 403",
  'POST /api/v1/tenancy/organization/memberships/:membership_id/restore':
    'cross-organization-resource: membership restore',

  // ── model: grant (tier-and-grant.security.test.ts) ─────────────────────────
  'PUT /api/v1/tenancy/organization/roles/:role_id/permissions':
    'tier-and-grant: cannot grant un-held permission → 403',

  // ── model: email (invitation-email.security.test.ts) ───────────────────────
  'POST /api/v1/tenancy/membership-invitations/:membership_invitation_id/accept':
    'invitation-email: email-mismatch accept → 403',
  'POST /api/v1/tenancy/membership-invitations/:membership_invitation_id/decline':
    'invitation-email: email-mismatch decline → 403',

  // ── model: global-role (admin-only.security.test.ts) ───────────────────────
  'GET /api/v1/users/:user_id': 'admin-only: regular user denied',
  'PATCH /api/v1/users/:user_id': 'admin-only: regular user denied',
  'DELETE /api/v1/users/:user_id': 'admin-only: regular user denied',
  'POST /api/v1/users/:user_id/suspend': 'admin-only: regular user denied',
  'POST /api/v1/users/:user_id/unsuspend': 'admin-only: regular user denied',

  // ── model: organization — app records, cross-organization reads and writes
  //    (app-cross-organization.security.test.ts) ─────────────────────────────
  'GET /api/v1/app/branches/:branch_id': 'app-cross-organization: branches',
  'PATCH /api/v1/app/branches/:branch_id': 'app-cross-organization: branches',
  'GET /api/v1/app/branches/:branch_id/members': 'app-cross-organization: branches',
  'PUT /api/v1/app/branches/:branch_id/members': 'app-cross-organization: branches',
  'GET /api/v1/app/offering-groups/:offering_group_id': 'app-cross-organization: offering-groups',
  'PATCH /api/v1/app/offering-groups/:offering_group_id': 'app-cross-organization: offering-groups',
  'DELETE /api/v1/app/offering-groups/:offering_group_id':
    'app-cross-organization: offering-groups',
  'POST /api/v1/app/offering-groups/:offering_group_id/restore':
    'app-cross-organization: offering-groups',
  'GET /api/v1/app/branches/:branch_id/rooms': 'app-cross-organization: branches',
  'POST /api/v1/app/branches/:branch_id/rooms': 'app-cross-organization: branches',
  'GET /api/v1/app/branches/:branch_id/rooms/:branch_room_id': 'app-cross-organization: branches',
  'PATCH /api/v1/app/branches/:branch_id/rooms/:branch_room_id': 'app-cross-organization: branches',
  'DELETE /api/v1/app/branches/:branch_id/rooms/:branch_room_id':
    'app-cross-organization: branches',
  'POST /api/v1/app/branches/:branch_id/rooms/:branch_room_id/restore':
    'app-cross-organization: branches',
  'GET /api/v1/app/branches/:branch_id/machines': 'app-cross-organization: branches',
  'POST /api/v1/app/branches/:branch_id/machines': 'app-cross-organization: branches',
  'GET /api/v1/app/branches/:branch_id/machines/:branch_machine_id':
    'app-cross-organization: branches',
  'PATCH /api/v1/app/branches/:branch_id/machines/:branch_machine_id':
    'app-cross-organization: branches',
  'DELETE /api/v1/app/branches/:branch_id/machines/:branch_machine_id':
    'app-cross-organization: branches',
  'POST /api/v1/app/branches/:branch_id/machines/:branch_machine_id/restore':
    'app-cross-organization: branches',
  'GET /api/v1/app/branches/:branch_id/holidays/:branch_holiday_id':
    'app-cross-organization: branches',
  'PATCH /api/v1/app/branches/:branch_id/holidays/:branch_holiday_id':
    'app-cross-organization: branches',
  'DELETE /api/v1/app/branches/:branch_id/holidays/:branch_holiday_id':
    'app-cross-organization: branches',
  'POST /api/v1/app/branches/:branch_id/holidays/:branch_holiday_id/restore':
    'app-cross-organization: branches',
  'GET /api/v1/app/offerings/:offering_id': 'app-cross-organization: offerings',
  'PATCH /api/v1/app/offerings/:offering_id': 'app-cross-organization: offerings',
  'DELETE /api/v1/app/offerings/:offering_id': 'app-cross-organization: offerings',
  'POST /api/v1/app/offerings/:offering_id/restore': 'app-cross-organization: offerings',
  'GET /api/v1/app/offers/:offer_id': 'app-cross-organization: offers',
  'PATCH /api/v1/app/offers/:offer_id': 'app-cross-organization: offers',
  'DELETE /api/v1/app/offers/:offer_id': 'app-cross-organization: offers',
  'POST /api/v1/app/offers/:offer_id/restore': 'app-cross-organization: offers',
  'GET /api/v1/app/branches/:branch_id/holidays': 'app-cross-organization: branches',
  'POST /api/v1/app/branches/:branch_id/holidays': 'app-cross-organization: branches',
  'GET /api/v1/app/patients/:patient_id': 'app-cross-organization: patients',
  'PATCH /api/v1/app/patients/:patient_id': 'app-cross-organization: patients',
  'DELETE /api/v1/app/patients/:patient_id': 'app-cross-organization: patients',
  'POST /api/v1/app/patients/:patient_id/restore': 'app-cross-organization: patients',
  'GET /api/v1/app/leads/:lead_id': 'app-cross-organization: leads',
  'PATCH /api/v1/app/leads/:lead_id': 'app-cross-organization: leads',
  'DELETE /api/v1/app/leads/:lead_id': 'app-cross-organization: leads',
  'POST /api/v1/app/leads/:lead_id/restore': 'app-cross-organization: leads',
  'GET /api/v1/app/appointments/:appointment_id': 'app-cross-organization: appointments',
  'PATCH /api/v1/app/appointments/:appointment_id': 'app-cross-organization: appointments',
  'POST /api/v1/app/appointments/:appointment_id/cancel': 'app-cross-organization: appointments',
  'POST /api/v1/app/appointments/:appointment_id/reinstate': 'app-cross-organization: appointments',
  'POST /api/v1/app/appointments/:appointment_id/undo-check-in':
    'app-cross-organization: appointments',
  'DELETE /api/v1/app/appointments/:appointment_id': 'app-cross-organization: appointments',
  'POST /api/v1/app/appointments/:appointment_id/restore': 'app-cross-organization: appointments',
  'GET /api/v1/app/patients/:patient_id/clinical-notes': 'app-cross-organization: patients',
  'POST /api/v1/app/patients/:patient_id/clinical-notes': 'app-cross-organization: patients',
  'GET /api/v1/app/patients/:patient_id/prescriptions': 'app-cross-organization: patients',
  'POST /api/v1/app/patients/:patient_id/prescriptions': 'app-cross-organization: patients',
  'GET /api/v1/app/prescription-kits/:prescription_kit_id':
    'app-cross-organization: prescription-kits',
  'PATCH /api/v1/app/prescription-kits/:prescription_kit_id':
    'app-cross-organization: prescription-kits',
  'DELETE /api/v1/app/prescription-kits/:prescription_kit_id':
    'app-cross-organization: prescription-kits',
  'POST /api/v1/app/prescription-kits/:prescription_kit_id/restore':
    'app-cross-organization: prescription-kits',
  'GET /api/v1/app/patients/:patient_id/images': 'app-cross-organization: patients',
  'POST /api/v1/app/patients/:patient_id/images': 'app-cross-organization: patients',
  'GET /api/v1/app/patients/:patient_id/reports': 'app-cross-organization: patients',
  'POST /api/v1/app/patients/:patient_id/reports': 'app-cross-organization: patients',
  'GET /api/v1/app/invoices/:invoice_id': 'app-cross-organization: invoices',
  'PATCH /api/v1/app/invoices/:invoice_id': 'app-cross-organization: invoices',
  'DELETE /api/v1/app/invoices/:invoice_id': 'app-cross-organization: invoices',
  'POST /api/v1/app/invoices/:invoice_id/restore': 'app-cross-organization: invoices',
  'GET /api/v1/app/patients/:patient_id/offering-ideas': 'app-cross-organization: patients',
  'GET /api/v1/app/patients/:patient_id/offering-suggestions': 'app-cross-organization: patients',
  'POST /api/v1/app/patients/:patient_id/offering-suggestions': 'app-cross-organization: patients',
  'GET /api/v1/app/payments/:payment_id': 'app-cross-organization: payments',
  'PATCH /api/v1/app/payments/:payment_id': 'app-cross-organization: payments',
  'DELETE /api/v1/app/payments/:payment_id': 'app-cross-organization: payments',
  'POST /api/v1/app/payments/:payment_id/restore': 'app-cross-organization: payments',
  'GET /api/v1/app/pending-credits/:pending_credit_id': 'app-cross-organization: pending-credits',
  'PATCH /api/v1/app/pending-credits/:pending_credit_id': 'app-cross-organization: pending-credits',
  'DELETE /api/v1/app/pending-credits/:pending_credit_id':
    'app-cross-organization: pending-credits',
  'POST /api/v1/app/pending-credits/:pending_credit_id/restore':
    'app-cross-organization: pending-credits',
  'GET /api/v1/app/day-closes/:day_close_id': 'app-cross-organization: day-closes',
  'POST /api/v1/app/day-closes/:day_close_id/close': 'app-cross-organization: day-closes',
  'POST /api/v1/app/day-closes/:day_close_id/reopen': 'app-cross-organization: day-closes',
  'GET /api/v1/app/patients/:patient_id/treatments': 'app-cross-organization: patients',
  'POST /api/v1/app/patients/:patient_id/treatments': 'app-cross-organization: patients',
  'GET /api/v1/app/patients/:patient_id/check-ins': 'app-cross-organization: patients',
  'POST /api/v1/app/patients/:patient_id/check-ins': 'app-cross-organization: patients',
  'GET /api/v1/app/patients/:patient_id/reviews': 'app-cross-organization: patients',
  'POST /api/v1/app/patients/:patient_id/reviews': 'app-cross-organization: patients',
  'GET /api/v1/app/manufacturers/:manufacturer_id': 'app-cross-organization: manufacturers',
  'PATCH /api/v1/app/manufacturers/:manufacturer_id': 'app-cross-organization: manufacturers',
  'DELETE /api/v1/app/manufacturers/:manufacturer_id': 'app-cross-organization: manufacturers',
  'POST /api/v1/app/manufacturers/:manufacturer_id/restore':
    'app-cross-organization: manufacturers',
  'GET /api/v1/app/suppliers/:supplier_id': 'app-cross-organization: suppliers',
  'PATCH /api/v1/app/suppliers/:supplier_id': 'app-cross-organization: suppliers',
  'DELETE /api/v1/app/suppliers/:supplier_id': 'app-cross-organization: suppliers',
  'POST /api/v1/app/suppliers/:supplier_id/restore': 'app-cross-organization: suppliers',
  'GET /api/v1/app/medical-reps/:medical_rep_id': 'app-cross-organization: medical-reps',
  'PATCH /api/v1/app/medical-reps/:medical_rep_id': 'app-cross-organization: medical-reps',
  'DELETE /api/v1/app/medical-reps/:medical_rep_id': 'app-cross-organization: medical-reps',
  'POST /api/v1/app/medical-reps/:medical_rep_id/restore': 'app-cross-organization: medical-reps',
  'GET /api/v1/app/medical-reps/:medical_rep_id/visits': 'app-cross-organization: medical-reps',
  'POST /api/v1/app/medical-reps/:medical_rep_id/visits': 'app-cross-organization: medical-reps',
  'GET /api/v1/app/medicines/:medicine_id': 'app-cross-organization: medicines',
  'PATCH /api/v1/app/medicines/:medicine_id': 'app-cross-organization: medicines',
  'DELETE /api/v1/app/medicines/:medicine_id': 'app-cross-organization: medicines',
  'POST /api/v1/app/medicines/:medicine_id/restore': 'app-cross-organization: medicines',
  'GET /api/v1/app/medical-purchase-orders/:medical_purchase_order_id':
    'app-cross-organization: medical-purchase-orders',
  'PATCH /api/v1/app/medical-purchase-orders/:medical_purchase_order_id':
    'app-cross-organization: medical-purchase-orders',
  'POST /api/v1/app/medical-purchase-orders/:medical_purchase_order_id/receive':
    'app-cross-organization: medical-purchase-orders',
  'DELETE /api/v1/app/medical-purchase-orders/:medical_purchase_order_id':
    'app-cross-organization: medical-purchase-orders',
  'POST /api/v1/app/medical-purchase-orders/:medical_purchase_order_id/restore':
    'app-cross-organization: medical-purchase-orders',
  'GET /api/v1/app/medical-sales/:medical_sale_id': 'app-cross-organization: medical-sales',
  'DELETE /api/v1/app/medical-sales/:medical_sale_id': 'app-cross-organization: medical-sales',
  'POST /api/v1/app/medical-sales/:medical_sale_id/restore':
    'app-cross-organization: medical-sales',
  'GET /api/v1/app/supplier-credits/:supplier_credit_id':
    'app-cross-organization: supplier-credits',
  'GET /api/v1/app/stock-vendors/:stock_vendor_id': 'app-cross-organization: stock-vendors',
  'PATCH /api/v1/app/stock-vendors/:stock_vendor_id': 'app-cross-organization: stock-vendors',
  'DELETE /api/v1/app/stock-vendors/:stock_vendor_id': 'app-cross-organization: stock-vendors',
  'POST /api/v1/app/stock-vendors/:stock_vendor_id/restore':
    'app-cross-organization: stock-vendors',
  'GET /api/v1/app/stock-items/:stock_item_id': 'app-cross-organization: stock-items',
  'PATCH /api/v1/app/stock-items/:stock_item_id': 'app-cross-organization: stock-items',
  'DELETE /api/v1/app/stock-items/:stock_item_id': 'app-cross-organization: stock-items',
  'POST /api/v1/app/stock-items/:stock_item_id/restore': 'app-cross-organization: stock-items',
  'GET /api/v1/app/stock-purchases/:stock_purchase_id': 'app-cross-organization: stock-purchases',
  'PATCH /api/v1/app/stock-purchases/:stock_purchase_id': 'app-cross-organization: stock-purchases',
  'DELETE /api/v1/app/stock-purchases/:stock_purchase_id':
    'app-cross-organization: stock-purchases',
  'POST /api/v1/app/stock-purchases/:stock_purchase_id/restore':
    'app-cross-organization: stock-purchases',
  'GET /api/v1/app/stock-counts/:stock_count_id': 'app-cross-organization: stock-counts',
  'GET /api/v1/app/tasks/:task_id': 'app-cross-organization: tasks',
  'PATCH /api/v1/app/tasks/:task_id': 'app-cross-organization: tasks',
  'POST /api/v1/app/tasks/:task_id/resolve': 'app-cross-organization: tasks',
  'POST /api/v1/app/tasks/:task_id/snooze': 'app-cross-organization: tasks',
  'DELETE /api/v1/app/tasks/:task_id': 'app-cross-organization: tasks',
  'POST /api/v1/app/tasks/:task_id/restore': 'app-cross-organization: tasks',
  'POST /api/v1/app/leads/:lead_id/claim': 'app-cross-organization: leads',
  'POST /api/v1/app/leads/:lead_id/release': 'app-cross-organization: leads',
  'POST /api/v1/app/appointments/:appointment_id/copy': 'app-cross-organization: appointments',
  'GET /api/v1/app/contact-message-templates/:contact_message_template_id':
    'app-cross-organization: contact-message-templates',
  'PATCH /api/v1/app/contact-message-templates/:contact_message_template_id':
    'app-cross-organization: contact-message-templates',
  'DELETE /api/v1/app/contact-message-templates/:contact_message_template_id':
    'app-cross-organization: contact-message-templates',
  'POST /api/v1/app/contact-message-templates/:contact_message_template_id/restore':
    'app-cross-organization: contact-message-templates',
  'GET /api/v1/app/contacts/:contact_id': 'app-cross-organization: contacts',
  'PATCH /api/v1/app/contacts/:contact_id': 'app-cross-organization: contacts',
  'DELETE /api/v1/app/contacts/:contact_id': 'app-cross-organization: contacts',
  'GET /api/v1/app/contacts/:contact_id/activities': 'app-cross-organization: contacts',
  'GET /api/v1/app/contacts/:contact_id/activities/:contact_activity_id':
    'app-cross-organization: contacts',
  'POST /api/v1/app/contacts/:contact_id/activities/:contact_activity_id/resend':
    'app-cross-organization: contacts',
  'POST /api/v1/app/contacts/:contact_id/activities/add-note': 'app-cross-organization: contacts',
  'POST /api/v1/app/contacts/:contact_id/activities/log-call': 'app-cross-organization: contacts',
  'POST /api/v1/app/contacts/:contact_id/activities/send-message':
    'app-cross-organization: contacts',
  'GET /api/v1/app/contacts/:contact_id/members': 'app-cross-organization: contacts',
  'PUT /api/v1/app/contacts/:contact_id/members': 'app-cross-organization: contacts',
  'GET /api/v1/app/contacts/:contact_id/preview': 'app-cross-organization: contacts',
  'POST /api/v1/app/contacts/:contact_id/restore': 'app-cross-organization: contacts',
  'POST /api/v1/app/appointments/:appointment_id/check-in': 'app-cross-organization: appointments',
  'POST /api/v1/app/appointments/:appointment_id/complete': 'app-cross-organization: appointments',
  'POST /api/v1/app/appointments/:appointment_id/confirm': 'app-cross-organization: appointments',
  'POST /api/v1/app/appointments/:appointment_id/no-show': 'app-cross-organization: appointments',
  'POST /api/v1/app/appointments/:appointment_id/pause': 'app-cross-organization: appointments',
  'POST /api/v1/app/appointments/:appointment_id/resume': 'app-cross-organization: appointments',
  'POST /api/v1/app/appointments/:appointment_id/stage': 'app-cross-organization: appointments',
  'GET /api/v1/app/patient-diagnoses/:patient_diagnosis_id':
    'app-cross-organization: patient-diagnoses',
  'PATCH /api/v1/app/patient-diagnoses/:patient_diagnosis_id':
    'app-cross-organization: patient-diagnoses',
  'DELETE /api/v1/app/patient-diagnoses/:patient_diagnosis_id':
    'app-cross-organization: patient-diagnoses',
  'POST /api/v1/app/patient-diagnoses/:patient_diagnosis_id/restore':
    'app-cross-organization: patient-diagnoses',
  'GET /api/v1/app/patients/:patient_id/clinical-notes/:patient_clinical_note_id':
    'app-cross-organization: patients',
  'DELETE /api/v1/app/patients/:patient_id/clinical-notes/:patient_clinical_note_id':
    'app-cross-organization: patients',
  'POST /api/v1/app/patients/:patient_id/clinical-notes/:patient_clinical_note_id/restore':
    'app-cross-organization: patients',
  'GET /api/v1/app/patients/:patient_id/images/:patient_image_id':
    'app-cross-organization: patients',
  'PATCH /api/v1/app/patients/:patient_id/images/:patient_image_id':
    'app-cross-organization: patients',
  'DELETE /api/v1/app/patients/:patient_id/images/:patient_image_id':
    'app-cross-organization: patients',
  'POST /api/v1/app/patients/:patient_id/images/:patient_image_id/restore':
    'app-cross-organization: patients',
  'GET /api/v1/app/patients/:patient_id/prescriptions/:patient_prescription_id':
    'app-cross-organization: patients',
  'PATCH /api/v1/app/patients/:patient_id/prescriptions/:patient_prescription_id':
    'app-cross-organization: patients',
  'DELETE /api/v1/app/patients/:patient_id/prescriptions/:patient_prescription_id':
    'app-cross-organization: patients',
  'POST /api/v1/app/patients/:patient_id/prescriptions/:patient_prescription_id/approve':
    'app-cross-organization: patients',
  'POST /api/v1/app/patients/:patient_id/prescriptions/:patient_prescription_id/restore':
    'app-cross-organization: patients',
  'GET /api/v1/app/patients/:patient_id/reports/:patient_report_id':
    'app-cross-organization: patients',
  'PATCH /api/v1/app/patients/:patient_id/reports/:patient_report_id':
    'app-cross-organization: patients',
  'DELETE /api/v1/app/patients/:patient_id/reports/:patient_report_id':
    'app-cross-organization: patients',
  'POST /api/v1/app/patients/:patient_id/reports/:patient_report_id/restore':
    'app-cross-organization: patients',
  'GET /api/v1/app/patients/:patient_id/check-ins/:patient_check_in_id':
    'app-cross-organization: patients',
  'PATCH /api/v1/app/patients/:patient_id/check-ins/:patient_check_in_id':
    'app-cross-organization: patients',
  'DELETE /api/v1/app/patients/:patient_id/check-ins/:patient_check_in_id':
    'app-cross-organization: patients',
  'POST /api/v1/app/patients/:patient_id/check-ins/:patient_check_in_id/actions':
    'app-cross-organization: patients',
  'POST /api/v1/app/patients/:patient_id/check-ins/:patient_check_in_id/restore':
    'app-cross-organization: patients',
  'GET /api/v1/app/patients/:patient_id/reviews/:patient_review_id':
    'app-cross-organization: patients',
  'PATCH /api/v1/app/patients/:patient_id/reviews/:patient_review_id':
    'app-cross-organization: patients',
  'DELETE /api/v1/app/patients/:patient_id/reviews/:patient_review_id':
    'app-cross-organization: patients',
  'POST /api/v1/app/patients/:patient_id/reviews/:patient_review_id/actions':
    'app-cross-organization: patients',
  'POST /api/v1/app/patients/:patient_id/reviews/:patient_review_id/restore':
    'app-cross-organization: patients',
  'GET /api/v1/app/patients/:patient_id/treatments/:patient_treatment_id':
    'app-cross-organization: patients',
  'PATCH /api/v1/app/patients/:patient_id/treatments/:patient_treatment_id':
    'app-cross-organization: patients',
  'POST /api/v1/app/patients/:patient_id/treatments/:patient_treatment_id/reverse':
    'app-cross-organization: patients',
  'GET /api/v1/app/patients/:patient_id/offering-suggestions/:patient_offering_suggestion_id':
    'app-cross-organization: patients',
  'PATCH /api/v1/app/patients/:patient_id/offering-suggestions/:patient_offering_suggestion_id':
    'app-cross-organization: patients',
  'DELETE /api/v1/app/patients/:patient_id/offering-suggestions/:patient_offering_suggestion_id':
    'app-cross-organization: patients',
  'POST /api/v1/app/patients/:patient_id/offering-suggestions/:patient_offering_suggestion_id/restore':
    'app-cross-organization: patients',
  'GET /api/v1/app/patients/:patient_id/offerings': 'app-cross-organization: patients',
  'GET /api/v1/app/patients/:patient_id/offerings/:patient_offering_id':
    'app-cross-organization: patients',
  'PATCH /api/v1/app/patients/:patient_id/offerings/:patient_offering_id':
    'app-cross-organization: patients',
  'GET /api/v1/app/invoices/:invoice_id/credit-notes': 'app-cross-organization: invoices',
  'POST /api/v1/app/invoices/:invoice_id/credit-notes': 'app-cross-organization: invoices',
  'GET /api/v1/app/invoices/:invoice_id/credit-notes/:invoice_credit_note_id':
    'app-cross-organization: invoices',
  'POST /api/v1/app/invoices/:invoice_id/preview': 'app-cross-organization: invoices',
  'GET /api/v1/app/payments/:payment_id/edits': 'app-cross-organization: payments',
  'POST /api/v1/app/payments/:payment_id/reverse': 'app-cross-organization: payments',
  'POST /api/v1/app/pending-credits/:pending_credit_id/settle':
    'app-cross-organization: pending-credits',
  'GET /api/v1/app/stock-items/:stock_item_id/movements': 'app-cross-organization: stock-items',
  'POST /api/v1/app/stock-items/:stock_item_id/movements': 'app-cross-organization: stock-items',
  'GET /api/v1/app/stock-items/:stock_item_id/movements/:stock_item_movement_id':
    'app-cross-organization: stock-items',
  'POST /api/v1/app/stock-items/:stock_item_id/movements/:stock_item_movement_id/revert':
    'app-cross-organization: stock-items',
  'POST /api/v1/app/tasks/:task_id/reassign': 'app-cross-organization: tasks',
  'GET /api/v1/app/medical-reps/:medical_rep_id/visits/:medical_rep_visit_id':
    'app-cross-organization: medical-reps',
  'DELETE /api/v1/app/medical-reps/:medical_rep_id/visits/:medical_rep_visit_id':
    'app-cross-organization: medical-reps',
  'POST /api/v1/app/medical-reps/:medical_rep_id/visits/:medical_rep_visit_id/restore':
    'app-cross-organization: medical-reps',
  'POST /api/v1/app/medical-sales/:medical_sale_id/returns':
    'app-cross-organization: medical-sales',
  'POST /api/v1/app/suppliers/:supplier_id/payments': 'app-cross-organization: suppliers',
};

describe('Global: authorization-model attack-test mapping parity', () => {
  const model = loadRouteAuthorizationModel();

  it('every modeled route has a reviewed attack-test mapping', () => {
    const missing = Object.keys(model).filter((key) => !(key in RUNTIME_COVERAGE));
    expect(
      missing,
      `Modeled routes missing an attack-test mapping (review the security scenario and document it here):\n${missing.join('\n')}`,
    ).toEqual([]);
  });

  it('every runtime-coverage entry maps to a real modelled route (no stale entries)', () => {
    const orphans = Object.keys(RUNTIME_COVERAGE).filter((key) => !(key in model));
    expect(orphans, `Stale runtime-coverage entries:\n${orphans.join('\n')}`).toEqual([]);
  });
});

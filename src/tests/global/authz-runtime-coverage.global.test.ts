import { describe, it, expect } from 'vitest';
import { loadRouteAuthorizationModel } from '@/tests/helpers/route-authorization-model.js';

/**
 * Runtime-coverage gate for the declarative authorization model.
 *
 * The companion `authz-model-coverage.global.test.ts` proves every object-by-id
 * route *declares* a model. This gate goes one step further: it proves every
 * modelled route is *actually exercised* by a dedicated attacker test in
 * `src/tests/security/authz/`, by requiring an entry in `RUNTIME_COVERAGE`
 * below. Adding a new by-id route therefore fails CI twice until both a model
 * entry AND a runtime attack test (mapped here) exist — closing the
 * "authorization test silently never written" gap by construction.
 *
 * Each value names the suite + scenario that asserts the attacker outcome, so
 * the map doubles as a route→test index. It is kept in lockstep with the model
 * (this gate fails on any drift in either direction).
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

  // ── model: organization — cross-organization reads (cross-organization-resource.security.test.ts) ─────
  'GET /api/v1/billing/subscriptions/:subscription_id':
    'object-ownership: subscriptions (cross-organization)',
  'GET /api/v1/billing/subscriptions/:subscription_id/payment-setup':
    'object-ownership: subscription payment-setup (cross-organization)',
  'GET /api/v1/notify/webhooks/:webhook_id': 'cross-organization-resource: webhook',
  'GET /api/v1/app/branches/:branch_id': 'cross-organization-resource: branch',
  'POST /api/v1/app/leads/:lead_id/convert': 'cross-organization-resource: lead',
  'GET /api/v1/app/messages/:message_id': 'cross-organization-resource: message',
  'POST /api/v1/app/messages/:message_id/resend': 'cross-organization-resource: message',
  'POST /api/v1/app/leads/:lead_id/claim': 'cross-organization-resource: lead',
  'POST /api/v1/app/leads/:lead_id/release': 'cross-organization-resource: lead',
  'POST /api/v1/app/leads/:lead_id/reads': 'cross-organization-resource: lead',
  'GET /api/v1/app/patient-clinical-notes/:patient_clinical_note_id':
    'cross-organization-resource: clinical note',
  'DELETE /api/v1/app/patient-clinical-notes/:patient_clinical_note_id':
    'cross-organization-resource: clinical note',
  'POST /api/v1/app/patient-clinical-notes/:patient_clinical_note_id/restore':
    'cross-organization-resource: clinical note',
  'GET /api/v1/app/patient-images/:patient_image_id': 'cross-organization-resource: patient image',
  'PATCH /api/v1/app/patient-images/:patient_image_id':
    'cross-organization-resource: patient image',
  'DELETE /api/v1/app/patient-images/:patient_image_id':
    'cross-organization-resource: patient image',
  'POST /api/v1/app/patient-images/:patient_image_id/restore':
    'cross-organization-resource: patient image',
  'GET /api/v1/app/patient-reports/:patient_report_id':
    'cross-organization-resource: patient report',
  'PATCH /api/v1/app/patient-reports/:patient_report_id':
    'cross-organization-resource: patient report',
  'DELETE /api/v1/app/patient-reports/:patient_report_id':
    'cross-organization-resource: patient report',
  'POST /api/v1/app/patient-reports/:patient_report_id/restore':
    'cross-organization-resource: patient report',
  'GET /api/v1/app/patient-packages/:patient_package_id':
    'cross-organization-resource: patient package',
  'PATCH /api/v1/app/patient-packages/:patient_package_id':
    'cross-organization-resource: patient package',
  'DELETE /api/v1/app/patient-packages/:patient_package_id':
    'cross-organization-resource: patient package',
  'POST /api/v1/app/patient-packages/:patient_package_id/restore':
    'cross-organization-resource: patient package',
  'GET /api/v1/app/stock-vendors/:stock_vendor_id': 'cross-organization-resource: stock vendor',
  'PATCH /api/v1/app/stock-vendors/:stock_vendor_id': 'cross-organization-resource: stock vendor',
  'DELETE /api/v1/app/stock-vendors/:stock_vendor_id': 'cross-organization-resource: stock vendor',
  'POST /api/v1/app/stock-vendors/:stock_vendor_id/restore':
    'cross-organization-resource: stock vendor',
  'GET /api/v1/app/stock-items/:stock_item_id': 'cross-organization-resource: stock item',
  'PATCH /api/v1/app/stock-items/:stock_item_id': 'cross-organization-resource: stock item',
  'DELETE /api/v1/app/stock-items/:stock_item_id': 'cross-organization-resource: stock item',
  'POST /api/v1/app/stock-items/:stock_item_id/restore': 'cross-organization-resource: stock item',
  'GET /api/v1/app/stock-purchases/:stock_purchase_id':
    'cross-organization-resource: stock purchase',
  'PATCH /api/v1/app/stock-purchases/:stock_purchase_id':
    'cross-organization-resource: stock purchase',
  'DELETE /api/v1/app/stock-purchases/:stock_purchase_id':
    'cross-organization-resource: stock purchase',
  'POST /api/v1/app/stock-purchases/:stock_purchase_id/restore':
    'cross-organization-resource: stock purchase',
  'GET /api/v1/app/stock-counts/:stock_count_id': 'cross-organization-resource: stock count',
  'DELETE /api/v1/app/stock-counts/:stock_count_id': 'cross-organization-resource: stock count',
  'POST /api/v1/app/stock-counts/:stock_count_id/restore':
    'cross-organization-resource: stock count',
  'GET /api/v1/app/stock-movements/:stock_movement_id':
    'cross-organization-resource: stock movement',
  'GET /api/v1/app/tasks/:task_id': 'cross-organization-resource: task',
  'PATCH /api/v1/app/tasks/:task_id': 'cross-organization-resource: task',
  'POST /api/v1/app/tasks/:task_id/resolve': 'cross-organization-resource: task',
  'POST /api/v1/app/tasks/:task_id/snooze': 'cross-organization-resource: task',
  'DELETE /api/v1/app/tasks/:task_id': 'cross-organization-resource: task',
  'POST /api/v1/app/tasks/:task_id/restore': 'cross-organization-resource: task',
  'GET /api/v1/app/manufacturers/:manufacturer_id': 'cross-organization-resource: manufacturer',
  'PATCH /api/v1/app/manufacturers/:manufacturer_id': 'cross-organization-resource: manufacturer',
  'DELETE /api/v1/app/manufacturers/:manufacturer_id': 'cross-organization-resource: manufacturer',
  'POST /api/v1/app/manufacturers/:manufacturer_id/restore':
    'cross-organization-resource: manufacturer',
  'GET /api/v1/app/suppliers/:supplier_id': 'cross-organization-resource: supplier',
  'PATCH /api/v1/app/suppliers/:supplier_id': 'cross-organization-resource: supplier',
  'DELETE /api/v1/app/suppliers/:supplier_id': 'cross-organization-resource: supplier',
  'POST /api/v1/app/suppliers/:supplier_id/restore': 'cross-organization-resource: supplier',
  'GET /api/v1/app/medical-reps/:medical_rep_id': 'cross-organization-resource: medical rep',
  'PATCH /api/v1/app/medical-reps/:medical_rep_id': 'cross-organization-resource: medical rep',
  'DELETE /api/v1/app/medical-reps/:medical_rep_id': 'cross-organization-resource: medical rep',
  'POST /api/v1/app/medical-reps/:medical_rep_id/restore':
    'cross-organization-resource: medical rep',
  'GET /api/v1/app/medical-reps/:medical_rep_id/visits':
    'cross-organization-resource: medical rep visit',
  'POST /api/v1/app/medical-reps/:medical_rep_id/visits':
    'cross-organization-resource: medical rep visit',
  'GET /api/v1/app/medical-rep-visits/:medical_rep_visit_id':
    'cross-organization-resource: medical rep visit',
  'PATCH /api/v1/app/medical-rep-visits/:medical_rep_visit_id':
    'cross-organization-resource: medical rep visit',
  'DELETE /api/v1/app/medical-rep-visits/:medical_rep_visit_id':
    'cross-organization-resource: medical rep visit',
  'POST /api/v1/app/medical-rep-visits/:medical_rep_visit_id/restore':
    'cross-organization-resource: medical rep visit',
  'GET /api/v1/app/medicines/:medicine_id': 'cross-organization-resource: medicine',
  'PATCH /api/v1/app/medicines/:medicine_id': 'cross-organization-resource: medicine',
  'DELETE /api/v1/app/medicines/:medicine_id': 'cross-organization-resource: medicine',
  'POST /api/v1/app/medicines/:medicine_id/restore': 'cross-organization-resource: medicine',
  'GET /api/v1/app/medical-purchase-orders/:medical_purchase_order_id':
    'cross-organization-resource: purchase order',
  'PATCH /api/v1/app/medical-purchase-orders/:medical_purchase_order_id':
    'cross-organization-resource: purchase order',
  'POST /api/v1/app/medical-purchase-orders/:medical_purchase_order_id/receive':
    'cross-organization-resource: purchase order',
  'POST /api/v1/app/medical-purchase-orders/:medical_purchase_order_id/cancel':
    'cross-organization-resource: purchase order',
  'DELETE /api/v1/app/medical-purchase-orders/:medical_purchase_order_id':
    'cross-organization-resource: purchase order',
  'POST /api/v1/app/medical-purchase-orders/:medical_purchase_order_id/restore':
    'cross-organization-resource: purchase order',
  'GET /api/v1/app/medical-contacts/:medical_contact_id':
    'cross-organization-resource: medical contact',
  'PATCH /api/v1/app/medical-contacts/:medical_contact_id':
    'cross-organization-resource: medical contact',
  'DELETE /api/v1/app/medical-contacts/:medical_contact_id':
    'cross-organization-resource: medical contact',
  'POST /api/v1/app/medical-contacts/:medical_contact_id/restore':
    'cross-organization-resource: medical contact',
  'GET /api/v1/app/medical-sales/:medical_sale_id': 'cross-organization-resource: medical sale',
  'POST /api/v1/app/medical-sales/:medical_sale_id/void':
    'cross-organization-resource: medical sale',
  'DELETE /api/v1/app/medical-sales/:medical_sale_id': 'cross-organization-resource: medical sale',
  'POST /api/v1/app/medical-sales/:medical_sale_id/restore':
    'cross-organization-resource: medical sale',
  'GET /api/v1/app/supplier-credits/:supplier_credit_id':
    'cross-organization-resource: supplier credit',
  'DELETE /api/v1/app/supplier-credits/:supplier_credit_id':
    'cross-organization-resource: supplier credit',
  'POST /api/v1/app/supplier-credits/:supplier_credit_id/restore':
    'cross-organization-resource: supplier credit',
  'GET /api/v1/app/patients/:patient_id/treatments': 'cross-organization-resource: treatment',
  'POST /api/v1/app/patients/:patient_id/treatments': 'cross-organization-resource: treatment',
  'GET /api/v1/app/treatments/:treatment_id': 'cross-organization-resource: treatment',
  'PATCH /api/v1/app/treatments/:treatment_id': 'cross-organization-resource: treatment',
  'POST /api/v1/app/treatments/:treatment_id/reverse': 'cross-organization-resource: treatment',
  'GET /api/v1/app/patients/:patient_id/check-ins': 'cross-organization-resource: check-in',
  'POST /api/v1/app/patients/:patient_id/check-ins': 'cross-organization-resource: check-in',
  'GET /api/v1/app/check-ins/:check_in_id': 'cross-organization-resource: check-in',
  'PATCH /api/v1/app/check-ins/:check_in_id': 'cross-organization-resource: check-in',
  'DELETE /api/v1/app/check-ins/:check_in_id': 'cross-organization-resource: check-in',
  'POST /api/v1/app/check-ins/:check_in_id/restore': 'cross-organization-resource: check-in',
  'GET /api/v1/app/patients/:patient_id/reviews': 'cross-organization-resource: review',
  'POST /api/v1/app/patients/:patient_id/reviews': 'cross-organization-resource: review',
  'GET /api/v1/app/reviews/:review_id': 'cross-organization-resource: review',
  'PATCH /api/v1/app/reviews/:review_id': 'cross-organization-resource: review',
  'DELETE /api/v1/app/reviews/:review_id': 'cross-organization-resource: review',
  'POST /api/v1/app/reviews/:review_id/restore': 'cross-organization-resource: review',
  'GET /api/v1/app/feedback-actions/:feedback_action_id':
    'cross-organization-resource: feedback action',
  'PATCH /api/v1/app/feedback-actions/:feedback_action_id':
    'cross-organization-resource: feedback action',
  'DELETE /api/v1/app/feedback-actions/:feedback_action_id':
    'cross-organization-resource: feedback action',
  'POST /api/v1/app/feedback-actions/:feedback_action_id/restore':
    'cross-organization-resource: feedback action',
  'GET /api/v1/app/invoices/:invoice_id': 'cross-organization-resource: invoice',
  'PATCH /api/v1/app/invoices/:invoice_id': 'cross-organization-resource: invoice',
  'DELETE /api/v1/app/invoices/:invoice_id': 'cross-organization-resource: invoice',
  'POST /api/v1/app/invoices/:invoice_id/restore': 'cross-organization-resource: invoice',
  'GET /api/v1/app/patients/:patient_id/packages': 'cross-organization-resource: patient package',
  'POST /api/v1/app/patients/:patient_id/packages': 'cross-organization-resource: patient package',
  'GET /api/v1/app/patients/:patient_id/offering-suggestions':
    'cross-organization-resource: offering suggestion',
  'POST /api/v1/app/patients/:patient_id/offering-suggestions':
    'cross-organization-resource: offering suggestion',
  'GET /api/v1/app/offering-suggestions/:offering_suggestion_id':
    'cross-organization-resource: offering suggestion',
  'PATCH /api/v1/app/offering-suggestions/:offering_suggestion_id':
    'cross-organization-resource: offering suggestion',
  'DELETE /api/v1/app/offering-suggestions/:offering_suggestion_id':
    'cross-organization-resource: offering suggestion',
  'POST /api/v1/app/offering-suggestions/:offering_suggestion_id/restore':
    'cross-organization-resource: offering suggestion',
  'GET /api/v1/app/payments/:payment_id': 'cross-organization-resource: payment',
  'PATCH /api/v1/app/payments/:payment_id': 'cross-organization-resource: payment',
  'POST /api/v1/app/payments/:payment_id/checked': 'cross-organization-resource: payment',
  'DELETE /api/v1/app/payments/:payment_id': 'cross-organization-resource: payment',
  'POST /api/v1/app/payments/:payment_id/restore': 'cross-organization-resource: payment',
  'GET /api/v1/app/credit-notes/:credit_note_id': 'cross-organization-resource: credit note',
  'GET /api/v1/app/pending-credits/:pending_credit_id':
    'cross-organization-resource: pending credit',
  'PATCH /api/v1/app/pending-credits/:pending_credit_id':
    'cross-organization-resource: pending credit',
  'DELETE /api/v1/app/pending-credits/:pending_credit_id':
    'cross-organization-resource: pending credit',
  'POST /api/v1/app/pending-credits/:pending_credit_id/restore':
    'cross-organization-resource: pending credit',
  'GET /api/v1/app/day-closes/:day_close_id': 'cross-organization-resource: day close',
  'POST /api/v1/app/day-closes/:day_close_id/close': 'cross-organization-resource: day close',
  'POST /api/v1/app/day-closes/:day_close_id/reopen': 'cross-organization-resource: day close',
  'GET /api/v1/app/diagnoses/:diagnosis_id': 'cross-organization-resource: diagnosis',
  'PATCH /api/v1/app/diagnoses/:diagnosis_id': 'cross-organization-resource: diagnosis',
  'DELETE /api/v1/app/diagnoses/:diagnosis_id': 'cross-organization-resource: diagnosis',
  'POST /api/v1/app/diagnoses/:diagnosis_id/restore': 'cross-organization-resource: diagnosis',
  'GET /api/v1/app/patients/:patient_id/clinical-notes':
    'cross-organization-resource: clinical note',
  'POST /api/v1/app/patients/:patient_id/clinical-notes':
    'cross-organization-resource: clinical note',
  'GET /api/v1/app/patients/:patient_id/prescriptions': 'cross-organization-resource: prescription',
  'POST /api/v1/app/patients/:patient_id/prescriptions':
    'cross-organization-resource: prescription',
  'GET /api/v1/app/prescriptions/:prescription_id': 'cross-organization-resource: prescription',
  'PATCH /api/v1/app/prescriptions/:prescription_id': 'cross-organization-resource: prescription',
  'POST /api/v1/app/prescriptions/:prescription_id/approve':
    'cross-organization-resource: prescription',
  'DELETE /api/v1/app/prescriptions/:prescription_id': 'cross-organization-resource: prescription',
  'POST /api/v1/app/prescriptions/:prescription_id/restore':
    'cross-organization-resource: prescription',
  'GET /api/v1/app/prescription-kits/:prescription_kit_id':
    'cross-organization-resource: prescription kit',
  'PATCH /api/v1/app/prescription-kits/:prescription_kit_id':
    'cross-organization-resource: prescription kit',
  'DELETE /api/v1/app/prescription-kits/:prescription_kit_id':
    'cross-organization-resource: prescription kit',
  'POST /api/v1/app/prescription-kits/:prescription_kit_id/restore':
    'cross-organization-resource: prescription kit',
  'GET /api/v1/app/patients/:patient_id/images': 'cross-organization-resource: patient image',
  'POST /api/v1/app/patients/:patient_id/images': 'cross-organization-resource: patient image',
  'GET /api/v1/app/patients/:patient_id/reports': 'cross-organization-resource: patient report',
  'POST /api/v1/app/patients/:patient_id/reports': 'cross-organization-resource: patient report',
  'GET /api/v1/app/patients/:patient_id/notes': 'cross-organization-resource: patient note',
  'POST /api/v1/app/patients/:patient_id/notes': 'cross-organization-resource: patient note',
  'GET /api/v1/app/patient-notes/:patient_note_id': 'cross-organization-resource: patient note',
  'PATCH /api/v1/app/patient-notes/:patient_note_id': 'cross-organization-resource: patient note',
  'DELETE /api/v1/app/patient-notes/:patient_note_id': 'cross-organization-resource: patient note',
  'POST /api/v1/app/patient-notes/:patient_note_id/restore':
    'cross-organization-resource: patient note',
  'GET /api/v1/app/appointments/:appointment_id': 'cross-organization-resource: appointment',
  'PATCH /api/v1/app/appointments/:appointment_id': 'cross-organization-resource: appointment',
  'POST /api/v1/app/appointments/:appointment_id/status':
    'cross-organization-resource: appointment',
  'POST /api/v1/app/appointments/:appointment_id/cancel':
    'cross-organization-resource: appointment',
  'POST /api/v1/app/appointments/:appointment_id/reinstate':
    'cross-organization-resource: appointment',
  'POST /api/v1/app/appointments/:appointment_id/undo-check-in':
    'cross-organization-resource: appointment',
  'DELETE /api/v1/app/appointments/:appointment_id': 'cross-organization-resource: appointment',
  'POST /api/v1/app/appointments/:appointment_id/restore':
    'cross-organization-resource: appointment',
  'GET /api/v1/app/visits/:visit_id': 'cross-organization-resource: visit',
  'PATCH /api/v1/app/visits/:visit_id': 'cross-organization-resource: visit',
  'POST /api/v1/app/visits/:visit_id/stage': 'cross-organization-resource: visit',
  'POST /api/v1/app/visits/:visit_id/pause': 'cross-organization-resource: visit',
  'POST /api/v1/app/visits/:visit_id/resume': 'cross-organization-resource: visit',
  'GET /api/v1/app/patients/:patient_id': 'cross-organization-resource: patient',
  'PATCH /api/v1/app/patients/:patient_id': 'cross-organization-resource: patient',
  'DELETE /api/v1/app/patients/:patient_id': 'cross-organization-resource: patient',
  'POST /api/v1/app/patients/:patient_id/restore': 'cross-organization-resource: patient',
  'GET /api/v1/app/leads/:lead_id': 'cross-organization-resource: lead',
  'PATCH /api/v1/app/leads/:lead_id': 'cross-organization-resource: lead',
  'DELETE /api/v1/app/leads/:lead_id': 'cross-organization-resource: lead',
  'POST /api/v1/app/leads/:lead_id/restore': 'cross-organization-resource: lead',
  'GET /api/v1/app/message-templates/:message_template_id':
    'cross-organization-resource: message template',
  'PATCH /api/v1/app/message-templates/:message_template_id':
    'cross-organization-resource: message template',
  'DELETE /api/v1/app/message-templates/:message_template_id':
    'cross-organization-resource: message template',
  'POST /api/v1/app/message-templates/:message_template_id/restore':
    'cross-organization-resource: message template',
  'GET /api/v1/app/branches/:branch_id/holidays': 'cross-organization-resource: branch holiday',
  'POST /api/v1/app/branches/:branch_id/holidays': 'cross-organization-resource: branch holiday',
  'GET /api/v1/app/saved-views/:saved_view_id': 'cross-organization-resource: saved view',
  'PATCH /api/v1/app/saved-views/:saved_view_id': 'cross-organization-resource: saved view',
  'DELETE /api/v1/app/saved-views/:saved_view_id': 'cross-organization-resource: saved view',
  'POST /api/v1/app/saved-views/:saved_view_id/restore': 'cross-organization-resource: saved view',
  'GET /api/v1/app/offering-groups/:offering_group_id':
    'cross-organization-resource: offering group',
  'PATCH /api/v1/app/offering-groups/:offering_group_id':
    'cross-organization-resource: offering group',
  'DELETE /api/v1/app/offering-groups/:offering_group_id':
    'cross-organization-resource: offering group',
  'POST /api/v1/app/offering-groups/:offering_group_id/restore':
    'cross-organization-resource: offering group',
  'GET /api/v1/app/branches/:branch_id/rooms': 'cross-organization-resource: room',
  'POST /api/v1/app/branches/:branch_id/rooms': 'cross-organization-resource: room',
  'GET /api/v1/app/rooms/:room_id': 'cross-organization-resource: room',
  'PATCH /api/v1/app/rooms/:room_id': 'cross-organization-resource: room',
  'DELETE /api/v1/app/rooms/:room_id': 'cross-organization-resource: room',
  'POST /api/v1/app/rooms/:room_id/restore': 'cross-organization-resource: room',
  'GET /api/v1/app/branches/:branch_id/machines': 'cross-organization-resource: machine',
  'POST /api/v1/app/branches/:branch_id/machines': 'cross-organization-resource: machine',
  'GET /api/v1/app/machines/:machine_id': 'cross-organization-resource: machine',
  'PATCH /api/v1/app/machines/:machine_id': 'cross-organization-resource: machine',
  'DELETE /api/v1/app/machines/:machine_id': 'cross-organization-resource: machine',
  'POST /api/v1/app/machines/:machine_id/restore': 'cross-organization-resource: machine',
  'GET /api/v1/app/branch-holidays/:branch_holiday_id':
    'cross-organization-resource: branch holiday',
  'PATCH /api/v1/app/branch-holidays/:branch_holiday_id':
    'cross-organization-resource: branch holiday',
  'DELETE /api/v1/app/branch-holidays/:branch_holiday_id':
    'cross-organization-resource: branch holiday',
  'POST /api/v1/app/branch-holidays/:branch_holiday_id/restore':
    'cross-organization-resource: branch holiday',
  'GET /api/v1/app/offerings/:offering_id': 'cross-organization-resource: offering',
  'PATCH /api/v1/app/offerings/:offering_id': 'cross-organization-resource: offering',
  'DELETE /api/v1/app/offerings/:offering_id': 'cross-organization-resource: offering',
  'POST /api/v1/app/offerings/:offering_id/restore': 'cross-organization-resource: offering',
  'GET /api/v1/app/offers/:offer_id': 'cross-organization-resource: offer',
  'PATCH /api/v1/app/offers/:offer_id': 'cross-organization-resource: offer',
  'DELETE /api/v1/app/offers/:offer_id': 'cross-organization-resource: offer',
  'POST /api/v1/app/offers/:offer_id/restore': 'cross-organization-resource: offer',
  'GET /api/v1/app/branches/:branch_id/user-accesses':
    'cross-organization-resource: branch user-accesses',
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
  'PATCH /api/v1/app/branches/:branch_id': 'cross-organization-mutation: branch PATCH',
  'PUT /api/v1/app/branches/:branch_id/user-accesses':
    'cross-organization-mutation: branch user-accesses PUT',
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
  'DELETE /api/v1/tenancy/organization/invitations/:invitation_id':
    'cross-organization-mutation: invitation DELETE',
  'POST /api/v1/tenancy/organization/invitations/:invitation_id/resend':
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
  'POST /api/v1/tenancy/invitations/:invitation_id/accept':
    'invitation-email: email-mismatch accept → 403',

  // ── model: global-role (admin-only.security.test.ts) ───────────────────────
  'GET /api/v1/users/:user_id': 'admin-only: regular user denied',
  'PATCH /api/v1/users/:user_id': 'admin-only: regular user denied',
  'DELETE /api/v1/users/:user_id': 'admin-only: regular user denied',
  'POST /api/v1/users/:user_id/suspend': 'admin-only: regular user denied',
  'POST /api/v1/users/:user_id/unsuspend': 'admin-only: regular user denied',
};

describe('Global: authorization-model runtime coverage', () => {
  const model = loadRouteAuthorizationModel();

  it('every modelled route has a dedicated runtime attack test', () => {
    const missing = Object.keys(model).filter((key) => !(key in RUNTIME_COVERAGE));
    expect(
      missing,
      `Modelled routes with no runtime attack test (add one in src/tests/security/authz/ and map it here):\n${missing.join('\n')}`,
    ).toEqual([]);
  });

  it('every runtime-coverage entry maps to a real modelled route (no stale entries)', () => {
    const orphans = Object.keys(RUNTIME_COVERAGE).filter((key) => !(key in model));
    expect(orphans, `Stale runtime-coverage entries:\n${orphans.join('\n')}`).toEqual([]);
  });
});

/**
 * Maps OpenAPI route patterns (method + path) to their Zod request body DTOs.
 *
 * Used by generate-openapi.ts to embed JSON Schemas from Zod DTOs,
 * which openapi-to-postmanv2's built-in schemaFaker turns into realistic examples.
 *
 * When adding a new route with a body, add its mapping here.
 */
import { updateMembershipPreferencesDto } from '@/domains/app/sub-domains/memberships/membership-preferences/membership-preferences.dto.js';
import { ReplaceTaskRulesDto } from '@/domains/app/sub-domains/tasks/task-rule-settings/task-rule-settings.dto.js';
import {
  createMembershipSavedViewDto,
  updateMembershipSavedViewDto,
} from '@/domains/app/sub-domains/memberships/membership-saved-views/membership-saved-views.dto.js';
import {
  CreateOfferingGroupDto as appCreateOfferingGroupDto,
  UpdateOfferingGroupDto as appUpdateOfferingGroupDto,
} from '@/domains/app/sub-domains/offerings/offering-groups/offering-groups.dto.js';
import {
  CreateBranchRoomDto as appCreateRoomDto,
  UpdateBranchRoomDto as appUpdateRoomDto,
} from '@/domains/app/sub-domains/branches/branch-rooms/branch-rooms.dto.js';
import {
  CreateBranchMachineDto as appCreateMachineDto,
  UpdateBranchMachineDto as appUpdateMachineDto,
} from '@/domains/app/sub-domains/branches/branch-machines/branch-machines.dto.js';
import {
  CreateBranchHolidayDto as appCreateBranchHolidayDto,
  UpdateBranchHolidayDto as appUpdateBranchHolidayDto,
} from '@/domains/app/sub-domains/branches/branch-holidays/branch-holidays.dto.js';
import {
  CreateOfferingDto as appCreateOfferingDto,
  UpdateOfferingDto as appUpdateOfferingDto,
} from '@/domains/app/sub-domains/offerings/offerings.dto.js';
import {
  CreateOfferDto as appCreateOfferDto,
  UpdateOfferDto as appUpdateOfferDto,
} from '@/domains/app/sub-domains/offerings/offers/offers.dto.js';
import {
  CreateContactDto as appCreateContactDto,
  UpdateContactDto as appUpdateContactDto,
} from '@/domains/app/sub-domains/contacts/contacts.dto.js';
import { ReplaceContactMembersDto } from '@/domains/app/sub-domains/contacts/contact-members/contact-members.dto.js';
import {
  CreatePatientDto as appCreatePatientDto,
  UpdatePatientDto as appUpdatePatientDto,
} from '@/domains/app/sub-domains/patients/patients.dto.js';
import {
  CreateLeadDto as appCreateLeadDto,
  UpdateLeadDto as appUpdateLeadDto,
} from '@/domains/app/sub-domains/leads/leads.dto.js';
import {
  CreateContactMessageTemplateDto,
  UpdateContactMessageTemplateDto,
} from '@/domains/app/sub-domains/contacts/contact-message-templates/contact-message-templates.dto.js';
import {
  cancelAppointmentDto as appCancelAppointmentDto,
  copyAppointmentDto as appCopyAppointmentDto,
  CreateAppointmentDto as appCreateAppointmentDto,
  stageAppointmentDto as appStageAppointmentDto,
  UpdateAppointmentDto as appUpdateAppointmentDto,
} from '@/domains/app/sub-domains/appointments/appointments.dto.js';
import {
  CreatePatientDiagnosisDto as appCreateDiagnosisDto,
  UpdatePatientDiagnosisDto as appUpdateDiagnosisDto,
} from '@/domains/app/sub-domains/patients/patient-diagnoses/patient-diagnoses.dto.js';
import { CreatePatientClinicalNoteDto as appCreatePatientClinicalNoteDto } from '@/domains/app/sub-domains/patients/patient-clinical-notes/patient-clinical-notes.dto.js';
import {
  CreatePatientPrescriptionDto as appCreatePrescriptionDto,
  UpdatePatientPrescriptionDto as appUpdatePrescriptionDto,
} from '@/domains/app/sub-domains/patients/patient-prescriptions/patient-prescriptions.dto.js';
import {
  CreatePrescriptionKitDto as appCreatePrescriptionKitDto,
  UpdatePrescriptionKitDto as appUpdatePrescriptionKitDto,
} from '@/domains/app/sub-domains/patients/prescription-kits/prescription-kits.dto.js';
import {
  CreatePatientImageDto as appCreatePatientImageDto,
  UpdatePatientImageDto as appUpdatePatientImageDto,
} from '@/domains/app/sub-domains/patients/patient-images/patient-images.dto.js';
import {
  CreatePatientReportDto as appCreatePatientReportDto,
  UpdatePatientReportDto as appUpdatePatientReportDto,
} from '@/domains/app/sub-domains/patients/patient-reports/patient-reports.dto.js';
import {
  CreateInvoiceDto as appCreateInvoiceDto,
  PreviewInvoiceChangeDto as appPreviewInvoiceChangeDto,
  PreviewInvoiceDto as appPreviewInvoiceDto,
  UpdateInvoiceDto as appUpdateInvoiceDto,
} from '@/domains/app/sub-domains/billing/invoices/invoices.dto.js';
import { UpdatePatientOfferingDto as appUpdatePatientOfferingDto } from '@/domains/app/sub-domains/patients/patient-offerings/patient-offerings.dto.js';
import {
  CreatePatientOfferingSuggestionDto as appCreatePatientOfferingSuggestionDto,
  UpdatePatientOfferingSuggestionDto as appUpdatePatientOfferingSuggestionDto,
} from '@/domains/app/sub-domains/patients/patient-offering-suggestions/patient-offering-suggestions.dto.js';
import { CreateInvoiceCreditNoteDto as appCreateInvoiceCreditNoteDto } from '@/domains/app/sub-domains/billing/invoice-credit-notes/invoice-credit-notes.dto.js';
import {
  CreatePaymentDto as appCreatePaymentDto,
  ReversePaymentDto as appReversePaymentDto,
  UpdatePaymentDto as appUpdatePaymentDto,
} from '@/domains/app/sub-domains/billing/payments/payments.dto.js';
import {
  CreatePendingCreditDto as appCreatePendingCreditDto,
  SettlePendingCreditDto as appSettlePendingCreditDto,
  UpdatePendingCreditDto as appUpdatePendingCreditDto,
} from '@/domains/app/sub-domains/billing/pending-credits/pending-credits.dto.js';
import {
  CloseDayCloseDto as appCloseDayCloseDto,
  CreateDayCloseDto as appCreateDayCloseDto,
  ReopenDayCloseDto as appReopenDayCloseDto,
} from '@/domains/app/sub-domains/billing/day-closes/day-closes.dto.js';
import {
  CreatePatientTreatmentDto as appCreatePatientTreatmentDto,
  ReversePatientTreatmentDto as appReversePatientTreatmentDto,
  UpdatePatientTreatmentDto as appUpdatePatientTreatmentDto,
} from '@/domains/app/sub-domains/patients/patient-treatments/patient-treatments.dto.js';
import {
  CreatePatientCheckInDto as appCreatePatientCheckInDto,
  UpdatePatientCheckInDto as appUpdatePatientCheckInDto,
} from '@/domains/app/sub-domains/patients/patient-check-ins/patient-check-ins.dto.js';
import {
  CreatePatientReviewDto as appCreatePatientReviewDto,
  UpdatePatientReviewDto as appUpdatePatientReviewDto,
} from '@/domains/app/sub-domains/patients/patient-reviews/patient-reviews.dto.js';
import { LogPatientFeedbackActionDto as appLogPatientFeedbackActionDto } from '@/domains/app/sub-domains/patients/patient-feedback-actions/patient-feedback-actions.dto.js';
import {
  CreateManufacturerDto as appCreateManufacturerDto,
  UpdateManufacturerDto as appUpdateManufacturerDto,
} from '@/domains/app/sub-domains/medical/manufacturers/manufacturers.dto.js';
import {
  CreateSupplierDto as appCreateSupplierDto,
  PaySupplierDto as appPaySupplierDto,
  UpdateSupplierDto as appUpdateSupplierDto,
} from '@/domains/app/sub-domains/medical/suppliers/suppliers.dto.js';
import {
  CreateMedicalRepDto as appCreateMedicalRepDto,
  UpdateMedicalRepDto as appUpdateMedicalRepDto,
} from '@/domains/app/sub-domains/medical/medical-reps/medical-reps.dto.js';
import { CreateMedicalRepVisitDto as appCreateMedicalRepVisitDto } from '@/domains/app/sub-domains/medical/medical-reps/medical-rep-visits/medical-rep-visits.dto.js';
import {
  CreateMedicineDto as appCreateMedicineDto,
  NearExpiryDiscountDto as appNearExpiryDiscountDto,
  UpdateMedicineDto as appUpdateMedicineDto,
} from '@/domains/app/sub-domains/medical/medicines/medicines.dto.js';
import {
  CreateMedicalPurchaseOrderDto as appCreateMedicalPurchaseOrderDto,
  ReceiveMedicalPurchaseOrderDto as appReceiveMedicalPurchaseOrderDto,
  UpdateMedicalPurchaseOrderDto as appUpdateMedicalPurchaseOrderDto,
} from '@/domains/app/sub-domains/medical/medical-purchase-orders/medical-purchase-orders.dto.js';
import {
  CreateMedicalSaleDto as appCreateMedicalSaleDto,
  ReturnMedicalSaleDto as appReturnMedicalSaleDto,
} from '@/domains/app/sub-domains/medical/medical-sales/medical-sales.dto.js';
import { CreateSupplierCreditDto as appCreateSupplierCreditDto } from '@/domains/app/sub-domains/medical/suppliers/supplier-credits/supplier-credits.dto.js';
import {
  CreateStockVendorDto as appCreateStockVendorDto,
  UpdateStockVendorDto as appUpdateStockVendorDto,
} from '@/domains/app/sub-domains/stock/stock-vendors/stock-vendors.dto.js';
import {
  CreateStockItemDto as appCreateStockItemDto,
  UpdateStockItemDto as appUpdateStockItemDto,
} from '@/domains/app/sub-domains/stock/stock-items/stock-items.dto.js';
import {
  CreateStockPurchaseDto as appCreateStockPurchaseDto,
  UpdateStockPurchaseDto as appUpdateStockPurchaseDto,
} from '@/domains/app/sub-domains/stock/stock-purchases/stock-purchases.dto.js';
import { CreateStockCountDto as appCreateStockCountDto } from '@/domains/app/sub-domains/stock/stock-counts/stock-counts.dto.js';
import {
  CreateStockItemMovementDto as appCreateStockItemMovementDto,
  RevertStockItemMovementDto as appRevertStockItemMovementDto,
} from '@/domains/app/sub-domains/stock/stock-item-movements/stock-item-movements.dto.js';
import {
  CreateTaskDto as appCreateTaskDto,
  ReassignTaskDto as appReassignTaskDto,
  ResolveTaskDto as appResolveTaskDto,
  SnoozeTaskDto as appSnoozeTaskDto,
  UpdateTaskDto as appUpdateTaskDto,
} from '@/domains/app/sub-domains/tasks/tasks.dto.js';
import {
  AddContactNoteDto,
  ContactMessageBatchDto,
  LogContactCallDto,
  SendContactMessageDto,
} from '@/domains/app/sub-domains/contacts/contact-activities/contact-activities.dto.js';
import type { ZodTypeAny } from 'zod';

// ─── Auth ──────────────────────────────────────────────────────────────
import {
  LoginDto,
  EmailSendCodeDto,
  EmailLoginDto,
  MfaVerifyDto,
  CreateAuthMethodDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  MfaEnrollDto,
  MfaEnrollConfirmDto,
  MfaLoginVerifyDto,
  StepUpVerifyDto,
} from '@/domains/auth/auth.dto.js';

// ─── User ──────────────────────────────────────────────────────────────
import {
  UpdateMeDto,
  UpdateMyPresenceDto,
  AdminUpdateUserDto,
  UploadAvatarDto,
} from '@/domains/user/user.dto.js';
import { UpdateUserSettingsDto } from '@/domains/user/sub-domains/user-settings/user-settings.dto.js';
import { PutNotificationPreferencesDto } from '@/domains/user/sub-domains/user-notification-preferences/user-notification-preferences.dto.js';
import { exportUserDataBodyDto } from '@/domains/user/sub-domains/user-data-export/user-data-export.dto.js';
import { CreateUserBugReportDto } from '@/domains/user/sub-domains/user-bug-report/user-bug-report.dto.js';
import {
  webauthnAuthenticateOptionsDto,
  webauthnAuthenticateVerifyDto,
  webauthnRegisterVerifyDto,
} from '@/domains/auth/sub-domains/auth-webauthn/webauthn.dto.js';

// ─── Tenancy: Organization ─────────────────────────────────────────────
import {
  createOrganizationDto,
  updateOrganizationDto,
  uploadLogoDto,
} from '@/domains/tenancy/sub-domains/organization/organization.dto.js';

import { updateOrganizationSettingsDto } from '@/domains/tenancy/sub-domains/organization/organization-settings/organization-settings.dto.js';

import {
  createOrganizationNotificationPolicyDto,
  updateOrganizationNotificationPolicyDto,
} from '@/domains/tenancy/sub-domains/organization/organization-notification-policy/organization-notification-policy.dto.js';

import {
  createOrganizationApiKeyDto,
  updateOrganizationApiKeyDto,
} from '@/domains/tenancy/sub-domains/organization/organization-api-key/organization-api-key.dto.js';

// ─── Tenancy: Membership ───────────────────────────────────────────────
import {
  createMembershipDto,
  updateMembershipDto,
  transferOwnershipDto,
} from '@/domains/tenancy/sub-domains/membership/membership.dto.js';

import {
  acceptMembershipInvitationDto,
  resendMembershipInvitationDto,
} from '@/domains/tenancy/sub-domains/membership/membership-invitation/membership-invitation.dto.js';

// ─── Tenancy: Roles & Permissions ──────────────────────────────────────
import {
  createMemberRoleDto,
  updateMemberRoleDto,
} from '@/domains/tenancy/sub-domains/member-roles/member-role.dto.js';

import { putMemberRolePermissionsDto } from '@/domains/tenancy/sub-domains/member-roles/member-role-permission/member-role-permission.dto.js';

// ─── Billing ───────────────────────────────────────────────────────────
import {
  CreateSubscriptionDto,
  ChangePlanDto,
} from '@/domains/billing/sub-domains/subscription/subscription.dto.js';

// ─── Upload ────────────────────────────────────────────────────────────
import { createUploadDto } from '@/domains/upload/upload.dto.js';

// ─── App ───────────────────────────────────────────────────────────────
import {
  CreateBranchDto,
  UpdateBranchDto,
} from '@/domains/app/sub-domains/branches/branches.dto.js';
import { ChangeOnboardingSetupDto } from '@/domains/app/sub-domains/onboarding-setup/onboarding-setup.dto.js';
import { ReplaceBranchMembersDto } from '@/domains/app/sub-domains/branches/branch-members/branch-members.dto.js';

// ─── Notify ────────────────────────────────────────────────────────────
import {
  CreateWebhookDto,
  UpdateWebhookDto,
} from '@/domains/notify/sub-domains/webhook/webhook.dto.js';

/**
 * Route key format: "METHOD /openapi/path" (with {param} placeholders).
 * Value: Zod schema for the request body.
 */
export const routeSchemaMap: Record<string, ZodTypeAny> = {
  // ── Auth ──
  'POST /api/v1/auth/login': LoginDto,
  'POST /api/v1/auth/email/send-code': EmailSendCodeDto,
  'POST /api/v1/auth/email/login': EmailLoginDto,
  'POST /api/v1/auth/me/mfa/verify': MfaVerifyDto,
  'POST /api/v1/auth/me/mfa/enroll': MfaEnrollDto,
  'POST /api/v1/auth/me/mfa/enroll/confirm': MfaEnrollConfirmDto,
  'POST /api/v1/auth/step-up': StepUpVerifyDto,
  'POST /api/v1/auth/mfa/login': MfaLoginVerifyDto,
  'POST /api/v1/auth/password/forgot': ForgotPasswordDto,
  'POST /api/v1/auth/password/reset': ResetPasswordDto,
  'POST /api/v1/auth/password/change': ChangePasswordDto,
  'POST /api/v1/auth/webauthn/authenticate/options': webauthnAuthenticateOptionsDto,
  'POST /api/v1/auth/webauthn/authenticate/verify': webauthnAuthenticateVerifyDto,
  'POST /api/v1/auth/me/webauthn/register/verify': webauthnRegisterVerifyDto,

  // ── Auth: Me (auth-specific) ──
  'POST /api/v1/auth/me/auth-methods': CreateAuthMethodDto,

  // ── User: Me (profile) ──
  'PATCH /api/v1/users/me': UpdateMeDto,
  'PUT /api/v1/users/me/presence': UpdateMyPresenceDto,
  'PATCH /api/v1/users/me/settings': UpdateUserSettingsDto,
  'PUT /api/v1/users/me/notification-preferences': PutNotificationPreferencesDto,
  'POST /api/v1/users/me/bug-reports': CreateUserBugReportDto,

  // ── Admin: Users ──
  'PATCH /api/v1/users/{user_id}': AdminUpdateUserDto,

  // ── Organizations ──
  'POST /api/v1/tenancy/organizations': createOrganizationDto,
  'PATCH /api/v1/tenancy/organization': updateOrganizationDto,
  'PUT /api/v1/tenancy/organization/logo': uploadLogoDto,
  'PATCH /api/v1/tenancy/organization/settings': updateOrganizationSettingsDto,

  // ── Organization: API Keys ──
  'POST /api/v1/tenancy/organization/api-keys': createOrganizationApiKeyDto,
  'PATCH /api/v1/tenancy/organization/api-keys/{api_key_id}': updateOrganizationApiKeyDto,

  // ── Organization: Notification Policies ──
  'POST /api/v1/tenancy/organization/notification-policies':
    createOrganizationNotificationPolicyDto,
  'PATCH /api/v1/tenancy/organization/notification-policies/{notification_policy_id}':
    updateOrganizationNotificationPolicyDto,

  // ── Memberships ──
  'POST /api/v1/tenancy/organization/memberships': createMembershipDto,
  'PATCH /api/v1/tenancy/organization/memberships/{membership_id}': updateMembershipDto,
  'POST /api/v1/tenancy/organization/transfer-ownership': transferOwnershipDto,

  // ── Invitations ── (add-member issues invitations via POST /organization/memberships, REQ-1)
  'POST /api/v1/tenancy/membership-invitations/{membership_invitation_id}/accept':
    acceptMembershipInvitationDto,
  'POST /api/v1/tenancy/organization/memberships/{membership_id}/invitation/resend':
    resendMembershipInvitationDto,

  // ── Roles ──
  'POST /api/v1/tenancy/organization/roles': createMemberRoleDto,
  'PATCH /api/v1/tenancy/organization/roles/{role_id}': updateMemberRoleDto,
  'PUT /api/v1/tenancy/organization/roles/{role_id}/permissions': putMemberRolePermissionsDto,

  // ── Billing: Subscriptions ──
  'POST /api/v1/billing/subscriptions': CreateSubscriptionDto,
  'POST /api/v1/billing/subscriptions/{subscription_id}/change-plan': ChangePlanDto,

  // ── Webhooks ──
  'POST /api/v1/notify/webhooks': CreateWebhookDto,
  'PATCH /api/v1/notify/webhooks/{webhook_id}': UpdateWebhookDto,

  // ── Upload ──
  'POST /api/v1/uploads': createUploadDto,

  // ── App: Branches ──
  'POST /api/v1/app/branches': CreateBranchDto,
  'POST /api/v1/app/appointments/{appointment_id}/copy': appCopyAppointmentDto,
  'POST /api/v1/app/contacts/{contact_id}/activities/send-message': SendContactMessageDto,
  'POST /api/v1/app/contacts/{contact_id}/activities/log-call': LogContactCallDto,
  'POST /api/v1/app/contacts/{contact_id}/activities/add-note': AddContactNoteDto,
  'POST /api/v1/app/contact-activities/message-batches': ContactMessageBatchDto,
  'PATCH /api/v1/app/patients/{patient_id}/offerings/{patient_offering_id}':
    appUpdatePatientOfferingDto,
  'PATCH /api/v1/app/patients/{patient_id}/reports/{patient_report_id}': appUpdatePatientReportDto,
  'PATCH /api/v1/app/patients/{patient_id}/images/{patient_image_id}': appUpdatePatientImageDto,
  'POST /api/v1/app/tasks/{task_id}/snooze': appSnoozeTaskDto,
  'POST /api/v1/app/tasks/{task_id}/resolve': appResolveTaskDto,
  'POST /api/v1/app/tasks/{task_id}/reassign': appReassignTaskDto,
  'PATCH /api/v1/app/tasks/{task_id}': appUpdateTaskDto,
  'POST /api/v1/app/tasks': appCreateTaskDto,
  'POST /api/v1/app/stock-items/{stock_item_id}/movements/{stock_item_movement_id}/revert':
    appRevertStockItemMovementDto,
  'POST /api/v1/app/stock-items/{stock_item_id}/movements': appCreateStockItemMovementDto,
  'POST /api/v1/app/stock-counts': appCreateStockCountDto,
  'PATCH /api/v1/app/stock-purchases/{stock_purchase_id}': appUpdateStockPurchaseDto,
  'POST /api/v1/app/stock-purchases': appCreateStockPurchaseDto,
  'PATCH /api/v1/app/stock-items/{stock_item_id}': appUpdateStockItemDto,
  'POST /api/v1/app/stock-items': appCreateStockItemDto,
  'PATCH /api/v1/app/stock-vendors/{stock_vendor_id}': appUpdateStockVendorDto,
  'POST /api/v1/app/stock-vendors': appCreateStockVendorDto,
  'POST /api/v1/app/suppliers/{supplier_id}/credits': appCreateSupplierCreditDto,
  'POST /api/v1/app/medical-sales': appCreateMedicalSaleDto,
  'POST /api/v1/app/medical-sales/{medical_sale_id}/returns': appReturnMedicalSaleDto,
  'POST /api/v1/app/medical-purchase-orders/{medical_purchase_order_id}/receive':
    appReceiveMedicalPurchaseOrderDto,
  'PATCH /api/v1/app/medical-purchase-orders/{medical_purchase_order_id}':
    appUpdateMedicalPurchaseOrderDto,
  'POST /api/v1/app/medical-purchase-orders': appCreateMedicalPurchaseOrderDto,
  'PATCH /api/v1/app/medicines/{medicine_id}': appUpdateMedicineDto,
  'POST /api/v1/app/medicines': appCreateMedicineDto,
  'POST /api/v1/app/medicines/near-expiry-discount': appNearExpiryDiscountDto,
  'POST /api/v1/app/medical-reps/{medical_rep_id}/visits': appCreateMedicalRepVisitDto,
  'PATCH /api/v1/app/medical-reps/{medical_rep_id}': appUpdateMedicalRepDto,
  'POST /api/v1/app/medical-reps': appCreateMedicalRepDto,
  'PATCH /api/v1/app/suppliers/{supplier_id}': appUpdateSupplierDto,
  'POST /api/v1/app/suppliers': appCreateSupplierDto,
  'POST /api/v1/app/suppliers/{supplier_id}/payments': appPaySupplierDto,
  'PATCH /api/v1/app/manufacturers/{manufacturer_id}': appUpdateManufacturerDto,
  'POST /api/v1/app/manufacturers': appCreateManufacturerDto,
  'POST /api/v1/app/patients/{patient_id}/reviews/{patient_review_id}/actions':
    appLogPatientFeedbackActionDto,
  'PATCH /api/v1/app/patients/{patient_id}/reviews/{patient_review_id}': appUpdatePatientReviewDto,
  'POST /api/v1/app/patients/{patient_id}/reviews': appCreatePatientReviewDto,
  'POST /api/v1/app/patients/{patient_id}/check-ins/{patient_check_in_id}/actions':
    appLogPatientFeedbackActionDto,
  'PATCH /api/v1/app/patients/{patient_id}/check-ins/{patient_check_in_id}':
    appUpdatePatientCheckInDto,
  'POST /api/v1/app/patients/{patient_id}/check-ins': appCreatePatientCheckInDto,
  'POST /api/v1/app/patients/{patient_id}/treatments/{patient_treatment_id}/reverse':
    appReversePatientTreatmentDto,
  'PATCH /api/v1/app/patients/{patient_id}/treatments/{patient_treatment_id}':
    appUpdatePatientTreatmentDto,
  'POST /api/v1/app/patients/{patient_id}/treatments': appCreatePatientTreatmentDto,
  'POST /api/v1/app/day-closes/{day_close_id}/close': appCloseDayCloseDto,
  'POST /api/v1/app/day-closes/{day_close_id}/reopen': appReopenDayCloseDto,
  'POST /api/v1/app/day-closes': appCreateDayCloseDto,
  'POST /api/v1/app/pending-credits/{pending_credit_id}/settle': appSettlePendingCreditDto,
  'PATCH /api/v1/app/pending-credits/{pending_credit_id}': appUpdatePendingCreditDto,
  'POST /api/v1/app/pending-credits': appCreatePendingCreditDto,
  'POST /api/v1/app/payments/{payment_id}/reverse': appReversePaymentDto,
  'PATCH /api/v1/app/payments/{payment_id}': appUpdatePaymentDto,
  'POST /api/v1/app/payments': appCreatePaymentDto,
  'POST /api/v1/app/invoices/{invoice_id}/credit-notes': appCreateInvoiceCreditNoteDto,
  'PATCH /api/v1/app/patients/{patient_id}/offering-suggestions/{patient_offering_suggestion_id}':
    appUpdatePatientOfferingSuggestionDto,
  'POST /api/v1/app/patients/{patient_id}/offering-suggestions':
    appCreatePatientOfferingSuggestionDto,
  'PATCH /api/v1/app/invoices/{invoice_id}': appUpdateInvoiceDto,
  'POST /api/v1/app/invoices': appCreateInvoiceDto,
  'POST /api/v1/app/invoices/preview': appPreviewInvoiceDto,
  'POST /api/v1/app/invoices/{invoice_id}/preview': appPreviewInvoiceChangeDto,
  'POST /api/v1/app/patients/{patient_id}/reports': appCreatePatientReportDto,
  'POST /api/v1/app/patients/{patient_id}/images': appCreatePatientImageDto,
  'PATCH /api/v1/app/prescription-kits/{prescription_kit_id}': appUpdatePrescriptionKitDto,
  'POST /api/v1/app/prescription-kits': appCreatePrescriptionKitDto,
  'PATCH /api/v1/app/patients/{patient_id}/prescriptions/{patient_prescription_id}':
    appUpdatePrescriptionDto,
  'POST /api/v1/app/patients/{patient_id}/prescriptions': appCreatePrescriptionDto,
  'POST /api/v1/app/patients/{patient_id}/clinical-notes': appCreatePatientClinicalNoteDto,
  'PATCH /api/v1/app/patient-diagnoses/{patient_diagnosis_id}': appUpdateDiagnosisDto,
  'POST /api/v1/app/patient-diagnoses': appCreateDiagnosisDto,
  'POST /api/v1/app/appointments/{appointment_id}/cancel': appCancelAppointmentDto,
  'POST /api/v1/app/appointments/{appointment_id}/stage': appStageAppointmentDto,
  'PATCH /api/v1/app/appointments/{appointment_id}': appUpdateAppointmentDto,
  'POST /api/v1/app/appointments': appCreateAppointmentDto,
  'PATCH /api/v1/app/contact-message-templates/{contact_message_template_id}':
    UpdateContactMessageTemplateDto,
  'POST /api/v1/app/contact-message-templates': CreateContactMessageTemplateDto,
  'PATCH /api/v1/app/leads/{lead_id}': appUpdateLeadDto,
  'POST /api/v1/app/leads': appCreateLeadDto,
  'PATCH /api/v1/app/patients/{patient_id}': appUpdatePatientDto,
  'POST /api/v1/app/patients': appCreatePatientDto,
  'PATCH /api/v1/app/offers/{offer_id}': appUpdateOfferDto,
  'POST /api/v1/app/offers': appCreateOfferDto,
  'PATCH /api/v1/app/offerings/{offering_id}': appUpdateOfferingDto,
  'POST /api/v1/app/offerings': appCreateOfferingDto,
  'PATCH /api/v1/app/contacts/{contact_id}': appUpdateContactDto,
  'POST /api/v1/app/contacts': appCreateContactDto,
  'PUT /api/v1/app/contacts/{contact_id}/members': ReplaceContactMembersDto,
  'PATCH /api/v1/app/branches/{branch_id}/holidays/{branch_holiday_id}': appUpdateBranchHolidayDto,
  'POST /api/v1/app/branches/{branch_id}/holidays': appCreateBranchHolidayDto,
  'PATCH /api/v1/app/branches/{branch_id}/machines/{branch_machine_id}': appUpdateMachineDto,
  'POST /api/v1/app/branches/{branch_id}/machines': appCreateMachineDto,
  'PATCH /api/v1/app/branches/{branch_id}/rooms/{branch_room_id}': appUpdateRoomDto,
  'POST /api/v1/app/branches/{branch_id}/rooms': appCreateRoomDto,
  'PATCH /api/v1/app/offering-groups/{offering_group_id}': appUpdateOfferingGroupDto,
  'POST /api/v1/app/offering-groups': appCreateOfferingGroupDto,
  'POST /api/v1/app/memberships/me/saved-views': createMembershipSavedViewDto,
  'PATCH /api/v1/app/memberships/me/saved-views/{membership_saved_view_id}':
    updateMembershipSavedViewDto,
  'PATCH /api/v1/app/memberships/me/preferences': updateMembershipPreferencesDto,
  'PUT /api/v1/app/task-rule-settings': ReplaceTaskRulesDto,
  'PATCH /api/v1/app/branches/{branch_id}': UpdateBranchDto,
  'PATCH /api/v1/app/onboarding-setup': ChangeOnboardingSetupDto,
  'PUT /api/v1/app/branches/{branch_id}/members': ReplaceBranchMembersDto,

  // ── User: Avatar & export ──
  'PUT /api/v1/users/me/avatar': UploadAvatarDto,
  'POST /api/v1/users/me/data-export': exportUserDataBodyDto,
};

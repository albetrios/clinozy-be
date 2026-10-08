/**
 * Maps OpenAPI route patterns (method + path) to Zod querystring DTOs.
 *
 * Used by generate-openapi.ts to document query parameters (especially cursor pagination).
 * When adding a list route with query validation, add its mapping here.
 */
import type { ZodTypeAny } from 'zod';
import { ListAuditLogsQueryDto } from '@/domains/audit/audit.dto.js';
import { OauthCallbackQueryDto } from '@/domains/auth/auth.dto.js';
import { listInvoicesQueryDto } from '@/domains/billing/sub-domains/subscription/subscription.dto.js';
import { listNotificationsQueryDto } from '@/domains/notify/sub-domains/notification/notification.dto.js';
import { listMembershipsQueryDto } from '@/domains/tenancy/sub-domains/membership/membership.dto.js';
import { listAppMembershipsQueryDto } from '@/domains/app/sub-domains/memberships/memberships.dto.js';
import { listMemberRolesQueryDto } from '@/domains/tenancy/sub-domains/member-roles/member-role.dto.js';
import { listOrganizationApiKeysQueryDto } from '@/domains/tenancy/sub-domains/organization/organization-api-key/organization-api-key.dto.js';
import { listOrganizationsQueryDto } from '@/domains/tenancy/sub-domains/organization/organization.dto.js';
import { ListUsersDto } from '@/domains/user/user.dto.js';
import { listMembershipSavedViewsQueryDto } from '@/domains/app/sub-domains/memberships/membership-saved-views/membership-saved-views.dto.js';
import { listOfferingGroupsQueryDto as appOfferingGroupsListQueryDto } from '@/domains/app/sub-domains/offerings/offering-groups/offering-groups.dto.js';
import { listBranchRoomsQueryDto as appRoomsListQueryDto } from '@/domains/app/sub-domains/branches/branch-rooms/branch-rooms.dto.js';
import { listBranchMachinesQueryDto as appMachinesListQueryDto } from '@/domains/app/sub-domains/branches/branch-machines/branch-machines.dto.js';
import { listBranchHolidaysQueryDto as appBranchHolidaysListQueryDto } from '@/domains/app/sub-domains/branches/branch-holidays/branch-holidays.dto.js';
import { listBranchesQueryDto as appBranchesListQueryDto } from '@/domains/app/sub-domains/branches/branches.dto.js';
import { listOfferingsQueryDto as appOfferingsListQueryDto } from '@/domains/app/sub-domains/offerings/offerings.dto.js';
import { listOffersQueryDto as appOffersListQueryDto } from '@/domains/app/sub-domains/offerings/offers/offers.dto.js';
import {
  listPatientsQueryDto as appPatientsListQueryDto,
  timelinePatientQueryDto as appTimelinePatientQueryDto,
} from '@/domains/app/sub-domains/patients/patients.dto.js';
import { listLeadsQueryDto as appLeadsListQueryDto } from '@/domains/app/sub-domains/leads/leads.dto.js';
import { listContactMessageTemplatesQueryDto } from '@/domains/app/sub-domains/contacts/contact-message-templates/contact-message-templates.dto.js';
import { listContactActivitiesQueryDto } from '@/domains/app/sub-domains/contacts/contact-activities/contact-activities.dto.js';
import {
  dailyCountsAppointmentsQueryDto as appDailyCountsAppointmentsQueryDto,
  listAppointmentsQueryDto as appAppointmentsListQueryDto,
  slotsAppointmentsQueryDto as appSlotsAppointmentsQueryDto,
} from '@/domains/app/sub-domains/appointments/appointments.dto.js';
import { listVisitsQueryDto as appVisitsListQueryDto } from '@/domains/app/sub-domains/visits/visits.dto.js';
import { listDiagnosesQueryDto as appDiagnosesListQueryDto } from '@/domains/app/sub-domains/diagnoses/diagnoses.dto.js';
import { listPatientClinicalNotesQueryDto as appPatientClinicalNotesListQueryDto } from '@/domains/app/sub-domains/patient-clinical-notes/patient-clinical-notes.dto.js';
import { listPrescriptionsQueryDto as appPrescriptionsListQueryDto } from '@/domains/app/sub-domains/prescriptions/prescriptions.dto.js';
import { listPrescriptionKitsQueryDto as appPrescriptionKitsListQueryDto } from '@/domains/app/sub-domains/prescription-kits/prescription-kits.dto.js';
import { listPatientImagesQueryDto as appPatientImagesListQueryDto } from '@/domains/app/sub-domains/patient-images/patient-images.dto.js';
import { listPatientReportsQueryDto as appPatientReportsListQueryDto } from '@/domains/app/sub-domains/patient-reports/patient-reports.dto.js';
import { listPatientNotesQueryDto as appPatientNotesListQueryDto } from '@/domains/app/sub-domains/patient-notes/patient-notes.dto.js';
import { listInvoicesQueryDto as appInvoicesListQueryDto } from '@/domains/app/sub-domains/invoices/invoices.dto.js';
import { listPatientPackagesQueryDto as appPatientPackagesListQueryDto } from '@/domains/app/sub-domains/patient-packages/patient-packages.dto.js';
import { listOfferingSuggestionsQueryDto as appOfferingSuggestionsListQueryDto } from '@/domains/app/sub-domains/offering-suggestions/offering-suggestions.dto.js';
import { listPaymentsQueryDto as appPaymentsListQueryDto } from '@/domains/app/sub-domains/payments/payments.dto.js';
import { listCreditNotesQueryDto as appCreditNotesListQueryDto } from '@/domains/app/sub-domains/credit-notes/credit-notes.dto.js';
import { listPendingCreditsQueryDto as appPendingCreditsListQueryDto } from '@/domains/app/sub-domains/pending-credits/pending-credits.dto.js';
import { listDayClosesQueryDto as appDayClosesListQueryDto } from '@/domains/app/sub-domains/day-closes/day-closes.dto.js';
import { listTreatmentsQueryDto as appTreatmentsListQueryDto } from '@/domains/app/sub-domains/treatments/treatments.dto.js';
import { listCheckInsQueryDto as appCheckInsListQueryDto } from '@/domains/app/sub-domains/check-ins/check-ins.dto.js';
import { listReviewsQueryDto as appReviewsListQueryDto } from '@/domains/app/sub-domains/reviews/reviews.dto.js';
import { listFeedbackActionsQueryDto as appFeedbackActionsListQueryDto } from '@/domains/app/sub-domains/feedback-actions/feedback-actions.dto.js';
import { listManufacturersQueryDto as appManufacturersListQueryDto } from '@/domains/app/sub-domains/manufacturers/manufacturers.dto.js';
import { listSuppliersQueryDto as appSuppliersListQueryDto } from '@/domains/app/sub-domains/suppliers/suppliers.dto.js';
import { listMedicalRepsQueryDto as appMedicalRepsListQueryDto } from '@/domains/app/sub-domains/medical-reps/medical-reps.dto.js';
import { listMedicalRepVisitsQueryDto as appMedicalRepVisitsListQueryDto } from '@/domains/app/sub-domains/medical-rep-visits/medical-rep-visits.dto.js';
import { listMedicinesQueryDto as appMedicinesListQueryDto } from '@/domains/app/sub-domains/medicines/medicines.dto.js';
import { listMedicalPurchaseOrdersQueryDto as appMedicalPurchaseOrdersListQueryDto } from '@/domains/app/sub-domains/medical-purchase-orders/medical-purchase-orders.dto.js';
import { listMedicalContactsQueryDto as appMedicalContactsListQueryDto } from '@/domains/app/sub-domains/medical-contacts/medical-contacts.dto.js';
import { listMedicalSalesQueryDto as appMedicalSalesListQueryDto } from '@/domains/app/sub-domains/medical-sales/medical-sales.dto.js';
import { listSupplierCreditsQueryDto as appSupplierCreditsListQueryDto } from '@/domains/app/sub-domains/supplier-credits/supplier-credits.dto.js';
import { listStockVendorsQueryDto as appStockVendorsListQueryDto } from '@/domains/app/sub-domains/stock-vendors/stock-vendors.dto.js';
import { listStockItemsQueryDto as appStockItemsListQueryDto } from '@/domains/app/sub-domains/stock-items/stock-items.dto.js';
import { listStockPurchasesQueryDto as appStockPurchasesListQueryDto } from '@/domains/app/sub-domains/stock-purchases/stock-purchases.dto.js';
import { listStockCountsQueryDto as appStockCountsListQueryDto } from '@/domains/app/sub-domains/stock-counts/stock-counts.dto.js';
import { listStockMovementsQueryDto as appStockMovementsListQueryDto } from '@/domains/app/sub-domains/stock-movements/stock-movements.dto.js';
import { listTasksQueryDto as appTasksListQueryDto } from '@/domains/app/sub-domains/tasks/tasks.dto.js';
import { listContactsQueryDto } from '@/domains/app/sub-domains/contacts/contacts.dto.js';
import { listLimitQuerySchema } from '@/shared/utils/http/pagination.util.js';

export const routeQuerySchemaMap: Record<string, ZodTypeAny> = {
  'GET /api/v1/audit/logs': ListAuditLogsQueryDto,
  'GET /api/v1/users': ListUsersDto,
  'GET /api/v1/billing/invoices': listInvoicesQueryDto,
  'GET /api/v1/users/me/organizations': listOrganizationsQueryDto,
  'GET /api/v1/tenancy/organization/audit-logs': ListAuditLogsQueryDto,
  'GET /api/v1/tenancy/organization/api-keys': listOrganizationApiKeysQueryDto,
  'GET /api/v1/tenancy/organization/memberships': listMembershipsQueryDto,
  'GET /api/v1/app/memberships': listAppMembershipsQueryDto,
  'GET /api/v1/tenancy/organization/roles': listMemberRolesQueryDto,
  'GET /api/v1/notify/notifications': listNotificationsQueryDto,
  'GET /api/v1/notify/webhooks/{webhook_id}/delivery-attempts': listLimitQuerySchema,
  'GET /api/v1/auth/oauth/{provider}/callback': OauthCallbackQueryDto,
  'GET /api/v1/app/memberships/me/saved-views': listMembershipSavedViewsQueryDto,
  'GET /api/v1/app/offering-groups': appOfferingGroupsListQueryDto,
  // C7: `include_inactive` on the full branch list.
  'GET /api/v1/app/branches': appBranchesListQueryDto,
  'GET /api/v1/app/branches/{branch_id}/rooms': appRoomsListQueryDto,
  'GET /api/v1/app/branches/{branch_id}/machines': appMachinesListQueryDto,
  'GET /api/v1/app/branches/{branch_id}/holidays': appBranchHolidaysListQueryDto,
  'GET /api/v1/app/offerings': appOfferingsListQueryDto,
  'GET /api/v1/app/offers': appOffersListQueryDto,
  'GET /api/v1/app/patients': appPatientsListQueryDto,
  'GET /api/v1/app/leads': appLeadsListQueryDto,
  'GET /api/v1/app/contact-message-templates': listContactMessageTemplatesQueryDto,
  'GET /api/v1/app/appointments': appAppointmentsListQueryDto,
  'GET /api/v1/app/visits': appVisitsListQueryDto,
  'GET /api/v1/app/diagnoses': appDiagnosesListQueryDto,
  'GET /api/v1/app/patients/{patient_id}/clinical-notes': appPatientClinicalNotesListQueryDto,
  'GET /api/v1/app/patients/{patient_id}/prescriptions': appPrescriptionsListQueryDto,
  'GET /api/v1/app/prescriptions': appPrescriptionsListQueryDto,
  'GET /api/v1/app/prescription-kits': appPrescriptionKitsListQueryDto,
  'GET /api/v1/app/patients/{patient_id}/images': appPatientImagesListQueryDto,
  'GET /api/v1/app/patients/{patient_id}/reports': appPatientReportsListQueryDto,
  'GET /api/v1/app/patients/{patient_id}/notes': appPatientNotesListQueryDto,
  'GET /api/v1/app/invoices': appInvoicesListQueryDto,
  'GET /api/v1/app/patients/{patient_id}/packages': appPatientPackagesListQueryDto,
  'GET /api/v1/app/patients/{patient_id}/offering-suggestions': appOfferingSuggestionsListQueryDto,
  'GET /api/v1/app/payments': appPaymentsListQueryDto,
  'GET /api/v1/app/credit-notes': appCreditNotesListQueryDto,
  'GET /api/v1/app/pending-credits': appPendingCreditsListQueryDto,
  'GET /api/v1/app/day-closes': appDayClosesListQueryDto,
  'GET /api/v1/app/patients/{patient_id}/treatments': appTreatmentsListQueryDto,
  'GET /api/v1/app/treatments': appTreatmentsListQueryDto,
  'GET /api/v1/app/patients/{patient_id}/check-ins': appCheckInsListQueryDto,
  'GET /api/v1/app/patients/{patient_id}/reviews': appReviewsListQueryDto,
  'GET /api/v1/app/feedback-actions': appFeedbackActionsListQueryDto,
  'GET /api/v1/app/manufacturers': appManufacturersListQueryDto,
  'GET /api/v1/app/suppliers': appSuppliersListQueryDto,
  'GET /api/v1/app/medical-reps': appMedicalRepsListQueryDto,
  'GET /api/v1/app/medical-reps/{medical_rep_id}/visits': appMedicalRepVisitsListQueryDto,
  'GET /api/v1/app/medicines': appMedicinesListQueryDto,
  'GET /api/v1/app/medical-purchase-orders': appMedicalPurchaseOrdersListQueryDto,
  'GET /api/v1/app/medical-contacts': appMedicalContactsListQueryDto,
  'GET /api/v1/app/medical-sales': appMedicalSalesListQueryDto,
  'GET /api/v1/app/supplier-credits': appSupplierCreditsListQueryDto,
  'GET /api/v1/app/stock-vendors': appStockVendorsListQueryDto,
  'GET /api/v1/app/stock-items': appStockItemsListQueryDto,
  'GET /api/v1/app/stock-purchases': appStockPurchasesListQueryDto,
  'GET /api/v1/app/stock-counts': appStockCountsListQueryDto,
  'GET /api/v1/app/stock-movements': appStockMovementsListQueryDto,
  'GET /api/v1/app/tasks': appTasksListQueryDto,
  'GET /api/v1/app/contacts': listContactsQueryDto,
  'GET /api/v1/app/offerings/exports': appOfferingsListQueryDto,
  'GET /api/v1/app/patients/exports': appPatientsListQueryDto,
  'GET /api/v1/app/leads/exports': appLeadsListQueryDto,
  'GET /api/v1/app/appointments/exports': appAppointmentsListQueryDto,
  'GET /api/v1/app/invoices/exports': appInvoicesListQueryDto,
  'GET /api/v1/app/payments/exports': appPaymentsListQueryDto,
  'GET /api/v1/app/medicines/exports': appMedicinesListQueryDto,
  'GET /api/v1/app/medical-purchase-orders/exports': appMedicalPurchaseOrdersListQueryDto,
  'GET /api/v1/app/medical-sales/exports': appMedicalSalesListQueryDto,
  'GET /api/v1/app/stock-items/exports': appStockItemsListQueryDto,
  'GET /api/v1/app/stock-purchases/exports': appStockPurchasesListQueryDto,
  'GET /api/v1/app/tasks/exports': appTasksListQueryDto,
  'GET /api/v1/app/contacts/{contact_id}/activities': listContactActivitiesQueryDto,
  'GET /api/v1/app/appointments/slots': appSlotsAppointmentsQueryDto,
  'GET /api/v1/app/appointments/daily-counts': appDailyCountsAppointmentsQueryDto,
  'GET /api/v1/app/patients/{patient_id}/timeline': appTimelinePatientQueryDto,
};

/** Routes that must document `after` and `limit` query parameters in OpenAPI. */
export const routeQuerySchemaMapKeys = Object.keys(routeQuerySchemaMap);

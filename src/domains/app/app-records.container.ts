import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { OfferingGroupsRepository } from './sub-domains/offerings/offering-groups/offering-groups.repository.js';
import { OfferingGroupsService } from './sub-domains/offerings/offering-groups/offering-groups.service.js';
import { BranchRoomsRepository } from './sub-domains/branches/branch-rooms/branch-rooms.repository.js';
import { BranchRoomsService } from './sub-domains/branches/branch-rooms/branch-rooms.service.js';
import { BranchMachinesRepository } from './sub-domains/branches/branch-machines/branch-machines.repository.js';
import { BranchMachinesService } from './sub-domains/branches/branch-machines/branch-machines.service.js';
import { BranchHolidaysRepository } from './sub-domains/branches/branch-holidays/branch-holidays.repository.js';
import { BranchHolidaysService } from './sub-domains/branches/branch-holidays/branch-holidays.service.js';
import { OfferingsRepository } from './sub-domains/offerings/offerings.repository.js';
import { OfferingsService } from './sub-domains/offerings/offerings.service.js';
import { OffersRepository } from './sub-domains/offerings/offers/offers.repository.js';
import { OffersService } from './sub-domains/offerings/offers/offers.service.js';
import { ContactsRepository } from './sub-domains/contacts/contacts.repository.js';
import { ContactsService } from './sub-domains/contacts/contacts.service.js';
import { PatientsRepository } from './sub-domains/patients/patients.repository.js';
import { PatientsService } from './sub-domains/patients/patients.service.js';
import { LeadsRepository } from './sub-domains/leads/leads.repository.js';
import { LeadsService } from './sub-domains/leads/leads.service.js';
import { ContactActivitiesRepository } from './sub-domains/contacts/contact-activities/contact-activities.repository.js';
import { ContactActivitiesService } from './sub-domains/contacts/contact-activities/contact-activities.service.js';
import { ContactMessageTemplatesRepository } from './sub-domains/contacts/contact-message-templates/contact-message-templates.repository.js';
import { ContactMessageTemplatesService } from './sub-domains/contacts/contact-message-templates/contact-message-templates.service.js';
import { AppointmentsRepository } from './sub-domains/appointments/appointments.repository.js';
import { AppointmentsService } from './sub-domains/appointments/appointments.service.js';
import { VisitsRepository } from './sub-domains/visits/visits.repository.js';
import { VisitsService } from './sub-domains/visits/visits.service.js';
import { DiagnosesRepository } from './sub-domains/diagnoses/diagnoses.repository.js';
import { DiagnosesService } from './sub-domains/diagnoses/diagnoses.service.js';
import { PatientClinicalNotesRepository } from './sub-domains/patient-clinical-notes/patient-clinical-notes.repository.js';
import { PatientClinicalNotesService } from './sub-domains/patient-clinical-notes/patient-clinical-notes.service.js';
import { PrescriptionsRepository } from './sub-domains/prescriptions/prescriptions.repository.js';
import { PrescriptionsService } from './sub-domains/prescriptions/prescriptions.service.js';
import { PrescriptionKitsRepository } from './sub-domains/prescription-kits/prescription-kits.repository.js';
import { PrescriptionKitsService } from './sub-domains/prescription-kits/prescription-kits.service.js';
import { PatientImagesRepository } from './sub-domains/patient-images/patient-images.repository.js';
import { PatientImagesService } from './sub-domains/patient-images/patient-images.service.js';
import { PatientReportsRepository } from './sub-domains/patient-reports/patient-reports.repository.js';
import { PatientReportsService } from './sub-domains/patient-reports/patient-reports.service.js';
import { PatientNotesRepository } from './sub-domains/patient-notes/patient-notes.repository.js';
import { PatientNotesService } from './sub-domains/patient-notes/patient-notes.service.js';
import { InvoicesRepository } from './sub-domains/invoices/invoices.repository.js';
import { InvoicesService } from './sub-domains/invoices/invoices.service.js';
import { PatientPackagesRepository } from './sub-domains/patient-packages/patient-packages.repository.js';
import { PatientPackagesService } from './sub-domains/patient-packages/patient-packages.service.js';
import { OfferingSuggestionsRepository } from './sub-domains/offering-suggestions/offering-suggestions.repository.js';
import { OfferingSuggestionsService } from './sub-domains/offering-suggestions/offering-suggestions.service.js';
import { PaymentsRepository } from './sub-domains/payments/payments.repository.js';
import { PaymentsService } from './sub-domains/payments/payments.service.js';
import { CreditNotesRepository } from './sub-domains/credit-notes/credit-notes.repository.js';
import { CreditNotesService } from './sub-domains/credit-notes/credit-notes.service.js';
import { PendingCreditsRepository } from './sub-domains/pending-credits/pending-credits.repository.js';
import { PendingCreditsService } from './sub-domains/pending-credits/pending-credits.service.js';
import { DayClosesRepository } from './sub-domains/day-closes/day-closes.repository.js';
import { DayClosesService } from './sub-domains/day-closes/day-closes.service.js';
import { TreatmentsRepository } from './sub-domains/treatments/treatments.repository.js';
import { TreatmentsService } from './sub-domains/treatments/treatments.service.js';
import { CheckInsRepository } from './sub-domains/check-ins/check-ins.repository.js';
import { CheckInsService } from './sub-domains/check-ins/check-ins.service.js';
import { ReviewsRepository } from './sub-domains/reviews/reviews.repository.js';
import { ReviewsService } from './sub-domains/reviews/reviews.service.js';
import { FeedbackActionsRepository } from './sub-domains/feedback-actions/feedback-actions.repository.js';
import { FeedbackActionsService } from './sub-domains/feedback-actions/feedback-actions.service.js';
import { ManufacturersRepository } from './sub-domains/manufacturers/manufacturers.repository.js';
import { ManufacturersService } from './sub-domains/manufacturers/manufacturers.service.js';
import { SuppliersRepository } from './sub-domains/suppliers/suppliers.repository.js';
import { SuppliersService } from './sub-domains/suppliers/suppliers.service.js';
import { MedicalRepsRepository } from './sub-domains/medical-reps/medical-reps.repository.js';
import { MedicalRepsService } from './sub-domains/medical-reps/medical-reps.service.js';
import { MedicalRepVisitsRepository } from './sub-domains/medical-rep-visits/medical-rep-visits.repository.js';
import { MedicalRepVisitsService } from './sub-domains/medical-rep-visits/medical-rep-visits.service.js';
import { MedicinesRepository } from './sub-domains/medicines/medicines.repository.js';
import { MedicinesService } from './sub-domains/medicines/medicines.service.js';
import { MedicalPurchaseOrdersRepository } from './sub-domains/medical-purchase-orders/medical-purchase-orders.repository.js';
import { MedicalPurchaseOrdersService } from './sub-domains/medical-purchase-orders/medical-purchase-orders.service.js';
import { MedicalContactsRepository } from './sub-domains/medical-contacts/medical-contacts.repository.js';
import { MedicalContactsService } from './sub-domains/medical-contacts/medical-contacts.service.js';
import { MedicalSalesRepository } from './sub-domains/medical-sales/medical-sales.repository.js';
import { MedicalSalesService } from './sub-domains/medical-sales/medical-sales.service.js';
import { SupplierCreditsRepository } from './sub-domains/supplier-credits/supplier-credits.repository.js';
import { SupplierCreditsService } from './sub-domains/supplier-credits/supplier-credits.service.js';
import { StockVendorsRepository } from './sub-domains/stock-vendors/stock-vendors.repository.js';
import { StockVendorsService } from './sub-domains/stock-vendors/stock-vendors.service.js';
import { StockItemsRepository } from './sub-domains/stock-items/stock-items.repository.js';
import { StockItemsService } from './sub-domains/stock-items/stock-items.service.js';
import { StockPurchasesRepository } from './sub-domains/stock-purchases/stock-purchases.repository.js';
import { StockPurchasesService } from './sub-domains/stock-purchases/stock-purchases.service.js';
import { StockCountsRepository } from './sub-domains/stock-counts/stock-counts.repository.js';
import { StockCountsService } from './sub-domains/stock-counts/stock-counts.service.js';
import { StockMovementsRepository } from './sub-domains/stock-movements/stock-movements.repository.js';
import { StockMovementsService } from './sub-domains/stock-movements/stock-movements.service.js';
import { TasksRepository } from './sub-domains/tasks/tasks.repository.js';
import { TasksService } from './sub-domains/tasks/tasks.service.js';

/** The services of the app record tables (launch iteration), one per table. */
export type AppRecordServices = {
  offeringGroupsService: OfferingGroupsService;
  branchRoomsService: BranchRoomsService;
  branchMachinesService: BranchMachinesService;
  branchHolidaysService: BranchHolidaysService;
  offeringsService: OfferingsService;
  offersService: OffersService;
  contactsService: ContactsService;
  contactActivitiesService: ContactActivitiesService;
  contactMessageTemplatesService: ContactMessageTemplatesService;
  patientsService: PatientsService;
  leadsService: LeadsService;
  appointmentsService: AppointmentsService;
  visitsService: VisitsService;
  diagnosesService: DiagnosesService;
  patientClinicalNotesService: PatientClinicalNotesService;
  prescriptionsService: PrescriptionsService;
  prescriptionKitsService: PrescriptionKitsService;
  patientImagesService: PatientImagesService;
  patientReportsService: PatientReportsService;
  patientNotesService: PatientNotesService;
  invoicesService: InvoicesService;
  patientPackagesService: PatientPackagesService;
  offeringSuggestionsService: OfferingSuggestionsService;
  paymentsService: PaymentsService;
  creditNotesService: CreditNotesService;
  pendingCreditsService: PendingCreditsService;
  dayClosesService: DayClosesService;
  treatmentsService: TreatmentsService;
  checkInsService: CheckInsService;
  reviewsService: ReviewsService;
  feedbackActionsService: FeedbackActionsService;
  manufacturersService: ManufacturersService;
  suppliersService: SuppliersService;
  medicalRepsService: MedicalRepsService;
  medicalRepVisitsService: MedicalRepVisitsService;
  medicinesService: MedicinesService;
  medicalPurchaseOrdersService: MedicalPurchaseOrdersService;
  medicalContactsService: MedicalContactsService;
  medicalSalesService: MedicalSalesService;
  supplierCreditsService: SupplierCreditsService;
  stockVendorsService: StockVendorsService;
  stockItemsService: StockItemsService;
  stockPurchasesService: StockPurchasesService;
  stockCountsService: StockCountsService;
  stockMovementsService: StockMovementsService;
  tasksService: TasksService;
};

/**
 * The services of the places, offerings and people every booking and bill picks from — a branch's
 * rooms, machines and holidays (§1), the offering groups, offerings and offers (§3), and the
 * contacts with their activity and message templates (§4).
 */
function createPlaceOfferingContactServices(organizationService: OrganizationService) {
  return {
    offeringGroupsService: new OfferingGroupsService(
      organizationService,
      new OfferingGroupsRepository(),
    ),
    branchRoomsService: new BranchRoomsService(organizationService, new BranchRoomsRepository()),
    branchMachinesService: new BranchMachinesService(
      organizationService,
      new BranchMachinesRepository(),
    ),
    branchHolidaysService: new BranchHolidaysService(
      organizationService,
      new BranchHolidaysRepository(),
    ),
    offeringsService: new OfferingsService(organizationService, new OfferingsRepository()),
    offersService: new OffersService(organizationService, new OffersRepository()),
    contactsService: new ContactsService(organizationService, new ContactsRepository()),
    contactActivitiesService: new ContactActivitiesService(
      organizationService,
      new ContactActivitiesRepository(),
    ),
    contactMessageTemplatesService: new ContactMessageTemplatesService(
      organizationService,
      new ContactMessageTemplatesRepository(),
    ),
  };
}

/** Builds every app record table's service on its repository. */
export function createAppRecordServices(
  organizationService: OrganizationService,
): AppRecordServices {
  return {
    ...createPlaceOfferingContactServices(organizationService),
    patientsService: new PatientsService(organizationService, new PatientsRepository()),
    leadsService: new LeadsService(organizationService, new LeadsRepository()),
    appointmentsService: new AppointmentsService(organizationService, new AppointmentsRepository()),
    visitsService: new VisitsService(organizationService, new VisitsRepository()),
    diagnosesService: new DiagnosesService(organizationService, new DiagnosesRepository()),
    patientClinicalNotesService: new PatientClinicalNotesService(
      organizationService,
      new PatientClinicalNotesRepository(),
    ),
    prescriptionsService: new PrescriptionsService(
      organizationService,
      new PrescriptionsRepository(),
    ),
    prescriptionKitsService: new PrescriptionKitsService(
      organizationService,
      new PrescriptionKitsRepository(),
    ),
    patientImagesService: new PatientImagesService(
      organizationService,
      new PatientImagesRepository(),
    ),
    patientReportsService: new PatientReportsService(
      organizationService,
      new PatientReportsRepository(),
    ),
    patientNotesService: new PatientNotesService(organizationService, new PatientNotesRepository()),
    invoicesService: new InvoicesService(organizationService, new InvoicesRepository()),
    patientPackagesService: new PatientPackagesService(
      organizationService,
      new PatientPackagesRepository(),
    ),
    offeringSuggestionsService: new OfferingSuggestionsService(
      organizationService,
      new OfferingSuggestionsRepository(),
    ),
    paymentsService: new PaymentsService(organizationService, new PaymentsRepository()),
    creditNotesService: new CreditNotesService(organizationService, new CreditNotesRepository()),
    pendingCreditsService: new PendingCreditsService(
      organizationService,
      new PendingCreditsRepository(),
    ),
    dayClosesService: new DayClosesService(organizationService, new DayClosesRepository()),
    treatmentsService: new TreatmentsService(organizationService, new TreatmentsRepository()),
    checkInsService: new CheckInsService(organizationService, new CheckInsRepository()),
    reviewsService: new ReviewsService(organizationService, new ReviewsRepository()),
    feedbackActionsService: new FeedbackActionsService(
      organizationService,
      new FeedbackActionsRepository(),
    ),
    manufacturersService: new ManufacturersService(
      organizationService,
      new ManufacturersRepository(),
    ),
    suppliersService: new SuppliersService(organizationService, new SuppliersRepository()),
    medicalRepsService: new MedicalRepsService(organizationService, new MedicalRepsRepository()),
    medicalRepVisitsService: new MedicalRepVisitsService(
      organizationService,
      new MedicalRepVisitsRepository(),
    ),
    medicinesService: new MedicinesService(organizationService, new MedicinesRepository()),
    medicalPurchaseOrdersService: new MedicalPurchaseOrdersService(
      organizationService,
      new MedicalPurchaseOrdersRepository(),
    ),
    medicalContactsService: new MedicalContactsService(
      organizationService,
      new MedicalContactsRepository(),
    ),
    medicalSalesService: new MedicalSalesService(organizationService, new MedicalSalesRepository()),
    supplierCreditsService: new SupplierCreditsService(
      organizationService,
      new SupplierCreditsRepository(),
    ),
    stockVendorsService: new StockVendorsService(organizationService, new StockVendorsRepository()),
    stockItemsService: new StockItemsService(organizationService, new StockItemsRepository()),
    stockPurchasesService: new StockPurchasesService(
      organizationService,
      new StockPurchasesRepository(),
    ),
    stockCountsService: new StockCountsService(organizationService, new StockCountsRepository()),
    stockMovementsService: new StockMovementsService(
      organizationService,
      new StockMovementsRepository(),
    ),
    tasksService: new TasksService(organizationService, new TasksRepository()),
  };
}

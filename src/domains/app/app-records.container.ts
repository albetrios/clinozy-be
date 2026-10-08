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
import { PatientDiagnosesRepository } from './sub-domains/patients/patient-diagnoses/patient-diagnoses.repository.js';
import { PatientDiagnosesService } from './sub-domains/patients/patient-diagnoses/patient-diagnoses.service.js';
import { PatientClinicalNotesRepository } from './sub-domains/patients/patient-clinical-notes/patient-clinical-notes.repository.js';
import { PatientClinicalNotesService } from './sub-domains/patients/patient-clinical-notes/patient-clinical-notes.service.js';
import { PatientPrescriptionsRepository } from './sub-domains/patients/patient-prescriptions/patient-prescriptions.repository.js';
import { PatientPrescriptionsService } from './sub-domains/patients/patient-prescriptions/patient-prescriptions.service.js';
import { PrescriptionKitsRepository } from './sub-domains/patients/prescription-kits/prescription-kits.repository.js';
import { PrescriptionKitsService } from './sub-domains/patients/prescription-kits/prescription-kits.service.js';
import { PatientImagesRepository } from './sub-domains/patients/patient-images/patient-images.repository.js';
import { PatientImagesService } from './sub-domains/patients/patient-images/patient-images.service.js';
import { PatientReportsRepository } from './sub-domains/patients/patient-reports/patient-reports.repository.js';
import { PatientReportsService } from './sub-domains/patients/patient-reports/patient-reports.service.js';
import {
  type BillingServices,
  createBillingServices,
} from './sub-domains/billing/billing.container.js';
import { PatientOfferingsRepository } from './sub-domains/patients/patient-offerings/patient-offerings.repository.js';
import { PatientOfferingsService } from './sub-domains/patients/patient-offerings/patient-offerings.service.js';
import { PatientOfferingSuggestionsRepository } from './sub-domains/patients/patient-offering-suggestions/patient-offering-suggestions.repository.js';
import { PatientOfferingSuggestionsService } from './sub-domains/patients/patient-offering-suggestions/patient-offering-suggestions.service.js';
import { PatientTreatmentsRepository } from './sub-domains/patients/patient-treatments/patient-treatments.repository.js';
import { PatientTreatmentsService } from './sub-domains/patients/patient-treatments/patient-treatments.service.js';
import { PatientCheckInsRepository } from './sub-domains/patients/patient-check-ins/patient-check-ins.repository.js';
import { PatientCheckInsService } from './sub-domains/patients/patient-check-ins/patient-check-ins.service.js';
import { PatientReviewsRepository } from './sub-domains/patients/patient-reviews/patient-reviews.repository.js';
import { PatientReviewsService } from './sub-domains/patients/patient-reviews/patient-reviews.service.js';
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
export type AppRecordServices = BillingServices & {
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
  patientDiagnosesService: PatientDiagnosesService;
  patientClinicalNotesService: PatientClinicalNotesService;
  patientPrescriptionsService: PatientPrescriptionsService;
  prescriptionKitsService: PrescriptionKitsService;
  patientImagesService: PatientImagesService;
  patientReportsService: PatientReportsService;
  patientOfferingsService: PatientOfferingsService;
  patientOfferingSuggestionsService: PatientOfferingSuggestionsService;
  patientTreatmentsService: PatientTreatmentsService;
  patientCheckInsService: PatientCheckInsService;
  patientReviewsService: PatientReviewsService;
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

/**
 * The services of a patient file's nested records (§7): the diagnosis catalogue, clinical notes,
 * prescriptions and kits, photos, reports, treatment sessions, check-ins, reviews, what the patient
 * bought and the plan.
 */
function createPatientFileServices(organizationService: OrganizationService) {
  return {
    patientDiagnosesService: new PatientDiagnosesService(
      organizationService,
      new PatientDiagnosesRepository(),
    ),
    patientClinicalNotesService: new PatientClinicalNotesService(
      organizationService,
      new PatientClinicalNotesRepository(),
    ),
    patientPrescriptionsService: new PatientPrescriptionsService(
      organizationService,
      new PatientPrescriptionsRepository(),
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
    patientTreatmentsService: new PatientTreatmentsService(
      organizationService,
      new PatientTreatmentsRepository(),
    ),
    patientCheckInsService: new PatientCheckInsService(
      organizationService,
      new PatientCheckInsRepository(),
    ),
    patientReviewsService: new PatientReviewsService(
      organizationService,
      new PatientReviewsRepository(),
    ),
    patientOfferingsService: new PatientOfferingsService(
      organizationService,
      new PatientOfferingsRepository(),
    ),
    patientOfferingSuggestionsService: new PatientOfferingSuggestionsService(
      organizationService,
      new PatientOfferingSuggestionsRepository(),
    ),
  };
}

/** Builds every app record table's service on its repository. */
export function createAppRecordServices(
  organizationService: OrganizationService,
): AppRecordServices {
  const placeOfferingContactServices = createPlaceOfferingContactServices(organizationService);
  return {
    ...placeOfferingContactServices,
    patientsService: new PatientsService(
      organizationService,
      new PatientsRepository(),
      placeOfferingContactServices.contactsService,
    ),
    leadsService: new LeadsService(
      organizationService,
      new LeadsRepository(),
      placeOfferingContactServices.contactsService,
    ),
    appointmentsService: new AppointmentsService(organizationService, new AppointmentsRepository()),
    ...createPatientFileServices(organizationService),
    ...createBillingServices(organizationService),
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

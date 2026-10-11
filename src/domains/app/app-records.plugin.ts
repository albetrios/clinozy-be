import type { FastifyInstance } from 'fastify';
import type { AppRecordServices } from './app-records.container.js';
import { offeringGroupsRoutes } from './sub-domains/offerings/offering-groups/offering-groups.routes.js';
import { branchRoomsRoutes } from './sub-domains/branches/branch-rooms/branch-rooms.routes.js';
import { branchMachinesRoutes } from './sub-domains/branches/branch-machines/branch-machines.routes.js';
import { branchHolidaysRoutes } from './sub-domains/branches/branch-holidays/branch-holidays.routes.js';
import { offeringsRoutes } from './sub-domains/offerings/offerings.routes.js';
import { offersRoutes } from './sub-domains/offerings/offers/offers.routes.js';
import { contactsRoutes } from './sub-domains/contacts/contacts.routes.js';
import { patientsRoutes } from './sub-domains/patients/patients.routes.js';
import { leadsRoutes } from './sub-domains/leads/leads.routes.js';
import { contactActivitiesRoutes } from './sub-domains/contacts/contact-activities/contact-activities.routes.js';
import { contactMessageTemplatesRoutes } from './sub-domains/contacts/contact-message-templates/contact-message-templates.routes.js';
import { appointmentsRoutes } from './sub-domains/appointments/appointments.routes.js';
import { patientDiagnosesRoutes } from './sub-domains/patients/patient-diagnoses/patient-diagnoses.routes.js';
import { patientClinicalNotesRoutes } from './sub-domains/patients/patient-clinical-notes/patient-clinical-notes.routes.js';
import { patientPrescriptionsRoutes } from './sub-domains/patients/patient-prescriptions/patient-prescriptions.routes.js';
import { prescriptionKitsRoutes } from './sub-domains/patients/prescription-kits/prescription-kits.routes.js';
import { patientImagesRoutes } from './sub-domains/patients/patient-images/patient-images.routes.js';
import { patientReportsRoutes } from './sub-domains/patients/patient-reports/patient-reports.routes.js';
import { billingRoutes } from './sub-domains/billing/billing.routes.js';
import { patientOfferingsRoutes } from './sub-domains/patients/patient-offerings/patient-offerings.routes.js';
import { patientOfferingSuggestionsRoutes } from './sub-domains/patients/patient-offering-suggestions/patient-offering-suggestions.routes.js';
import { patientTreatmentsRoutes } from './sub-domains/patients/patient-treatments/patient-treatments.routes.js';
import { patientCheckInsRoutes } from './sub-domains/patients/patient-check-ins/patient-check-ins.routes.js';
import { patientReviewsRoutes } from './sub-domains/patients/patient-reviews/patient-reviews.routes.js';
import { medicalRoutes } from './sub-domains/medical/medical.routes.js';
import { stockRoutes } from './sub-domains/stock/stock.routes.js';
import { tasksRoutes } from './sub-domains/tasks/tasks.routes.js';

/** Registers every app record table's routes on the `/api/v1/app` plugin. */
export async function registerAppRecordRoutes({
  app,
  services,
}: {
  app: FastifyInstance;
  services: AppRecordServices;
}): Promise<void> {
  await app.register(offeringGroupsRoutes(services.offeringGroupsService));
  await app.register(branchRoomsRoutes(services.branchRoomsService));
  await app.register(branchMachinesRoutes(services.branchMachinesService));
  await app.register(branchHolidaysRoutes(services.branchHolidaysService));
  await app.register(offeringsRoutes(services.offeringsService));
  await app.register(offersRoutes(services.offersService));
  await app.register(contactsRoutes(services.contactsService));
  await app.register(contactActivitiesRoutes(services.contactActivitiesService));
  await app.register(contactMessageTemplatesRoutes(services.contactMessageTemplatesService));
  await app.register(patientsRoutes(services.patientsService));
  await app.register(leadsRoutes(services.leadsService));
  await app.register(appointmentsRoutes(services.appointmentsService));
  await app.register(patientDiagnosesRoutes(services.patientDiagnosesService));
  await app.register(patientClinicalNotesRoutes(services.patientClinicalNotesService));
  await app.register(patientPrescriptionsRoutes(services.patientPrescriptionsService));
  await app.register(prescriptionKitsRoutes(services.prescriptionKitsService));
  await app.register(patientImagesRoutes(services.patientImagesService));
  await app.register(patientReportsRoutes(services.patientReportsService));
  await app.register(billingRoutes(services));
  await app.register(patientOfferingsRoutes(services.patientOfferingsService));
  await app.register(patientOfferingSuggestionsRoutes(services.patientOfferingSuggestionsService));
  await app.register(patientTreatmentsRoutes(services.patientTreatmentsService));
  await app.register(patientCheckInsRoutes(services.patientCheckInsService));
  await app.register(patientReviewsRoutes(services.patientReviewsService));
  await app.register(medicalRoutes(services));
  await app.register(stockRoutes(services));
  await app.register(tasksRoutes(services.tasksService));
}

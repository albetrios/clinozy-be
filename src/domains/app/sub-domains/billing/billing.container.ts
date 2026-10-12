import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { DayClosesRepository } from './day-closes/day-closes.repository.js';
import { DayClosesService } from './day-closes/day-closes.service.js';
import { InvoiceCreditNotesRepository } from './invoice-credit-notes/invoice-credit-notes.repository.js';
import { InvoiceCreditNotesService } from './invoice-credit-notes/invoice-credit-notes.service.js';
import { InvoicesRepository } from './invoices/invoices.repository.js';
import { InvoicesService } from './invoices/invoices.service.js';
import { PaymentsRepository } from './payments/payments.repository.js';
import { PaymentsService } from './payments/payments.service.js';
import { PendingCreditsRepository } from './pending-credits/pending-credits.repository.js';
import { PendingCreditsService } from './pending-credits/pending-credits.service.js';

/** The billing services (launch ROUTE #136, routes-final 8): one per nested sub-domain. */
export type BillingServices = {
  invoicesService: InvoicesService;
  invoiceCreditNotesService: InvoiceCreditNotesService;
  paymentsService: PaymentsService;
  pendingCreditsService: PendingCreditsService;
  dayClosesService: DayClosesService;
};

/**
 * Builds the billing services on their repositories — bills, credit notes, payments, pending
 * credits and day closes (routes-final 8.A–8.E).
 *
 * @remarks
 * - **Algorithm:** one repository per service; credit notes read their invoice through
 *   {@link InvoicesService} (B4 — the branch is the invoice's).
 */
export function createBillingServices(organizationService: OrganizationService): BillingServices {
  const invoicesService = new InvoicesService(organizationService, new InvoicesRepository());
  return {
    invoicesService,
    invoiceCreditNotesService: new InvoiceCreditNotesService(
      organizationService,
      new InvoiceCreditNotesRepository(),
      invoicesService,
    ),
    paymentsService: new PaymentsService(organizationService, new PaymentsRepository()),
    pendingCreditsService: new PendingCreditsService(
      organizationService,
      new PendingCreditsRepository(),
    ),
    dayClosesService: new DayClosesService(organizationService, new DayClosesRepository()),
  };
}

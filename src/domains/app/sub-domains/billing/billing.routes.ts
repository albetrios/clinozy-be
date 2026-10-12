import type { FastifyPluginAsync } from 'fastify';
import type { BillingServices } from './billing.container.js';
import { dayClosesRoutes } from './day-closes/day-closes.routes.js';
import { invoiceCreditNotesRoutes } from './invoice-credit-notes/invoice-credit-notes.routes.js';
import { invoicesRoutes } from './invoices/invoices.routes.js';
import { paymentsRoutes } from './payments/payments.routes.js';
import { pendingCreditsRoutes } from './pending-credits/pending-credits.routes.js';

/**
 * Registers the billing routes (prefix `/api/v1/app`) — routes-final 8, routes 1–32: invoices,
 * credit notes, payments, pending credits and day closes.
 */
export function billingRoutes(services: BillingServices): FastifyPluginAsync {
  return async (app) => {
    await app.register(invoicesRoutes(services.invoicesService));
    await app.register(invoiceCreditNotesRoutes(services.invoiceCreditNotesService));
    await app.register(paymentsRoutes(services.paymentsService));
    await app.register(pendingCreditsRoutes(services.pendingCreditsService));
    await app.register(dayClosesRoutes(services.dayClosesService));
  };
}

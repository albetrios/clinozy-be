import type { FastifyPluginAsync } from 'fastify';
import type { PaymentsService } from '@/domains/app/sub-domains/billing/payments/payments.service.js';
import type { PendingCreditsService } from '@/domains/app/sub-domains/billing/pending-credits/pending-credits.service.js';
import type { MedicalServices } from './medical.container.js';
import { manufacturersRoutes } from './manufacturers/manufacturers.routes.js';
import { medicalPaymentsRoutes } from './medical-payments/medical-payments.routes.js';
import { medicalPurchaseOrdersRoutes } from './medical-purchase-orders/medical-purchase-orders.routes.js';
import { medicalRepVisitsRoutes } from './medical-reps/medical-rep-visits/medical-rep-visits.routes.js';
import { medicalRepsRoutes } from './medical-reps/medical-reps.routes.js';
import { medicalSalesRoutes } from './medical-sales/medical-sales.routes.js';
import { medicinesRoutes } from './medicines/medicines.routes.js';
import { supplierCreditsRoutes } from './suppliers/supplier-credits/supplier-credits.routes.js';
import { suppliersRoutes } from './suppliers/suppliers.routes.js';

/**
 * Registers the medical store's routes (prefix `/api/v1/app`) — routes-final 11 (11.A–11.I):
 * manufacturers, suppliers and their credits, medicines, orders, MRs and their visits, sales, and
 * the store's payments and customer credits (the ledger's and the pending credits' slices, MD31,
 * MD32).
 */
export function medicalRoutes(
  services: MedicalServices & {
    paymentsService: PaymentsService;
    pendingCreditsService: PendingCreditsService;
  },
): FastifyPluginAsync {
  return async (app) => {
    await app.register(manufacturersRoutes(services.manufacturersService));
    await app.register(suppliersRoutes(services.suppliersService));
    await app.register(supplierCreditsRoutes(services.supplierCreditsService));
    await app.register(medicinesRoutes(services.medicinesService));
    await app.register(medicalPurchaseOrdersRoutes(services.medicalPurchaseOrdersService));
    await app.register(medicalRepsRoutes(services.medicalRepsService));
    await app.register(medicalRepVisitsRoutes(services.medicalRepVisitsService));
    await app.register(medicalSalesRoutes(services.medicalSalesService));
    await app.register(medicalPaymentsRoutes(services));
  };
}

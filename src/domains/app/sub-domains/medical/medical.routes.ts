import type { FastifyPluginAsync } from 'fastify';
import type { PaymentsService } from '@/domains/app/sub-domains/billing/payments/payments.service.js';
import type { MedicalServices } from './medical.container.js';
import { manufacturersRoutes } from './manufacturers/manufacturers.routes.js';
import { medicalPurchaseOrdersRoutes } from './medical-purchase-orders/medical-purchase-orders.routes.js';
import { medicalRepVisitsRoutes } from './medical-reps/medical-rep-visits/medical-rep-visits.routes.js';
import { medicalRepsRoutes } from './medical-reps/medical-reps.routes.js';
import { medicalSalesRoutes } from './medical-sales/medical-sales.routes.js';
import { medicinesRoutes } from './medicines/medicines.routes.js';
import { supplierCreditsRoutes } from './suppliers/supplier-credits/supplier-credits.routes.js';
import { suppliersRoutes } from './suppliers/suppliers.routes.js';

/**
 * Registers the medical store's routes (prefix `/api/v1/app`) — routes-final 11, routes 1–51:
 * manufacturers, suppliers and their credits, medicines, orders, MRs and their visits, sales and
 * the store's payments.
 */
export function medicalRoutes(
  services: MedicalServices & { paymentsService: PaymentsService },
): FastifyPluginAsync {
  return async (app) => {
    await app.register(manufacturersRoutes(services.manufacturersService));
    await app.register(suppliersRoutes(services.suppliersService));
    await app.register(supplierCreditsRoutes(services.supplierCreditsService));
    await app.register(medicinesRoutes(services.medicinesService));
    await app.register(medicalPurchaseOrdersRoutes(services.medicalPurchaseOrdersService));
    await app.register(medicalRepsRoutes(services.medicalRepsService));
    await app.register(medicalRepVisitsRoutes(services.medicalRepVisitsService));
    await app.register(medicalSalesRoutes(services));
  };
}

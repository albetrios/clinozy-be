import type { OrganizationService } from '@/domains/tenancy/sub-domains/organization/organization.service.js';
import { ManufacturersRepository } from './manufacturers/manufacturers.repository.js';
import { ManufacturersService } from './manufacturers/manufacturers.service.js';
import { MedicalPurchaseOrdersRepository } from './medical-purchase-orders/medical-purchase-orders.repository.js';
import { MedicalPurchaseOrdersService } from './medical-purchase-orders/medical-purchase-orders.service.js';
import { MedicalRepVisitsRepository } from './medical-reps/medical-rep-visits/medical-rep-visits.repository.js';
import { MedicalRepVisitsService } from './medical-reps/medical-rep-visits/medical-rep-visits.service.js';
import { MedicalRepsRepository } from './medical-reps/medical-reps.repository.js';
import { MedicalRepsService } from './medical-reps/medical-reps.service.js';
import { MedicalSalesRepository } from './medical-sales/medical-sales.repository.js';
import { MedicalSalesService } from './medical-sales/medical-sales.service.js';
import { MedicinesRepository } from './medicines/medicines.repository.js';
import { MedicinesService } from './medicines/medicines.service.js';
import { SupplierCreditsRepository } from './suppliers/supplier-credits/supplier-credits.repository.js';
import { SupplierCreditsService } from './suppliers/supplier-credits/supplier-credits.service.js';
import { SuppliersRepository } from './suppliers/suppliers.repository.js';
import { SuppliersService } from './suppliers/suppliers.service.js';

/** The medical store's services (launch ROUTE #153, routes-final 11): one per nested sub-domain. */
export type MedicalServices = {
  manufacturersService: ManufacturersService;
  suppliersService: SuppliersService;
  supplierCreditsService: SupplierCreditsService;
  medicinesService: MedicinesService;
  medicalPurchaseOrdersService: MedicalPurchaseOrdersService;
  medicalRepsService: MedicalRepsService;
  medicalRepVisitsService: MedicalRepVisitsService;
  medicalSalesService: MedicalSalesService;
};

/**
 * Builds the medical store's services on their repositories — manufacturers, suppliers and their
 * credits, medicines, orders, MRs and their visits, and sales (routes-final 11.A–11.H).
 *
 * @remarks
 * - **Algorithm:** one repository per service; every writer moves a batch and its medicine
 *   together (MD4), and money goes through the billing ledger (MD7).
 */
export function createMedicalServices(organizationService: OrganizationService): MedicalServices {
  return {
    manufacturersService: new ManufacturersService(
      organizationService,
      new ManufacturersRepository(),
    ),
    suppliersService: new SuppliersService(organizationService, new SuppliersRepository()),
    supplierCreditsService: new SupplierCreditsService(
      organizationService,
      new SupplierCreditsRepository(),
    ),
    medicinesService: new MedicinesService(organizationService, new MedicinesRepository()),
    medicalPurchaseOrdersService: new MedicalPurchaseOrdersService(
      organizationService,
      new MedicalPurchaseOrdersRepository(),
    ),
    medicalRepsService: new MedicalRepsService(organizationService, new MedicalRepsRepository()),
    medicalRepVisitsService: new MedicalRepVisitsService(
      organizationService,
      new MedicalRepVisitsRepository(),
    ),
    medicalSalesService: new MedicalSalesService(organizationService, new MedicalSalesRepository()),
  };
}

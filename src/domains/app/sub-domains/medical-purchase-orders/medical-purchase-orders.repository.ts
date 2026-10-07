import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { medical_purchase_orders } from './medical-purchase-orders.schema.js';

/** Persistence for `app.medical_purchase_orders` — the shared app record reads and writes, on its table. */
export class MedicalPurchaseOrdersRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: medical_purchase_orders,
      entity: 'medicalPurchaseOrder',
      searchColumns: ['supplier_bill_number'],
      numberColumn: 'purchase_order_number',
      sortColumns: { created_at: 'created_at', order_date: 'text' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}

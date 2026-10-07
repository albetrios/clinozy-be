import {
  BaseRecordRepository,
  type BaseRecordLinkTable,
} from '@/domains/app/base-record.repository.js';
import { suppliers, supplier_manufacturers } from './suppliers.schema.js';
import { manufacturers } from '@/domains/app/sub-domains/manufacturers/manufacturers.schema.js';

/** The `manufacturer_ids` link of a supplier (`app.supplier_manufacturers`). */
export const SUPPLIER_MANUFACTURERS_LINK: BaseRecordLinkTable = {
  table: supplier_manufacturers,
  ownerColumn: 'supplier_id',
  targetColumn: 'manufacturer_id',
  targetTable: manufacturers,
};

/** Persistence for `app.suppliers` — the shared app record reads and writes, on its table. */
export class SuppliersRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: suppliers,
      entity: 'supplier',
      searchColumns: ['name'],
      sortColumns: { created_at: 'created_at', name: 'text' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}

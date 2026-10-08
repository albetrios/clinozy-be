import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { offering_groups } from './offering-groups.schema.js';

/**
 * Persistence for `app.offering_groups` — the shared app record reads and writes, on its table.
 * The list's default order is the menu's: `sort_order`, then name (O8).
 */
export class OfferingGroupsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: offering_groups,
      entity: 'offeringGroup',
      searchColumns: ['name'],
      sortColumns: { created_at: 'created_at', name: 'text' },
      sortKeys: {
        sort_order: { keys: [{ value: 'sort_order' }, { value: 'name' }], defaultOrder: 'asc' },
      },
      defaultSort: 'sort_order',
      defaultOrder: 'desc',
    });
  }
}

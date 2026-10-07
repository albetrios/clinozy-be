import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { offering_groups } from './offering-groups.schema.js';

/** Persistence for `app.offering_groups` — the shared app record reads and writes, on its table. */
export class OfferingGroupsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: offering_groups,
      entity: 'offeringGroup',
      searchColumns: ['name'],
      sortColumns: { created_at: 'created_at', name: 'text', sort_order: 'text' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}

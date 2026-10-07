import {
  BaseRecordRepository,
  type BaseRecordLinkTable,
} from '@/domains/app/base-record.repository.js';
import { offerings, offering_branches } from './offerings.schema.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';

/** The `branch_ids` link of a offering (`app.offering_branches`). */
export const OFFERING_BRANCHES_LINK: BaseRecordLinkTable = {
  table: offering_branches,
  ownerColumn: 'offering_id',
  targetColumn: 'branch_id',
  targetTable: branches,
};

/** Persistence for `app.offerings` — the shared app record reads and writes, on its table. */
export class OfferingsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: offerings,
      entity: 'offering',
      searchColumns: ['name'],
      numberColumn: 'offering_number',
      sortColumns: { created_at: 'created_at', name: 'text' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}

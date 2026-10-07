import {
  BaseRecordRepository,
  type BaseRecordLinkTable,
} from '@/domains/app/base-record.repository.js';
import { check_ins, check_in_next_offerings } from './check-ins.schema.js';
import { offerings } from '@/domains/app/sub-domains/offerings/offerings.schema.js';

/** The `next_offering_ids` link of a check-in (`app.check_in_next_offerings`). */
export const CHECK_IN_NEXT_OFFERINGS_LINK: BaseRecordLinkTable = {
  table: check_in_next_offerings,
  ownerColumn: 'check_in_id',
  targetColumn: 'next_offering_id',
  targetTable: offerings,
};

/** Persistence for `app.check_ins` — the shared app record reads and writes, on its table. */
export class CheckInsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: check_ins,
      entity: 'checkIn',
      searchColumns: [],
      sortColumns: { created_at: 'created_at', check_in_date: 'text' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}

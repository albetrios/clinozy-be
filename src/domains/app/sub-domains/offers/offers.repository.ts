import {
  BaseRecordRepository,
  type BaseRecordLinkTable,
} from '@/domains/app/base-record.repository.js';
import { offers, offer_offerings, offer_branches } from './offers.schema.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { offerings } from '@/domains/app/sub-domains/offerings/offerings.schema.js';

/** The `offering_ids` link of a offer (`app.offer_offerings`). */
export const OFFER_OFFERINGS_LINK: BaseRecordLinkTable = {
  table: offer_offerings,
  ownerColumn: 'offer_id',
  targetColumn: 'offering_id',
  targetTable: offerings,
};

/** The `branch_ids` link of a offer (`app.offer_branches`). */
export const OFFER_BRANCHES_LINK: BaseRecordLinkTable = {
  table: offer_branches,
  ownerColumn: 'offer_id',
  targetColumn: 'branch_id',
  targetTable: branches,
};

/** Persistence for `app.offers` — the shared app record reads and writes, on its table. */
export class OffersRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: offers,
      entity: 'offer',
      searchColumns: ['name', 'code'],
      sortColumns: { created_at: 'created_at', name: 'text', starts_on: 'text' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}

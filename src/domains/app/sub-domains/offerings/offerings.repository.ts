import { inArray } from 'drizzle-orm';
import { getRequestDatabase } from '@/infrastructure/database/contexts/database-context-runtime.js';
import { toAmount } from '@/shared/utils/validation/record-fields.util.js';
import {
  BaseRecordRepository,
  type BaseRecordLinkTable,
} from '@/domains/app/base-record.repository.js';
import { offerings, offering_branches } from './offerings.schema.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';

/** The `branch_ids` link of an offering (`app.offering_branches`) — none = every branch (O5). */
export const OFFERING_BRANCHES_LINK: BaseRecordLinkTable = {
  table: offering_branches,
  ownerColumn: 'offering_id',
  targetColumn: 'branch_id',
  targetTable: branches,
};

/** An offering's name and prices — what a record that names it shows and totals (rupees). */
export interface OfferingSummary {
  name: string;
  price: number;
  offer_price: number | null;
  min_price: number;
}

/**
 * Persistence for `app.offerings` — the shared app record reads and writes, on its table; `q`
 * matches the name, the search terms (O9) or the number.
 */
export class OfferingsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: offerings,
      entity: 'offering',
      searchColumns: ['name', 'search_terms'],
      numberColumn: 'offering_number',
      sortColumns: { created_at: 'created_at', name: 'text' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }

  /**
   * The name and prices of offerings by public id — deleted and inactive ones too, since a record
   * keeps naming what it pointed at (a patient offering, a plan row).
   */
  async findSummaries(publicIds: readonly string[]): Promise<Map<string, OfferingSummary>> {
    const unique = [...new Set(publicIds)];
    if (unique.length === 0) return new Map();
    const rows = await getRequestDatabase()
      .select({
        public_id: offerings.public_id,
        name: offerings.name,
        price: offerings.price,
        offer_price: offerings.offer_price,
        min_price: offerings.min_price,
      })
      .from(offerings)
      .where(inArray(offerings.public_id, unique));
    return new Map(
      rows.map((row) => [
        row.public_id,
        {
          name: row.name,
          price: toAmount(row.price) ?? 0,
          offer_price: toAmount(row.offer_price),
          min_price: toAmount(row.min_price) ?? 0,
        },
      ]),
    );
  }
}

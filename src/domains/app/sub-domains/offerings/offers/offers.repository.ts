import { type SQL, sql } from 'drizzle-orm';
import {
  BaseRecordRepository,
  type BaseRecordLinkTable,
} from '@/domains/app/base-record.repository.js';
import { organizations } from '@/domains/tenancy/sub-domains/organization/organization.schema.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';
import { offerings } from '@/domains/app/sub-domains/offerings/offerings.schema.js';
import { offers, offer_offerings, offer_branches } from './offers.schema.js';
import { OFFER_STATUS, OFFER_STATUS_VALUES, type OfferStatus } from './offers.constants.js';

/** The `offering_ids` link of an offer (`app.offer_offerings`) — 1–50 active offerings (O12). */
export const OFFER_OFFERINGS_LINK: BaseRecordLinkTable = {
  table: offer_offerings,
  ownerColumn: 'offer_id',
  targetColumn: 'offering_id',
  targetTable: offerings,
};

/** The `branch_ids` link of an offer (`app.offer_branches`) — none = every branch (O5). */
export const OFFER_BRANCHES_LINK: BaseRecordLinkTable = {
  table: offer_branches,
  ownerColumn: 'offer_id',
  targetColumn: 'branch_id',
  targetTable: branches,
};

/** The organization's today in SQL — an offer's status turns at the organization's midnight (D41). */
function organizationToday(organizationId: number): SQL {
  return sql`(now() AT TIME ZONE (select ${organizations.timezone} from ${organizations} where ${organizations.id} = ${organizationId}))::date`;
}

/** A status's place in the list's default order (Live → Scheduled → Paused → Ended, O10). */
function statusRank(status: OfferStatus): number {
  return OFFER_STATUS_VALUES.indexOf(status);
}

/**
 * An offer's derived status as its rank, in SQL — the same rule as `offerStatusOn`: paused when
 * switched off, else scheduled before its start, ended after its end, live in between.
 */
function statusRankSql(organizationId: number): SQL {
  const today = organizationToday(organizationId);
  return sql`case
    when not ${offers.is_active} then ${sql.raw(String(statusRank(OFFER_STATUS.PAUSED)))}
    when ${offers.starts_on} > ${today} then ${sql.raw(String(statusRank(OFFER_STATUS.SCHEDULED)))}
    when ${offers.ends_on} < ${today} then ${sql.raw(String(statusRank(OFFER_STATUS.ENDED)))}
    else ${sql.raw(String(statusRank(OFFER_STATUS.LIVE)))} end`;
}

/**
 * Persistence for `app.offers` — the shared app record reads and writes, on its table. The list's
 * default order is the derived status (Live → Scheduled → Paused → Ended), newest first inside
 * each (O10); `sort=starts_on` keeps offers without a start (an empty start sorts earliest).
 */
export class OffersRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: offers,
      entity: 'offer',
      searchColumns: ['name', 'code'],
      sortColumns: { created_at: 'created_at', name: 'text' },
      sortKeys: {
        status: {
          keys: [
            { value: statusRankSql, sqlType: 'integer' },
            { value: 'created_at', reversed: true },
          ],
          defaultOrder: 'asc',
        },
        starts_on: {
          keys: [
            {
              value: () => sql`coalesce(${offers.starts_on}, '-infinity'::date)`,
              sqlType: 'date',
            },
          ],
          defaultOrder: 'desc',
        },
      },
      derivedFilters: {
        status: (value, organizationId) =>
          sql`${statusRankSql(organizationId)} = ${sql.raw(String(statusRank(value as OfferStatus)))}`,
      },
      defaultSort: 'status',
      defaultOrder: 'desc',
    });
  }
}

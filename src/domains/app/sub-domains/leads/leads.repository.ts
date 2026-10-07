import {
  BaseRecordRepository,
  type BaseRecordLinkTable,
} from '@/domains/app/base-record.repository.js';
import { leads, lead_involved_memberships } from './leads.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';

/** The `involved_membership_ids` link of a lead (`app.lead_involved_memberships`). */
export const LEAD_INVOLVED_MEMBERSHIPS_LINK: BaseRecordLinkTable = {
  table: lead_involved_memberships,
  ownerColumn: 'lead_id',
  targetColumn: 'involved_membership_id',
  targetTable: memberships,
};

/** Persistence for `app.leads` — the shared app record reads and writes, on its table. */
export class LeadsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: leads,
      entity: 'lead',
      searchColumns: ['search_text'],
      numberColumn: 'lead_number',
      sortColumns: {
        created_at: 'created_at',
        name: 'text',
        follow_up_at: 'created_at',
        last_touch_at: 'created_at',
      },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}

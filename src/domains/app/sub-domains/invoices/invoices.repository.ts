import {
  BaseRecordRepository,
  type BaseRecordLinkTable,
} from '@/domains/app/base-record.repository.js';
import { invoices, invoice_team_memberships } from './invoices.schema.js';
import { memberships } from '@/domains/tenancy/sub-domains/membership/membership.schema.js';

/** The `team_membership_ids` link of a invoice (`app.invoice_team_memberships`). */
export const INVOICE_TEAM_MEMBERSHIPS_LINK: BaseRecordLinkTable = {
  table: invoice_team_memberships,
  ownerColumn: 'invoice_id',
  targetColumn: 'team_membership_id',
  targetTable: memberships,
};

/** Persistence for `app.invoices` — the shared app record reads and writes, on its table. */
export class InvoicesRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: invoices,
      entity: 'invoice',
      searchColumns: ['invoice_number'],
      numberColumn: 'invoice_sequence',
      sortColumns: { created_at: 'created_at', invoice_date: 'text' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}

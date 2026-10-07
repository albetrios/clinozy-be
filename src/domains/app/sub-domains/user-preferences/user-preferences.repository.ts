import {
  BaseRecordRepository,
  type BaseRecordLinkTable,
} from '@/domains/app/base-record.repository.js';
import { user_preferences, user_preference_branches } from './user-preferences.schema.js';
import { branches } from '@/domains/app/sub-domains/branches/branches.schema.js';

/** The `branch_filter_ids` link of a user preference (`app.user_preference_branches`). */
export const USER_PREFERENCE_BRANCHES_LINK: BaseRecordLinkTable = {
  table: user_preference_branches,
  ownerColumn: 'user_preference_id',
  targetColumn: 'branch_filter_id',
  targetTable: branches,
};

/** Persistence for `app.user_preferences` — the shared app record reads and writes, on its table. */
export class UserPreferencesRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: user_preferences,
      entity: 'userPreference',
      searchColumns: [],
      sortColumns: { created_at: 'created_at' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}

import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { reviews } from './reviews.schema.js';

/** Persistence for `app.reviews` — the shared app record reads and writes, on its table. */
export class ReviewsRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: reviews,
      entity: 'review',
      searchColumns: [],
      sortColumns: { created_at: 'created_at', review_date: 'text' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}

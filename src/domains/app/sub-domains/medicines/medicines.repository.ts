import { BaseRecordRepository } from '@/domains/app/base-record.repository.js';
import { medicines } from './medicines.schema.js';

/** Persistence for `app.medicines` — the shared app record reads and writes, on its table. */
export class MedicinesRepository extends BaseRecordRepository {
  constructor() {
    super({
      table: medicines,
      entity: 'medicine',
      searchColumns: ['name', 'composition'],
      numberColumn: 'medicine_number',
      sortColumns: { created_at: 'created_at', name: 'text' },
      defaultSort: 'created_at',
      defaultOrder: 'desc',
    });
  }
}

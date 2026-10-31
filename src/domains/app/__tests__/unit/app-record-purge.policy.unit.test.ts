import { getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { APP_RECORD_KEPT_TABLES, APP_RECORD_TABLES } from '@/domains/app/app-record-tables.js';

/** Every table the purge must never erase — a patient's clinical record or the clinic's books (G2-4). */
const NEVER_PURGED = [
  'appointments',
  'patient_clinical_notes',
  'patient_diagnoses',
  'patient_prescriptions',
  'patient_images',
  'patient_reports',
  'patient_check_ins',
  'patient_offering_suggestions',
  'patient_treatments',
  'patients',
  'invoices',
  'payments',
  'invoice_credit_notes',
  'pending_credits',
  'patient_offerings',
  'medical_sales',
  'medical_purchase_orders',
  'stock_purchases',
  'supplier_credits',
  'day_closes',
] as const;

/**
 * Policy (B1-2, G2-4 — user decision): the deleted-record purge never erases a clinical or a
 * financial table; a deleted row there is kept for good, like a patient file (P7).
 */
describe('App record purge — never a clinical or a financial table (G2-4)', () => {
  const purged = APP_RECORD_TABLES.map(({ table }) => getTableName(table));

  it('no clinical or financial table is in the purge list', () => {
    expect(purged.filter((name) => (NEVER_PURGED as readonly string[]).includes(name))).toEqual([]);
  });

  it('every kept table is clinical or financial, and none is also purged', () => {
    for (const { table, label, kind } of APP_RECORD_KEPT_TABLES) {
      const name = getTableName(table);
      expect(`app.${name}`).toBe(label);
      expect(['clinical', 'financial']).toContain(kind);
      expect(purged).not.toContain(name);
      expect(NEVER_PURGED).toContain(name);
    }
  });

  it('each purge label names its table', () => {
    for (const { table, label } of APP_RECORD_TABLES) {
      expect(label).toBe(`app.${getTableName(table)}`);
    }
  });
});

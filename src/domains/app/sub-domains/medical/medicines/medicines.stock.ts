import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';
import type { BaseRecordWriteContext } from '@/domains/app/base-record.types.js';
import { organizationToday } from '@/domains/app/sub-domains/patients/patients.rules.js';
import { ConflictError } from '@/shared/errors/index.js';
import { roundToPaise } from '@/shared/utils/validation/record-fields.util.js';
import { MEDICINE_QUANTITY_MAX } from './medicines.constants.js';
import { type MedicineBatchRow, MedicinesRepository } from './medicines.repository.js';

const medicinesRepository = new MedicinesRepository();

/** One batch a sale line draws from, and how much (MD5). */
export interface MedicineBatchDraw {
  batch: MedicineBatchRow;
  quantity: number;
}

/**
 * D6 (change-pharmacy-record-fields): what one unit of a medicine sells for — the pack's MRP over
 * its units per pack, rounded down to the paisa so a loose unit never sells above the printed MRP;
 * the MRP itself while the medicine sells whole packs.
 */
export function unitSellingRate({
  packMrp,
  unitsPerPack,
}: {
  packMrp: number;
  unitsPerPack: number;
}): number {
  if (unitsPerPack <= 1) return packMrp;
  return Math.floor(Math.round(packMrp * 100) / unitsPerPack) / 100;
}

/**
 * D5 (change-pharmacy-record-fields): what one unit cost — the pack's purchase rate over its units
 * per pack, to the paisa; the rate itself while the medicine sells whole packs.
 */
export function unitPurchaseRate({
  packRate,
  unitsPerPack,
}: {
  packRate: number;
  unitsPerPack: number;
}): number {
  if (unitsPerPack <= 1) return packRate;
  return roundToPaise(packRate / unitsPerPack);
}

/** `2026-10-01` — the first day of the organization's month; a batch before it is expired (MD5). */
export async function organizationMonthStart(context: BaseRecordWriteContext): Promise<string> {
  return `${(await organizationToday(context)).slice(0, 7)}-01`;
}

/** MD4: "Only 3 of Glycolac Cream in stock" — a 409 `not_enough_stock`. */
export function notEnoughMedicineStock(options: {
  name: string;
  available: number;
}): ConflictError {
  return new ConflictError('errors:medicineNotEnoughStock', {
    name: options.name,
    available: options.available,
  }).withReason('not_enough_stock');
}

/**
 * MD4: moves one batch by `change` and its medicine with it, in the write's transaction — below 0
 * is a 409 `not_enough_stock` (above 9999 a 409 `batch_full`).
 *
 * @remarks
 * - **Failure modes:** `ConflictError` `not_enough_stock`, `batch_full`.
 */
export async function moveMedicineBatch(options: {
  context: BaseRecordWriteContext;
  batchId: number;
  change: number;
  /** The medicine's name, for the 409 (the batch number otherwise). */
  name?: string;
}): Promise<void> {
  if (options.change === 0) return;
  const moved = await medicinesRepository.moveBatchStock({
    batchId: options.batchId,
    change: options.change,
    userId: options.context.userId,
  });
  if (moved !== null) return;
  const batch = await medicinesRepository.findBatch(options.batchId);
  if (options.change > 0) {
    throw new ConflictError('errors:medicineBatchFull', {
      batch_number: batch?.batch_number ?? '',
      max: MEDICINE_QUANTITY_MAX,
    }).withReason('batch_full');
  }
  throw notEnoughMedicineStock({
    name: options.name ?? batch?.batch_number ?? '',
    available: batch?.quantity ?? 0,
  });
}

/**
 * MD5: takes `quantity` of a medicine from its unexpired batches — the earliest expiry first, then
 * the oldest batch — and answers which batches gave how much.
 *
 * @remarks
 * - **Algorithm:** the sellable batches are read locked; each gives what it has until the quantity
 *   is met, through {@link moveMedicineBatch} (the medicine's quantity follows).
 * - **Failure modes:** `ConflictError` `not_enough_stock` when the unexpired batches hold less.
 */
export async function drawMedicineFromBatches(options: {
  context: BaseRecordWriteContext;
  medicine: BaseRecordRow;
  quantity: number;
}): Promise<MedicineBatchDraw[]> {
  const { context, medicine } = options;
  const name = String(medicine.name);
  const batches = await medicinesRepository.lockSellableBatches({
    medicineId: medicine.id,
    monthStart: await organizationMonthStart(context),
  });
  const available = batches.reduce((total, batch) => total + batch.quantity, 0);
  if (available < options.quantity) throw notEnoughMedicineStock({ name, available });
  const draws: MedicineBatchDraw[] = [];
  let left = options.quantity;
  for (const batch of batches) {
    if (left === 0) break;
    const quantity = Math.min(left, batch.quantity);
    await moveMedicineBatch({ context, batchId: batch.id, change: -quantity, name });
    draws.push({ batch, quantity });
    left -= quantity;
  }
  return draws;
}

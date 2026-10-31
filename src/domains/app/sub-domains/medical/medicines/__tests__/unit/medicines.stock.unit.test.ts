import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  lockSellableBatches: vi.fn(),
  moveBatchStock: vi.fn(),
  findBatch: vi.fn(),
}));

vi.mock('@/domains/app/sub-domains/medical/medicines/medicines.repository.js', () => ({
  MedicinesRepository: class {
    lockSellableBatches = mocks.lockSellableBatches;
    moveBatchStock = mocks.moveBatchStock;
    findBatch = mocks.findBatch;
  },
}));
vi.mock('@/domains/app/sub-domains/patients/patients.rules.js', () => ({
  organizationToday: async () => '2026-10-09',
}));

import {
  drawMedicineFromBatches,
  moveMedicineBatch,
  unitPurchaseRate,
  unitSellingRate,
} from '@/domains/app/sub-domains/medical/medicines/medicines.stock.js';

const CONTEXT = { organizationId: 1, userId: 2 } as never;
const MEDICINE = { id: 7, name: 'Azelaic 20%' } as never;

/** A sellable batch as the repository answers it (already in draw order). */
function batch(id: number, batchNumber: string, quantity: number) {
  return {
    id,
    public_id: `mbat_${id}`,
    medicine_id: 7,
    batch_number: batchNumber,
    expiry_month: '2028-06-01',
    quantity,
    purchase_rate: '60.00',
    supplier_id: null,
  };
}

/** MD5: the batch picker — earliest expiry first, partial batches, never more than is sellable. */
describe('drawMedicineFromBatches', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.moveBatchStock.mockResolvedValue({ quantity: 0 });
  });

  it("reads only this month's and later batches, locked", async () => {
    mocks.lockSellableBatches.mockResolvedValue([batch(1, 'A', 5)]);

    await drawMedicineFromBatches({ context: CONTEXT, medicine: MEDICINE, quantity: 1 });

    expect(mocks.lockSellableBatches).toHaveBeenCalledWith({
      medicineId: 7,
      monthStart: '2026-10-01',
    });
  });

  it('takes each batch in turn until the quantity is met, the last one partly', async () => {
    mocks.lockSellableBatches.mockResolvedValue([
      batch(1, 'C', 1),
      batch(2, 'A', 2),
      batch(3, 'B', 3),
    ]);

    const draws = await drawMedicineFromBatches({
      context: CONTEXT,
      medicine: MEDICINE,
      quantity: 5,
    });

    expect(draws.map((draw) => [draw.batch.batch_number, draw.quantity])).toEqual([
      ['C', 1],
      ['A', 2],
      ['B', 2],
    ]);
    expect(mocks.moveBatchStock.mock.calls.map((call) => call[0].change)).toEqual([-1, -2, -2]);
  });

  it('stops at the batch that meets it — the later ones are not touched', async () => {
    mocks.lockSellableBatches.mockResolvedValue([batch(1, 'A', 4), batch(2, 'B', 9)]);

    const draws = await drawMedicineFromBatches({
      context: CONTEXT,
      medicine: MEDICINE,
      quantity: 4,
    });

    expect(draws).toHaveLength(1);
    expect(mocks.moveBatchStock).toHaveBeenCalledOnce();
  });

  it('refuses more than the sellable batches hold, moving nothing (MD4)', async () => {
    mocks.lockSellableBatches.mockResolvedValue([batch(1, 'A', 2), batch(2, 'B', 3)]);

    await expect(
      drawMedicineFromBatches({ context: CONTEXT, medicine: MEDICINE, quantity: 6 }),
    ).rejects.toMatchObject({ reason: 'not_enough_stock' });
    expect(mocks.moveBatchStock).not.toHaveBeenCalled();
  });

  it('refuses any quantity when nothing is sellable', async () => {
    mocks.lockSellableBatches.mockResolvedValue([]);

    await expect(
      drawMedicineFromBatches({ context: CONTEXT, medicine: MEDICINE, quantity: 1 }),
    ).rejects.toMatchObject({ reason: 'not_enough_stock' });
  });
});

/** MD4: one batch moved — below zero and past the cap are 409s. */
describe('moveMedicineBatch', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  it('moves nothing for a zero change', async () => {
    await moveMedicineBatch({ context: CONTEXT, batchId: 1, change: 0 });

    expect(mocks.moveBatchStock).not.toHaveBeenCalled();
  });

  it('answers a take the batch cannot cover with not_enough_stock and what it has', async () => {
    mocks.moveBatchStock.mockResolvedValue(null);
    mocks.findBatch.mockResolvedValue(batch(1, 'A', 2));

    await expect(
      moveMedicineBatch({ context: CONTEXT, batchId: 1, change: -3, name: 'Azelaic 20%' }),
    ).rejects.toMatchObject({ reason: 'not_enough_stock' });
  });

  it('answers a put-back past the cap with batch_full', async () => {
    mocks.moveBatchStock.mockResolvedValue(null);
    mocks.findBatch.mockResolvedValue(batch(1, 'A', 9_999));

    await expect(
      moveMedicineBatch({ context: CONTEXT, batchId: 1, change: 5 }),
    ).rejects.toMatchObject({ reason: 'batch_full' });
  });
});

/** D5, D6 (change-pharmacy-record-fields): a loose unit's price and cost from a pack's. */
describe('unitSellingRate', () => {
  it('answers the MRP itself for a medicine sold in whole packs', () => {
    expect(unitSellingRate({ packMrp: 125.55, unitsPerPack: 1 })).toBe(125.55);
  });

  it('divides the MRP by the units and rounds down to the paisa — never above the MRP', () => {
    expect(unitSellingRate({ packMrp: 125.55, unitsPerPack: 10 })).toBe(12.55);
    expect(unitSellingRate({ packMrp: 100, unitsPerPack: 3 })).toBe(33.33);
    expect(unitSellingRate({ packMrp: 100, unitsPerPack: 3 }) * 3).toBeLessThanOrEqual(100);
  });

  it('keeps an even split exact', () => {
    expect(unitSellingRate({ packMrp: 120, unitsPerPack: 10 })).toBe(12);
  });
});

describe('unitPurchaseRate', () => {
  it('answers the pack rate itself for a medicine sold in whole packs', () => {
    expect(unitPurchaseRate({ packRate: 80, unitsPerPack: 1 })).toBe(80);
  });

  it('divides the pack rate by the units, to the paisa', () => {
    expect(unitPurchaseRate({ packRate: 80, unitsPerPack: 10 })).toBe(8);
    expect(unitPurchaseRate({ packRate: 100, unitsPerPack: 3 })).toBe(33.33);
  });
});

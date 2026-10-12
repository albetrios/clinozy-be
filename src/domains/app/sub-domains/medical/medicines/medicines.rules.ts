import { type BaseRecordRow, resolveRecordIds } from '@/domains/app/base-record.repository.js';
import type {
  BaseRecordCollectionInput,
  BaseRecordRules,
  BaseRecordWriteContext,
} from '@/domains/app/base-record.types.js';
import { manufacturers } from '@/domains/app/sub-domains/medical/manufacturers/manufacturers.schema.js';
import { suppliers } from '@/domains/app/sub-domains/medical/suppliers/suppliers.schema.js';
import { ConflictError, fieldValidationError } from '@/shared/errors/index.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { roundToPaise, toAmount } from '@/shared/utils/validation/record-fields.util.js';
import { MEDICINE_DEFAULT_MAX_STOCK, MEDICINE_DEFAULT_MIN_STOCK } from './medicines.constants.js';
import {
  type MedicineBatchInput,
  type MedicineSupplierPriceInput,
  NearExpiryDiscountDto,
} from './medicines.dto.js';
import type { MedicineBatchValues, MedicinesRepository } from './medicines.repository.js';
import { medicines } from './medicines.schema.js';
import { moveMedicineBatch } from './medicines.stock.js';

/** What a save writes after the medicine row: its batches and prices, when sent (MD13). */
interface PendingMedicine {
  batches: MedicineBatchInput[] | undefined;
  prices: MedicineSupplierPriceInput[] | undefined;
  supplierIds: Map<string, number>;
}

/** The saves in flight, by their write context — set by `prepare*`, read by `afterWrite`. */
const pendingMedicines = new WeakMap<BaseRecordWriteContext, PendingMedicine>();

/** `2027-03` → `2027-03-01` (the month's first day, as stored). */
function monthStartOf(month: string): string {
  return `${month}-01`;
}

/** MD12: a medicine that is not quick has an MRP above 0 and a manufacturer; stock levels in order. */
function assertMedicineComplete(values: Readonly<Record<string, unknown>>): void {
  if (values.is_quick !== true) {
    if ((toAmount(values.mrp) ?? 0) <= 0) {
      throw fieldValidationError({
        field: 'mrp',
        messageKey: 'errors:validation.medicineMrpRequired',
      });
    }
    if (typeof values.manufacturer_id !== 'number') {
      throw fieldValidationError({
        field: 'manufacturer_id',
        messageKey: 'errors:validation.medicineManufacturerRequired',
      });
    }
  }
  const minStock = Number(values.min_stock ?? MEDICINE_DEFAULT_MIN_STOCK);
  const maxStock = Number(values.max_stock ?? MEDICINE_DEFAULT_MAX_STOCK);
  if (maxStock < minStock) {
    throw fieldValidationError({
      field: 'max_stock',
      messageKey: 'errors:validation.medicineMaxBelowMin',
    });
  }
}

/** MD13: the suppliers a save's batches and prices name — live here, else a 400 on that list. */
async function resolveSaveSuppliers(options: {
  batches: readonly MedicineBatchInput[] | undefined;
  prices: readonly MedicineSupplierPriceInput[] | undefined;
  context: BaseRecordWriteContext;
}): Promise<Map<string, number>> {
  const named = [
    ...(options.batches ?? []).flatMap((batch) => (batch.supplier_id ? [batch.supplier_id] : [])),
    ...(options.prices ?? []).map((price) => price.supplier_id),
  ];
  const ids = await resolveRecordIds({
    table: suppliers,
    organizationId: options.context.organizationId,
    publicIds: named,
  });
  for (const [field, list] of [
    [
      'batches',
      (options.batches ?? []).flatMap((batch) => (batch.supplier_id ? [batch.supplier_id] : [])),
    ],
    ['supplier_prices', (options.prices ?? []).map((price) => price.supplier_id)],
  ] as const) {
    const unknown = list.find((publicId) => !ids.has(publicId));
    if (unknown !== undefined) {
      throw fieldValidationError({
        field,
        messageKey: 'errors:validation.recordReferenceNotFound',
        messageParams: { id: unknown, label: 'supplier' },
      });
    }
  }
  return ids;
}

/** Takes the batches and prices out of a save's values and keeps them for `afterWrite`. */
async function holdBatchesAndPrices({
  values,
  context,
}: {
  values: Record<string, unknown>;
  context: BaseRecordWriteContext;
}): Promise<void> {
  const batches = values.batches as MedicineBatchInput[] | undefined;
  const prices = values.supplier_prices as MedicineSupplierPriceInput[] | undefined;
  delete values.batches;
  delete values.supplier_prices;
  pendingMedicines.set(context, {
    batches,
    prices,
    supplierIds: await resolveSaveSuppliers({ batches, prices, context }),
  });
}

/** MD13: every kept batch (`id`) is one of this medicine's — 400 on `batches` otherwise. */
function assertBatchesOfMedicine({
  batches,
  byPublicId,
}: {
  batches: readonly MedicineBatchInput[];
  byPublicId: ReadonlyMap<string, unknown>;
}): void {
  for (const batch of batches) {
    if (batch.id !== undefined && !byPublicId.has(batch.id)) {
      throw fieldValidationError({
        field: 'batches',
        messageKey: 'errors:validation.medicineBatchNotOfMedicine',
        messageParams: { id: batch.id },
      });
    }
  }
}

/** MD13: a batch number a left-out batch keeps is not free — 409 `record_already_exists`. */
function assertBatchNumbersFree({
  batches,
  leftOut,
}: {
  batches: readonly MedicineBatchInput[];
  leftOut: readonly { batch_number: string }[];
}): void {
  const taken = new Set(leftOut.map((batch) => batch.batch_number.toLowerCase()));
  for (const batch of batches) {
    if (taken.has(batch.batch_number.toLowerCase())) {
      throw new ConflictError('errors:medicineBatchNumberTaken', {
        batch_number: batch.batch_number,
      }).withReason('record_already_exists');
    }
  }
}

/** A batch's stored details — the rate and the supplier only when the save sent them. */
function batchDetails({
  batch,
  supplierIds,
}: {
  batch: MedicineBatchInput;
  supplierIds: ReadonlyMap<string, number>;
}): Omit<MedicineBatchValues, 'quantity'> & { batch_number: string; expiry_month: string } {
  const details: Omit<MedicineBatchValues, 'quantity'> & {
    batch_number: string;
    expiry_month: string;
  } = {
    batch_number: batch.batch_number,
    expiry_month: monthStartOf(batch.expiry_month),
  };
  if (batch.purchase_rate !== undefined) {
    details.purchase_rate = batch.purchase_rate === null ? null : batch.purchase_rate.toFixed(2);
  }
  if (batch.supplier_id !== undefined) {
    details.supplier_id =
      batch.supplier_id === null ? null : (supplierIds.get(batch.supplier_id) ?? null);
  }
  return details;
}

/**
 * MD13: a save's batch list — a kept batch (its `id`) changes its details and its quantity moves
 * by the difference; a new one is added; a stored one left out goes to zero (and stays). A number
 * the medicine already holds (a left-out batch keeps its own) is a 409 `record_already_exists`.
 */
async function syncBatches(options: {
  repository: MedicinesRepository;
  medicine: BaseRecordRow;
  batches: readonly MedicineBatchInput[];
  supplierIds: ReadonlyMap<string, number>;
  context: BaseRecordWriteContext;
}): Promise<void> {
  const { repository, medicine, context } = options;
  const name = String(medicine.name);
  const stored = await repository.lockBatches(medicine.id);
  const byPublicId = new Map(stored.map((batch) => [batch.public_id, batch]));
  assertBatchesOfMedicine({ batches: options.batches, byPublicId });
  const keptIds = new Set(options.batches.flatMap((batch) => (batch.id ? [batch.id] : [])));
  const leftOut = stored.filter((batch) => !keptIds.has(batch.public_id));
  assertBatchNumbersFree({ batches: options.batches, leftOut });
  for (const batch of leftOut) {
    await moveMedicineBatch({ context, batchId: batch.id, change: -batch.quantity, name });
  }
  for (const batch of options.batches) {
    const details = batchDetails({ batch, supplierIds: options.supplierIds });
    const kept = batch.id === undefined ? undefined : byPublicId.get(batch.id);
    if (kept) {
      await repository.updateBatch({ id: kept.id, values: details, userId: context.userId });
      await moveMedicineBatch({
        context,
        batchId: kept.id,
        change: batch.quantity - kept.quantity,
        name,
      });
      continue;
    }
    const added = await repository.insertBatch({
      ...details,
      medicine_id: medicine.id,
      organization_id: context.organizationId,
      created_by_user_id: context.userId,
    });
    await moveMedicineBatch({ context, batchId: added.id, change: batch.quantity, name });
  }
}

/** After a save's row: its batches and prices, when the save sent them (MD13). */
async function writeBatchesAndPrices(options: {
  repository: MedicinesRepository;
  row: BaseRecordRow;
  context: BaseRecordWriteContext;
}): Promise<void> {
  const { repository, row, context } = options;
  const pending = pendingMedicines.get(context);
  pendingMedicines.delete(context);
  if (!pending) return;
  if (pending.batches) {
    await syncBatches({
      repository,
      medicine: row,
      batches: pending.batches,
      supplierIds: pending.supplierIds,
      context,
    });
  }
  if (pending.prices) {
    await repository.replacePrices({
      medicineId: row.id,
      organizationId: context.organizationId,
      prices: pending.prices.map((price) => ({
        supplier_id: pending.supplierIds.get(price.supplier_id)!,
        rate: price.rate.toFixed(2),
        free_quantity: price.free_quantity ?? 0,
        lead_days: price.lead_days ?? 0,
      })),
    });
  }
}

/** MD12: the batches, prices, nearest expiry, best rate, margin and manufacturer of a page. */
async function decorateMedicines(options: {
  repository: MedicinesRepository;
  outputs: Record<string, unknown>[];
  context: BaseRecordWriteContext;
}): Promise<void> {
  const { repository, outputs, context } = options;
  const idsByPublicId = await resolveRecordIds({
    table: medicines,
    organizationId: context.organizationId,
    publicIds: outputs.map((output) => String(output.id)),
  });
  const ids = [...idsByPublicId.values()];
  const batches = await repository.findStockedBatches({
    medicineIds: ids,
    organizationId: context.organizationId,
  });
  const prices = await repository.findPrices(ids);
  const manufacturerPublicIds = outputs.flatMap((output) => {
    const manufacturer = output.manufacturer as { id: string } | null;
    return manufacturer ? [manufacturer.id] : [];
  });
  const manufacturerIds = await resolveRecordIds({
    table: manufacturers,
    organizationId: context.organizationId,
    publicIds: manufacturerPublicIds,
  });
  const manufacturerRows = await repository.findManufacturers([...manufacturerIds.values()]);
  for (const output of outputs) {
    const id = idsByPublicId.get(String(output.id));
    const ownBatches = batches.filter((batch) => batch.medicine_id === id);
    const ownPrices = prices.filter((price) => price.medicine_id === id);
    output.batches = ownBatches.map(({ medicine_id: _medicine, ...batch }) => ({
      ...batch,
      expiry_month: batch.expiry_month.slice(0, 7),
      purchase_rate: toAmount(batch.purchase_rate),
    }));
    const nearest = ownBatches.find((batch) => !batch.is_expired);
    output.nearest_expiry = nearest
      ? { expiry_month: nearest.expiry_month.slice(0, 7), batch_number: nearest.batch_number }
      : null;
    output.supplier_prices = ownPrices.map(({ medicine_id: _medicine, rate, ...price }) => ({
      ...price,
      rate: toAmount(rate) ?? 0,
    }));
    const best = ownPrices[0];
    const mrp = Number(output.mrp);
    output.best_rate = best
      ? {
          rate: toAmount(best.rate) ?? 0,
          supplier_id: best.supplier_id,
          supplier_name: best.supplier_name,
        }
      : null;
    output.margin_percent =
      best && mrp > 0 ? roundToPaise(((mrp - (toAmount(best.rate) ?? 0)) / mrp) * 100) : null;
    const manufacturer = output.manufacturer as { id: string } | null;
    const manufacturerId = manufacturer ? manufacturerIds.get(manufacturer.id) : undefined;
    output.manufacturer =
      manufacturerId === undefined
        ? manufacturer
        : (manufacturerRows.get(manufacturerId) ?? manufacturer);
  }
}

/** MD14: "Sell all at 20% off" / "Remove near-expiry discount" — how many changed. */
async function setNearExpiryDiscount(input: BaseRecordCollectionInput): Promise<unknown> {
  const body = parseWithSchema({ schema: NearExpiryDiscountDto, data: input.input });
  const updated = await (input.repository as MedicinesRepository).setNearExpiryDiscount({
    organizationId: input.context.organizationId,
    withinDays: body.expiring_within_days,
    percent: body.discount_percent,
    userId: input.context.userId,
  });
  return { updated_count: updated };
}

/**
 * The medicine rules (launch ROUTE #153, routes-final 11.D, MD12–MD14): the quick rules, the stock
 * levels, the batches and prices with the stock kept in step, delete only at zero, what a page
 * reads, and the near-expiry discount.
 *
 * @remarks
 * - **Algorithm:** a medicine that is not quick needs an MRP above 0 and a manufacturer; "Fill up
 *   to" is never under "Reorder at". A quick one loses its flag once its MRP and composition are
 *   set. The batches are the whole list on a save — kept ones move by the difference, new ones
 *   arrive, left-out ones go to zero (MD13), each through the guarded batch move (MD4); the prices
 *   are replaced. Every read adds the stocked batches (earliest expiry first), the prices (lowest
 *   first), the nearest expiry, the best rate and the margin, and the manufacturer's name and tone.
 * - **Failure modes:** `ValidationError` on `mrp`, `manufacturer_id`, `max_stock`, `batches`,
 *   `supplier_prices`; `ConflictError` `record_already_exists` (a batch number),
 *   `not_enough_stock`, `batch_full`, `medicine_has_stock`.
 */
export function createMedicinesRules(repository: MedicinesRepository): BaseRecordRules {
  return {
    prepareCreate: async (values, context) => {
      values.is_quick ??= false;
      if (values.is_quick === true) values.mrp ??= 0;
      assertMedicineComplete(values);
      await holdBatchesAndPrices({ values, context });
    },
    prepareUpdate: async (values, existing, context) => {
      const merged = { ...existing, ...values };
      assertMedicineComplete(merged);
      if (
        existing.is_quick === true &&
        (toAmount(merged.mrp) ?? 0) > 0 &&
        typeof merged.composition === 'string'
      ) {
        values.is_quick = false;
      }
      await holdBatchesAndPrices({ values, context });
    },
    prepareRemove: (existing) => {
      if (Number(existing.quantity) > 0) {
        throw new ConflictError('errors:medicineHasStock').withReason('medicine_has_stock');
      }
    },
    afterWrite: async (row, change, context) => {
      if (change.kind !== 'create' && change.kind !== 'update') return;
      await writeBatchesAndPrices({ repository, row, context });
    },
    decorate: (outputs, context) => decorateMedicines({ repository, outputs, context }),
    collectionActions: { 'near-expiry-discount': setNearExpiryDiscount },
  };
}

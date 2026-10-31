import { type BaseRecordRow, resolveRecordIds } from '@/domains/app/base-record.repository.js';
import type {
  BaseRecordActionInput,
  BaseRecordRules,
  BaseRecordWriteContext,
} from '@/domains/app/base-record.types.js';
import { MedicinesRepository } from '@/domains/app/sub-domains/medical/medicines/medicines.repository.js';
import { medicines } from '@/domains/app/sub-domains/medical/medicines/medicines.schema.js';
import { moveMedicineBatch } from '@/domains/app/sub-domains/medical/medicines/medicines.stock.js';
import { applySupplierCredits } from '@/domains/app/sub-domains/medical/suppliers/supplier-credits/supplier-credits.ledger.js';
import { SuppliersRepository } from '@/domains/app/sub-domains/medical/suppliers/suppliers.repository.js';
import { organizationToday } from '@/domains/app/sub-domains/patients/patients.rules.js';
import { ConflictError, fieldValidationError } from '@/shared/errors/index.js';
import { parseWithSchema } from '@/shared/utils/validation/parse-with-schema.util.js';
import { paiseOf, toAmount } from '@/shared/utils/validation/record-fields.util.js';
import {
  MEDICAL_PURCHASE_ORDER_DEFAULT_EXPIRY_MONTHS,
  MEDICAL_PURCHASE_ORDER_ITEMS_MAX,
  MEDICAL_PURCHASE_ORDER_STAGE,
} from './medical-purchase-orders.constants.js';
import {
  type MedicalPurchaseOrderItemInput,
  ReceiveMedicalPurchaseOrderDto,
} from './medical-purchase-orders.dto.js';
import type {
  MedicalPurchaseOrderItemRow,
  MedicalPurchaseOrderItemValues,
  MedicalPurchaseOrdersRepository,
} from './medical-purchase-orders.repository.js';
import { medical_purchase_orders } from './medical-purchase-orders.schema.js';

const medicinesRepository = new MedicinesRepository();
const suppliersRepository = new SuppliersRepository();

/** The lines a save writes after its order row (MD15) — set by `prepare*`, read by `afterWrite`. */
const pendingLines = new WeakMap<BaseRecordWriteContext, MedicalPurchaseOrderItemValues[]>();

/** MD15: a received order is read-only — a 409 `transition_not_allowed`. */
function assertNotReceived({
  existing,
  action,
}: {
  existing: BaseRecordRow;
  action: string;
}): void {
  if (existing.stage === MEDICAL_PURCHASE_ORDER_STAGE.RECEIVED) {
    throw new ConflictError('errors:recordTransitionNotAllowed', {
      action,
      status: MEDICAL_PURCHASE_ORDER_STAGE.RECEIVED,
    }).withReason('transition_not_allowed');
  }
}

/** An order date is not after the organization's today — else a 400 `order_date`. */
async function assertOrderDate({
  date,
  context,
}: {
  date: unknown;
  context: BaseRecordWriteContext;
}): Promise<void> {
  if (typeof date === 'string' && date > (await organizationToday(context))) {
    throw fieldValidationError({
      field: 'order_date',
      messageKey: 'errors:validation.medicalPurchaseOrderDateInFuture',
    });
  }
}

/**
 * MD15: "add as typed" — the live medicine of that name, else a quick one at MRP 0 with the
 * supplier's first manufacturer, the line's rate its supplier price.
 */
async function quickMedicineId(options: {
  name: string;
  supplierId: number;
  rate: string;
  context: BaseRecordWriteContext;
}): Promise<number> {
  const { name, supplierId, context } = options;
  const existing = await medicinesRepository.findLiveIdByName({
    organizationId: context.organizationId,
    name,
  });
  if (existing !== null) return existing;
  const created = await medicinesRepository.insert({
    organization_id: context.organizationId,
    name,
    is_quick: true,
    mrp: '0.00',
    manufacturer_id: await suppliersRepository.findFirstManufacturerId(supplierId),
    created_by_user_id: context.userId,
    updated_by_user_id: context.userId,
  });
  await medicinesRepository.upsertPrice({
    medicineId: created.id,
    supplierId,
    organizationId: context.organizationId,
    rate: options.rate,
  });
  return created.id;
}

/** MD15: a save's lines — each medicine live here (or added as typed), amount = quantity × rate. */
async function resolveLines(options: {
  items: readonly MedicalPurchaseOrderItemInput[];
  supplierId: number;
  context: BaseRecordWriteContext;
}): Promise<MedicalPurchaseOrderItemValues[]> {
  const { items, context } = options;
  const ids = await resolveRecordIds({
    table: medicines,
    organizationId: context.organizationId,
    publicIds: items.flatMap((item) => (item.medicine_id === undefined ? [] : [item.medicine_id])),
  });
  const lines: MedicalPurchaseOrderItemValues[] = [];
  for (const [index, item] of items.entries()) {
    const rate = item.rate.toFixed(2);
    const medicineId =
      item.medicine_id === undefined
        ? await quickMedicineId({
            name: item.new_medicine_name!,
            supplierId: options.supplierId,
            rate,
            context,
          })
        : ids.get(item.medicine_id);
    if (medicineId === undefined) {
      throw fieldValidationError({
        field: 'items',
        messageKey: 'errors:validation.invoiceMedicineNotLive',
        messageParams: { id: String(item.medicine_id) },
      });
    }
    lines.push({
      line_number: index + 1,
      medicine_id: medicineId,
      quantity: item.quantity,
      free_quantity: item.free_quantity ?? 0,
      rate,
      mrp: item.mrp == null ? null : item.mrp.toFixed(2),
      amount: ((item.quantity * paiseOf(item.rate)) / 100).toFixed(2),
    });
  }
  return lines;
}

/** Plans a save's lines and the order's total (its lines'), kept for `afterWrite`. */
async function holdLines(options: {
  values: Record<string, unknown>;
  supplierId: number;
  context: BaseRecordWriteContext;
}): Promise<void> {
  const { values, context } = options;
  const items = values.items as MedicalPurchaseOrderItemInput[] | undefined;
  delete values.items;
  if (items === undefined) return;
  const lines = await resolveLines({ items, supplierId: options.supplierId, context });
  values.total = (lines.reduce((total, line) => total + paiseOf(line.amount), 0) / 100).toFixed(2);
  pendingLines.set(context, lines);
}

/** `2026-10-08` + 24 months → `2028-10-01` (a received line's default expiry, MD16). */
function defaultExpiryMonth(orderDate: string): string {
  const year = Number(orderDate.slice(0, 4));
  const month = Number(orderDate.slice(5, 7)) - 1 + MEDICAL_PURCHASE_ORDER_DEFAULT_EXPIRY_MONTHS;
  return `${year + Math.floor(month / 12)}-${String((month % 12) + 1).padStart(2, '0')}-01`;
}

/**
 * MD16: one received line goes into its batch — a new one, or the medicine's batch of that number
 * (another expiry is a 409 `record_already_exists`), its rate now this line's and its MRP the
 * line's when the line has one (D8) — and adds `quantity + free_quantity` packs, as units (× the
 * medicine's units per pack, D5); the supplier's price follows. Returns the batch id.
 */
async function receiveLine(options: {
  order: BaseRecordRow;
  line: MedicalPurchaseOrderItemRow;
  batchNumber: string;
  expiryMonth: string;
  mrp: string | null;
  context: BaseRecordWriteContext;
}): Promise<number> {
  const { order, line, context } = options;
  const supplierId = order.supplier_id as number;
  const details = {
    purchase_rate: line.rate,
    supplier_id: supplierId,
    medical_purchase_order_id: order.id,
    ...(options.mrp === null ? {} : { mrp: options.mrp }),
  };
  const existing = await medicinesRepository.findBatchByNumber({
    medicineId: line.medicine_id,
    batchNumber: options.batchNumber,
  });
  if (existing && existing.expiry_month !== options.expiryMonth) {
    throw new ConflictError('errors:medicineBatchNumberTaken', {
      batch_number: options.batchNumber,
    }).withReason('record_already_exists');
  }
  const batchId = existing
    ? existing.id
    : (
        await medicinesRepository.insertBatch({
          ...details,
          medicine_id: line.medicine_id,
          organization_id: context.organizationId,
          batch_number: options.batchNumber,
          expiry_month: options.expiryMonth,
          created_by_user_id: context.userId,
        })
      ).id;
  if (existing) {
    await medicinesRepository.updateBatch({ id: batchId, values: details, userId: context.userId });
  }
  const medicine = await medicinesRepository.findById(line.medicine_id);
  const unitsPerPack = Number(medicine?.units_per_pack ?? 1);
  await moveMedicineBatch({
    context,
    batchId,
    change: (line.quantity + line.free_quantity) * unitsPerPack,
  });
  await medicinesRepository.upsertPrice({
    medicineId: line.medicine_id,
    supplierId,
    organizationId: context.organizationId,
    rate: line.rate,
  });
  return batchId;
}

/** How one line arrived — ticked or not, its batch, expiry and MRP as sent (defaults otherwise). */
interface ReceivedLineChoice {
  is_received?: boolean | undefined;
  batch_number?: string | undefined;
  expiry_month?: string | undefined;
  mrp?: number | null | undefined;
}

/**
 * MD16: one line of a receive — ticked (default) it goes into its batch (number default
 * `NEW-<order number>`, expiry default 24 months on) and counts in the total; either way the line
 * records how it arrived. Returns what it adds to the total, in paise.
 */
async function receiveOrderLine(options: {
  repository: MedicalPurchaseOrdersRepository;
  order: BaseRecordRow;
  line: MedicalPurchaseOrderItemRow;
  choice: ReceivedLineChoice | undefined;
  context: BaseRecordWriteContext;
}): Promise<number> {
  const { repository, order, line, choice, context } = options;
  const isReceived = choice?.is_received ?? true;
  const batchNumber = choice?.batch_number ?? `NEW-${Number(order.purchase_order_number)}`;
  const expiryMonth =
    choice?.expiry_month === undefined
      ? defaultExpiryMonth(String(order.order_date))
      : `${choice.expiry_month}-01`;
  const mrp = choice?.mrp === undefined ? line.mrp : (choice.mrp?.toFixed(2) ?? null);
  const batchId = isReceived
    ? await receiveLine({ order, line, batchNumber, expiryMonth, mrp, context })
    : null;
  await repository.markItemReceived({
    id: line.id,
    isReceived,
    batchNumber: isReceived ? batchNumber : null,
    expiryMonth: isReceived ? expiryMonth : null,
    mrp,
    medicineBatchId: batchId,
  });
  return isReceived ? paiseOf(line.amount) : 0;
}

/**
 * MD26: goods that came but were not ordered — added after the order's last line (a listed
 * medicine, or a quick one added as typed), the order holding at most 50 lines.
 */
async function addUnorderedLines(options: {
  repository: MedicalPurchaseOrdersRepository;
  order: BaseRecordRow;
  orderedCount: number;
  lastLineNumber: number;
  items: readonly MedicalPurchaseOrderItemInput[];
  context: BaseRecordWriteContext;
}): Promise<MedicalPurchaseOrderItemRow[]> {
  const { repository, order, items, context } = options;
  if (items.length === 0) return [];
  if (options.orderedCount + items.length > MEDICAL_PURCHASE_ORDER_ITEMS_MAX) {
    throw fieldValidationError({
      field: 'items',
      messageKey: 'errors:validation.medicalPurchaseOrderTooManyLines',
      messageParams: { max: MEDICAL_PURCHASE_ORDER_ITEMS_MAX },
    });
  }
  const lines = await resolveLines({
    items,
    supplierId: order.supplier_id as number,
    context,
  });
  return repository.insertItems({
    orderId: order.id,
    organizationId: context.organizationId,
    lines: lines.map((line, index) => ({
      ...line,
      line_number: options.lastLineNumber + index + 1,
    })),
  });
}

/**
 * MD16, MD26: "Receive goods" — each ordered line ticked (default) goes into its batch, and goods
 * that came but were not ordered become received lines of the order; the order is received, its
 * total the received lines', the bill number may come with the goods, and the supplier's open
 * credits are applied.
 */
async function receiveOrder(input: BaseRecordActionInput): Promise<BaseRecordRow> {
  const { existing: order, context } = input;
  const repository = input.repository as MedicalPurchaseOrdersRepository;
  assertNotReceived({ existing: order, action: 'receive' });
  const body = parseWithSchema({ schema: ReceiveMedicalPurchaseOrderDto, data: input.input });
  const lines = await repository.lockItems(order.id);
  const sent = new Map<string, ReceivedLineChoice>();
  const unordered: (MedicalPurchaseOrderItemInput & ReceivedLineChoice)[] = [];
  for (const item of body.items ?? []) {
    if ('id' in item) sent.set(item.id, item);
    else unordered.push(item);
  }
  const unknown = [...sent.keys()].find((id) => !lines.some((line) => line.public_id === id));
  if (unknown !== undefined) {
    throw fieldValidationError({
      field: 'items',
      messageKey: 'errors:validation.medicalPurchaseOrderItemNotOnOrder',
      messageParams: { id: unknown },
    });
  }
  const added = await addUnorderedLines({
    repository,
    order,
    orderedCount: lines.length,
    lastLineNumber: lines.at(-1)?.line_number ?? 0,
    items: unordered,
    context,
  });
  let totalPaise = 0;
  for (const line of lines) {
    totalPaise += await receiveOrderLine({
      repository,
      order,
      line,
      choice: sent.get(line.public_id),
      context,
    });
  }
  for (const [index, line] of added.entries()) {
    totalPaise += await receiveOrderLine({
      repository,
      order,
      line,
      choice: { ...unordered[index], is_received: true },
      context,
    });
  }
  if (totalPaise === 0) {
    throw fieldValidationError({
      field: 'items',
      messageKey: 'errors:validation.medicalPurchaseOrderNothingReceived',
    });
  }
  const received = await repository.update(
    order.id,
    {
      stage: MEDICAL_PURCHASE_ORDER_STAGE.RECEIVED,
      received_at: new Date(),
      total: (totalPaise / 100).toFixed(2),
      ...(body.supplier_bill_number === undefined
        ? {}
        : { supplier_bill_number: body.supplier_bill_number }),
      ...(body.note === undefined ? {} : { note: body.note }),
    },
    context.userId,
  );
  await applySupplierCredits({ context, supplierId: order.supplier_id as number });
  return (await repository.findById(order.id)) ?? received ?? order;
}

/** The lines, their counts and the supplier (name, phone, GSTIN — MD30 (c)) of a page's orders (11.E.6). */
async function decorateOrders(options: {
  repository: MedicalPurchaseOrdersRepository;
  outputs: Record<string, unknown>[];
  context: BaseRecordWriteContext;
}): Promise<void> {
  const { repository, outputs, context } = options;
  const idsByPublicId = await resolveRecordIds({
    table: medical_purchase_orders,
    organizationId: context.organizationId,
    publicIds: outputs.map((output) => String(output.id)),
  });
  const items = await repository.findItems([...idsByPublicId.values()]);
  const suppliersById = await suppliersRepository.findSummariesByPublicId(
    outputs.map((output) => (output.supplier as { id: string }).id),
    context.organizationId,
  );
  for (const output of outputs) {
    const id = idsByPublicId.get(String(output.id));
    const own = items.filter((item) => item.medical_purchase_order_id === id);
    output.items = own.map(({ medical_purchase_order_id: _order, ...item }) => ({
      ...item,
      rate: toAmount(item.rate) ?? 0,
      mrp: toAmount(item.mrp),
      amount: toAmount(item.amount) ?? 0,
      expiry_month: item.expiry_month?.slice(0, 7) ?? null,
    }));
    output.item_count = own.length;
    output.free_count = own.reduce((total, item) => total + item.free_quantity, 0);
    const supplier = output.supplier as { id: string };
    const summary = suppliersById.get(supplier.id);
    output.supplier = {
      id: supplier.id,
      name: summary?.name ?? '',
      phone: summary?.phone ?? null,
      gst_number: summary?.gst_number ?? null,
    };
  }
}

/**
 * The medical purchase order rules (launch ROUTE #153, routes-final 11.E, MD15–MD16): the lines
 * and the total, the date, read-only once received, cancel only while ordered, receiving, and
 * what a page reads.
 *
 * @remarks
 * - **Algorithm:** a save resolves its lines (a listed medicine, or a quick one added as typed)
 *   and stores their total; the lines go in after the row. A change or a cancel of a received
 *   order is refused — a change of the note alone excepted (D10). The `receive` action moves each
 *   ticked line into its batch (MD4) as units (× the medicine's units per pack) with the line's
 *   MRP, refreshes
 *   the supplier's price, sets the total to the received lines', and applies the supplier's open
 *   credits (MD11). Paying is the payments ledger's (MD7). Every read adds the lines, their counts
 *   and the supplier's name.
 * - **Failure modes:** `ValidationError` on `items`, `order_date`; `ConflictError`
 *   `transition_not_allowed`, `record_already_exists` (a batch number with another expiry),
 *   `batch_full`, `record_changed`.
 */
export function createMedicalPurchaseOrdersRules(
  repository: MedicalPurchaseOrdersRepository,
): BaseRecordRules {
  return {
    prepareCreate: async (values, context) => {
      values.order_date ??= await organizationToday(context);
      await assertOrderDate({ date: values.order_date, context });
      await holdLines({ values, supplierId: values.supplier_id as number, context });
    },
    prepareUpdate: async (values, existing, context) => {
      // D10: a received order still takes its note — and nothing else
      if (Object.keys(values).every((key) => key === 'note')) return;
      assertNotReceived({ existing, action: 'change' });
      await assertOrderDate({ date: values.order_date, context });
      await holdLines({
        values,
        supplierId: (values.supplier_id ?? existing.supplier_id) as number,
        context,
      });
    },
    prepareRemove: (existing) => assertNotReceived({ existing, action: 'cancel' }),
    afterWrite: async (row, change, context) => {
      if (change.kind !== 'create' && change.kind !== 'update') return;
      const lines = pendingLines.get(context);
      pendingLines.delete(context);
      if (!lines) return;
      await repository.replaceItems({
        orderId: row.id,
        organizationId: context.organizationId,
        lines,
      });
    },
    actions: { receive: receiveOrder },
    decorate: (outputs, context) => decorateOrders({ repository, outputs, context }),
  };
}

/**
 * The demo clinic's shelves as data — the medical store (its agencies, medicines and batches,
 * orders, returns to agencies, sales, MRs) and the procedure room's own stock (vendors, items,
 * bills, every movement and two stock checks) — built from the same seeded Faker as the rest of
 * the plan, after it, so the clinic's people and visits stay as they were. Pure: nothing here
 * touches the database. Every quantity and amount is worked out here, in whole packs, thousandths
 * and paise, so the records reconcile: a batch holds what arrived less what was sold and sent back,
 * an item's balance is its movements' sum, and an order owes its total less what was paid and
 * credited.
 */
import type { Faker } from '@faker-js/faker';
import {
  addDaysToCalendarDate,
  clockTimeOfMinutes,
  minutesOfClockTime,
  weekdayOfCalendarDate,
} from '@/shared/utils/validation/record-fields.util.js';
import { STOCK_COUNT_MOVEMENT_NOTE } from '@/domains/app/sub-domains/stock/stock-counts/stock-counts.constants.js';
import {
  DEMO_CASE_MEDICINES,
  DEMO_MEDICINES,
  DEMO_OFFERINGS,
  DEMO_REP_VISITS,
  DEMO_STOCK_ITEMS,
  DEMO_STOCK_VENDORS,
  DEMO_SUPPLIERS,
  type DemoCity,
  type DemoManufacturerKey,
  type DemoMedicine,
  type DemoMedicineKey,
  type DemoStockItem,
  type DemoStockItemKey,
  type DemoStockVendorKey,
  type DemoSupplierKey,
} from './demo-clinic.catalog.js';
import type {
  DemoAppointmentPlan,
  DemoBranchKey,
  DemoLeadPlan,
  DemoMoment,
  DemoPatientPlan,
  DemoStaffKey,
  DemoTreatmentPlan,
} from './demo-clinic.plan.js';

/** How a sale or a bill was paid. */
export type DemoPaymentMode = 'cash' | 'upi' | 'card';

/** An agency the store buys from, with its number and GSTIN. */
export interface DemoSupplierPlan {
  key: DemoSupplierKey;
  name: string;
  phone: string;
  gstNumber: string;
  manufacturers: readonly DemoManufacturerKey[];
}

/** What an agency charges for a medicine (`app.medicine_supplier_prices`). */
export interface DemoSupplierPricePlan {
  medicine: DemoMedicineKey;
  supplier: DemoSupplierKey;
  ratePaise: number;
  /** The scheme's free pack ("10 + 1"). */
  freeQuantity: number;
  leadDays: number;
}

/** A medicine as the store holds it now: its batches' sum and when it last moved. */
export interface DemoMedicinePlan {
  key: DemoMedicineKey;
  quantity: number;
  updatedAt: DemoMoment;
}

/** One batch of a medicine and what is left of it (`app.medicine_batches`). */
export interface DemoMedicineBatchPlan {
  medicine: DemoMedicineKey;
  batchNumber: string;
  /** The month's first day. */
  expiryMonth: string;
  /** Packs left: what arrived, less what was sold and sent back. */
  quantity: number;
  purchaseRatePaise: number;
  supplier: DemoSupplierKey;
  /** The order it came on (`purchaseOrders[index]`); absent for the stock the store started with. */
  purchaseOrder?: number;
  createdAt: DemoMoment;
  updatedAt: DemoMoment;
}

/** One line of an order to an agency (`app.medical_purchase_order_items`). */
export interface DemoPurchaseOrderLinePlan {
  medicine: DemoMedicineKey;
  quantity: number;
  freeQuantity: number;
  ratePaise: number;
  /** Quantity × rate. */
  amountPaise: number;
  /** The batch it went into once received (`batches[index]`). */
  batch?: number;
}

/** An order to an agency: ordered, then received into batches, then paid or credited. */
export interface DemoPurchaseOrderPlan {
  supplier: DemoSupplierKey;
  orderDate: string;
  orderedAt: DemoMoment;
  receivedAt?: DemoMoment;
  supplierBillNumber?: string;
  lines: readonly DemoPurchaseOrderLinePlan[];
  totalPaise: number;
  paidPaise: number;
  /** What the agency's returns took off it. */
  creditedPaise: number;
  /** The supplier-bill payment that paid it, when one did. */
  payment?: { mode: DemoPaymentMode; at: DemoMoment; amountPaise: number };
  updatedAt: DemoMoment;
}

/** Packs sent back to an agency, owed back and set against its dues (`app.supplier_credits`). */
export interface DemoSupplierCreditPlan {
  supplier: DemoSupplierKey;
  medicine: DemoMedicineKey;
  /** `batches[index]`. */
  batch: number;
  quantity: number;
  ratePaise: number;
  amountPaise: number;
  /** What has been set against the agency's received orders so far. */
  appliedPaise: number;
  at: DemoMoment;
  updatedAt: DemoMoment;
}

/** One line of a store sale: packs from one batch, at the medicine's MRP. */
export interface DemoMedicalSaleLinePlan {
  medicine: DemoMedicineKey;
  /** `batches[index]` — the earliest unexpired one with stock, as a sale draws (MD5). */
  batch: number;
  quantity: number;
  /** The medicine's near-expiry discount, else 0. */
  discountPercent: number;
}

/** A sale at the store counter, after a visit or to a walk-in (`app.medical_sales`). */
export interface DemoMedicalSalePlan {
  /** The buyer (`people[person]`). */
  person: number;
  branch: DemoBranchKey;
  /** Who prescribed it; absent for an over-the-counter buy. */
  doctor?: DemoStaffKey;
  at: DemoMoment;
  lines: readonly DemoMedicalSaleLinePlan[];
  /** The share of the bill paid (1 in full, 0 unpaid); `demo-clinic.ts` works out the rupees. */
  paidShare: number;
  payment: { mode: DemoPaymentMode; at: DemoMoment } | null;
}

/** A store expense outside an order — a `medicines` payment. */
export interface DemoStoreExpensePlan {
  payeeName: string;
  note: string;
  amountPaise: number;
  mode: DemoPaymentMode;
  at: DemoMoment;
}

/** A medical representative and the visit they are due for next. */
export interface DemoMedicalRepPlan {
  name: string;
  phone: string;
  manufacturers: readonly DemoManufacturerKey[];
  nextVisitOn: string;
  createdAt: DemoMoment;
  updatedAt: DemoMoment;
}

/** One logged MR visit (`app.medical_rep_visits`). */
export interface DemoMedicalRepVisitPlan {
  /** `reps[index]`. */
  rep: number;
  visitDate: string;
  nextVisitOn: string;
  samples: string;
  notes: string;
  loggedBy: DemoStaffKey;
  at: DemoMoment;
}

/** The medical store: everything the Medical room's tabs list. */
export interface DemoMedicalStorePlan {
  suppliers: readonly DemoSupplierPlan[];
  prices: readonly DemoSupplierPricePlan[];
  medicines: readonly DemoMedicinePlan[];
  batches: readonly DemoMedicineBatchPlan[];
  purchaseOrders: readonly DemoPurchaseOrderPlan[];
  credits: readonly DemoSupplierCreditPlan[];
  sales: readonly DemoMedicalSalePlan[];
  expenses: readonly DemoStoreExpensePlan[];
  reps: readonly DemoMedicalRepPlan[];
  repVisits: readonly DemoMedicalRepVisitPlan[];
  /** When the store's records begin — six weeks ago, as the clinic's. */
  openedAt: DemoMoment;
}

/** A vendor of the clinic's consumables. */
export interface DemoStockVendorPlan {
  key: DemoStockVendorKey;
  name: string;
  phone: string;
}

/** A stock item as it stands now: its balance (its movements' sum) and its latest rate. */
export interface DemoStockItemPlan {
  key: DemoStockItemKey;
  /** Thousandths of its unit (S4). */
  quantityMilli: number;
  /** The latest bill line's rate; null when it was never bought here. */
  lastRatePaise: number | null;
  updatedAt: DemoMoment;
}

/** One line of a vendor bill (`app.stock_purchase_items`). */
export interface DemoStockPurchaseLinePlan {
  item: DemoStockItemKey;
  quantityMilli: number;
  ratePaise: number;
  /** Quantity × rate, to the paisa (S10). */
  amountPaise: number;
}

/** A vendor bill: what arrived and what was paid on it (`app.stock_purchases`). */
export interface DemoStockPurchasePlan {
  vendor: DemoStockVendorKey;
  purchaseDate: string;
  at: DemoMoment;
  billNumber: string;
  lines: readonly DemoStockPurchaseLinePlan[];
  /** The lines' total. */
  billPaise: number;
  paidPaise: number;
  payment?: { mode: DemoPaymentMode; at: DemoMoment; amountPaise: number };
  updatedAt: DemoMoment;
}

/** A stock check: each counted item's system and counted quantity (`app.stock_counts`). */
export interface DemoStockCountPlan {
  at: DemoMoment;
  by: DemoStaffKey;
  lines: readonly { item: DemoStockItemKey; systemMilli: number; countedMilli: number }[];
}

/** One stock movement (`app.stock_item_movements`), with the balance it left. */
export interface DemoStockMovementPlan {
  item: DemoStockItemKey;
  type: 'opening' | 'received' | 'used' | 'damaged' | 'returned' | 'adjust' | 'reverted';
  changeMilli: number;
  afterMilli: number;
  at: DemoMoment;
  by: DemoStaffKey;
  usedFor?: string;
  note?: string;
  /** The session it went into (`treatments[index]`). */
  treatment?: number;
  /** `purchases[index]`. */
  purchase?: number;
  /** `counts[index]`. */
  count?: number;
  /** The movement it undoes (`movements[index]`). */
  reverts?: number;
  revertReason?: 'mistake';
}

/** The clinic's own stock: everything the Clinic stock room's tabs list. */
export interface DemoClinicStockPlan {
  vendors: readonly DemoStockVendorPlan[];
  items: readonly DemoStockItemPlan[];
  purchases: readonly DemoStockPurchasePlan[];
  counts: readonly DemoStockCountPlan[];
  movements: readonly DemoStockMovementPlan[];
  /** When the stock records begin. */
  openedAt: DemoMoment;
}

/** What the shelves are planned from: the clinic so far, and the plan's own draws. */
export interface DemoStockPlanInput {
  faker: Faker;
  today: string;
  city: DemoCity;
  people: readonly { firstName: string }[];
  patients: readonly DemoPatientPlan[];
  leads: readonly DemoLeadPlan[];
  appointments: readonly DemoAppointmentPlan[];
  treatments: readonly DemoTreatmentPlan[];
  /** A mobile no one in the plan has yet. */
  newMobile: () => string;
  /** A name no one in the plan has yet. */
  newName: (sex: 'female' | 'male') => { firstName: string; lastName: string };
  /** A GSTIN registered in the clinic's state. */
  newGstNumber: () => string;
}

/** Days of records before today — the clinic's six weeks. */
const HISTORY_DAYS = 42;
/** Sales are rung up for visits of the last four weeks. */
const SALE_DAYS = 28;
/** At most this many sales after visits. */
const VISIT_SALES_MAX = 14;

/** The orders to the agencies, oldest first: two paid, one credited, one owed, one on order. */
const PURCHASE_ORDERS: readonly {
  supplier: DemoSupplierKey;
  orderedDaysAgo: number;
  /** Absent while it is only ordered. */
  receivedDaysAgo?: number;
  paidDaysAgo?: number;
  lines: readonly { medicine: DemoMedicineKey; quantity: number; free?: number }[];
}[] = [
  {
    supplier: 'ganesh',
    orderedDaysAgo: 40,
    receivedDaysAgo: 38,
    paidDaysAgo: 31,
    lines: [
      { medicine: 'suncros', quantity: 12, free: 1 },
      { medicine: 'adaferin', quantity: 10 },
      { medicine: 'cleanser', quantity: 6 },
      { medicine: 'moisturiser', quantity: 6 },
    ],
  },
  {
    supplier: 'omSai',
    orderedDaysAgo: 27,
    receivedDaysAgo: 25,
    paidDaysAgo: 18,
    lines: [
      { medicine: 'mintop', quantity: 8 },
      { medicine: 'isotroin', quantity: 10, free: 1 },
      { medicine: 'candid', quantity: 10 },
      { medicine: 'tugain', quantity: 4 },
    ],
  },
  {
    supplier: 'ganesh',
    orderedDaysAgo: 14,
    receivedDaysAgo: 12,
    lines: [
      { medicine: 'retinoA', quantity: 6 },
      { medicine: 'adaferin', quantity: 6 },
      { medicine: 'suncros', quantity: 6 },
    ],
  },
  {
    supplier: 'city',
    orderedDaysAgo: 5,
    receivedDaysAgo: 3,
    lines: [
      { medicine: 'isotroin', quantity: 6 },
      { medicine: 'cleanser', quantity: 4 },
    ],
  },
  {
    supplier: 'omSai',
    orderedDaysAgo: 1,
    lines: [
      { medicine: 'momate', quantity: 6 },
      { medicine: 'tugain', quantity: 4 },
    ],
  },
];

/**
 * The packs sent back to agencies: two leaking Cetaphil pumps from the first order (owed back
 * before the next order came, then set against it), and the expired Momate batch (still open —
 * the agency is owed nothing).
 */
const SUPPLIER_CREDITS: readonly {
  supplier: DemoSupplierKey;
  daysAgo: number;
  medicine: DemoMedicineKey;
  /** The order whose batch goes back (`PURCHASE_ORDERS[index]`); absent for the opening batch. */
  fromOrder?: number;
  /** Absent: the whole batch. */
  quantity?: number;
}[] = [
  { supplier: 'ganesh', daysAgo: 16, medicine: 'cleanser', fromOrder: 0, quantity: 2 },
  { supplier: 'omSai', daysAgo: 5, medicine: 'momate' },
];

/** The MRs who call: their brand, the days they came, and when they are due next. */
const MEDICAL_REPS: readonly {
  manufacturer: DemoManufacturerKey;
  visitDaysAgo: readonly number[];
  /** Today for the first — the app's MR rule opens a "Meet" task for them. */
  nextInDays: number;
}[] = [
  { manufacturer: 'galderma', visitDaysAgo: [33, 12], nextInDays: 0 },
  { manufacturer: 'sunPharma', visitDaysAgo: [26, 5], nextInDays: 9 },
  { manufacturer: 'drReddys', visitDaysAgo: [19], nextInDays: 14 },
];

/** The vendor bills, oldest first: one paid, one part-paid, one paid at the door, one owed. */
const STOCK_PURCHASES: readonly {
  vendor: DemoStockVendorKey;
  daysAgo: number;
  paid?: { daysAgo: number; share: number; mode: DemoPaymentMode };
  lines: readonly (readonly [DemoStockItemKey, number])[];
}[] = [
  {
    vendor: 'medisafe',
    daysAgo: 35,
    paid: { daysAgo: 30, share: 1, mode: 'upi' },
    lines: [
      ['gloves', 6],
      ['gauze', 4],
      ['alcoholPads', 2],
      ['prpKit', 10],
    ],
  },
  {
    vendor: 'dermaPro',
    daysAgo: 21,
    paid: { daysAgo: 15, share: 0.5, mode: 'upi' },
    lines: [
      ['glycolicPeel', 2],
      ['hydraSerum', 2],
      ['coolingGel', 4],
      ['sheetMasks', 30],
    ],
  },
  {
    vendor: 'hygiene',
    daysAgo: 9,
    paid: { daysAgo: 9, share: 1, mode: 'cash' },
    lines: [
      ['masks', 4],
      ['sheetRoll', 4],
    ],
  },
  {
    vendor: 'medisafe',
    daysAgo: 2,
    lines: [
      ['prpKit', 4],
      ['numbingCream', 4],
      ['gauze', 3],
    ],
  },
];

/** The two stock checks: what was counted, and what was found short or over (in units). */
const STOCK_COUNTS: readonly {
  daysAgo: number;
  differences: Readonly<Partial<Record<DemoStockItemKey, number>>>;
  items: readonly DemoStockItemKey[];
}[] = [
  {
    daysAgo: 24,
    items: ['gloves', 'gauze', 'masks', 'coolingGel', 'sheetMasks'],
    differences: { gauze: -1, sheetMasks: -2 },
  },
  {
    daysAgo: 4,
    items: ['prpKit', 'numbingCream', 'gloves', 'alcoholPads'],
    differences: { alcoholPads: 1 },
  },
];

const MEDICINE_BY_KEY = new Map(DEMO_MEDICINES.map((medicine) => [medicine.key, medicine]));
const OFFERING_NAME_BY_KEY = new Map(
  DEMO_OFFERINGS.map((offering) => [offering.key, offering.name]),
);

/** The medicine for a key (every key is in the catalog). */
export function demoMedicine(key: DemoMedicineKey): DemoMedicine {
  return MEDICINE_BY_KEY.get(key)!;
}

/** The stock item for a key (every key is in the catalog). */
export function demoStockItem(key: DemoStockItemKey): DemoStockItem {
  return DEMO_STOCK_ITEMS.find((item) => item.key === key)!;
}

/** A moment `minutes` after midnight on a date. */
function at(options: { date: string; minutes: number }): DemoMoment {
  return { date: options.date, time: clockTimeOfMinutes(options.minutes) };
}

/** A moment `minutes` after another (the same day). */
function later(options: { moment: DemoMoment; minutes: number }): DemoMoment {
  return at({
    date: options.moment.date,
    minutes: minutesOfClockTime(options.moment.time) + options.minutes,
  });
}

/** A sortable key for a moment. */
export function momentKey(moment: DemoMoment): string {
  return `${moment.date}T${moment.time}`;
}

/** The latest of some moments. */
function latestOf(moments: readonly [DemoMoment, ...DemoMoment[]]): DemoMoment {
  return moments.reduce((latest, moment) =>
    momentKey(moment) > momentKey(latest) ? moment : latest,
  );
}

/** The first day of a date's month (`2026-10-17` → `2026-10-01`). */
export function monthStartOf(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** The first day of the month `months` after a month's first day (negative for before). */
function addMonths(options: { monthStart: string; months: number }): string {
  const index =
    Number(options.monthStart.slice(0, 4)) * 12 + Number(options.monthStart.slice(5, 7)) - 1;
  const moved = index + options.months;
  return `${Math.floor(moved / 12)}-${String((moved % 12) + 1).padStart(2, '0')}-01`;
}

/** A date the clinic is open: a Sunday moves to the Saturday before. */
function openDay(date: string): string {
  return weekdayOfCalendarDate(date) === 'sun' ? addDaysToCalendarDate({ date, days: -1 }) : date;
}

/** A name's initials (`Shree Ganesh Pharma Distributors` → `SGPD`), for a bill number. */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase();
}

/** A quantity in thousandths (S4). */
function milliOf(quantity: number): number {
  return Math.round(quantity * 1000);
}

/** A weighted payment mode: counters take UPI first, then cash, then cards. */
function paymentMode(faker: Faker): DemoPaymentMode {
  return faker.helpers.weightedArrayElement([
    { weight: 5, value: 'upi' as const },
    { weight: 4, value: 'cash' as const },
    { weight: 1, value: 'card' as const },
  ]);
}

/** One money or stock event on the shelves' shared timeline. */
interface TimelineEvent {
  at: DemoMoment;
  /** Ties at one moment run in this order (stock arrives before it is drawn). */
  rank: number;
  run: () => void;
}

/** Runs events in time order, ties by rank, then in the order they were added. */
function runTimeline(events: readonly TimelineEvent[]): void {
  const ordered = events
    .map((event, index) => ({ event, index }))
    .sort(
      (first, second) =>
        momentKey(first.event.at).localeCompare(momentKey(second.event.at)) ||
        first.event.rank - second.event.rank ||
        first.index - second.index,
    );
  for (const { event } of ordered) event.run();
}

/**
 * Plans the medical store: the agencies and their prices, the opening batches, the orders
 * received into new batches, the returns to agencies set against what is owed, the sales drawn
 * from the earliest unexpired batch, an expense, and the MRs with their visits.
 */
export function planMedicalStore(input: DemoStockPlanInput): DemoMedicalStorePlan {
  return new MedicalStorePlanner(input).plan();
}

/** Builds the store's records on one timeline, so stock and money reconcile at every step. */
class MedicalStorePlanner {
  private readonly input: DemoStockPlanInput;
  private readonly openedAt: DemoMoment;
  private readonly suppliers: DemoSupplierPlan[] = [];
  private readonly prices: DemoSupplierPricePlan[] = [];
  private readonly batches: DemoMedicineBatchPlan[] = [];
  private readonly orders: (DemoPurchaseOrderPlan & { lines: DemoPurchaseOrderLinePlan[] })[] = [];
  private readonly credits: DemoSupplierCreditPlan[] = [];
  private readonly sales: DemoMedicalSalePlan[] = [];
  private readonly medicineMoved = new Map<DemoMedicineKey, DemoMoment>();
  private readonly batchNumbers = new Set<string>();

  constructor(input: DemoStockPlanInput) {
    this.input = input;
    this.openedAt = at({ date: this.daysAgo(HISTORY_DAYS), minutes: 600 });
  }

  private daysAgo(days: number): string {
    return addDaysToCalendarDate({ date: this.input.today, days: -days });
  }

  plan(): DemoMedicalStorePlan {
    this.planSuppliers();
    this.planOpeningBatches();
    const events: TimelineEvent[] = [];
    this.planOrders(events);
    this.planCredits(events);
    this.planSales(events);
    runTimeline(events);
    this.settleSales();
    const expenses = this.planExpenses();
    const { reps, repVisits } = this.planReps();
    return {
      suppliers: this.suppliers,
      prices: this.prices,
      medicines: DEMO_MEDICINES.map((medicine) => ({
        key: medicine.key,
        quantity: this.batches
          .filter((batch) => batch.medicine === medicine.key)
          .reduce((total, batch) => total + batch.quantity, 0),
        updatedAt: this.medicineMoved.get(medicine.key) ?? this.openedAt,
      })),
      batches: this.batches,
      purchaseOrders: this.orders,
      credits: this.credits,
      sales: this.sales,
      expenses,
      reps,
      repVisits,
      openedAt: this.openedAt,
    };
  }

  /** The agencies, each with its own mobile and GSTIN, and what each charges for its brands. */
  private planSuppliers(): void {
    const { input } = this;
    for (const supplier of DEMO_SUPPLIERS) {
      this.suppliers.push({
        key: supplier.key,
        name: supplier.name.replace('{city}', input.city.city),
        phone: input.newMobile(),
        gstNumber: input.newGstNumber(),
        manufacturers: supplier.manufacturers,
      });
    }
    for (const medicine of DEMO_MEDICINES) {
      for (const supplier of DEMO_SUPPLIERS) {
        if (!supplier.manufacturers.includes(medicine.manufacturer)) continue;
        const hasScheme =
          (supplier.key === 'ganesh' && medicine.key === 'suncros') ||
          (supplier.key === 'omSai' && medicine.key === 'isotroin');
        this.prices.push({
          medicine: medicine.key,
          supplier: supplier.key,
          ratePaise: Math.round(medicine.tradeRate * 100 * supplier.rateFactor),
          freeQuantity: hasScheme ? 1 : 0,
          leadDays: supplier.leadDays,
        });
      }
    }
  }

  private priceOf(options: {
    medicine: DemoMedicineKey;
    supplier: DemoSupplierKey;
  }): DemoSupplierPricePlan {
    return this.prices.find(
      (price) => price.medicine === options.medicine && price.supplier === options.supplier,
    )!;
  }

  /** A batch number in the maker's style (`SAG24K117`), unique for the medicine. */
  private batchNumber(medicine: DemoMedicine): string {
    const { faker } = this.input;
    for (;;) {
      const number = `${medicine.batchPrefix}${faker.string.numeric(2)}${faker.string.alpha({ length: 1, casing: 'upper' })}${faker.string.numeric(3)}`;
      if (!this.batchNumbers.has(number)) {
        this.batchNumbers.add(number);
        return number;
      }
    }
  }

  private addBatch(batch: Omit<DemoMedicineBatchPlan, 'batchNumber' | 'updatedAt'>): number {
    this.batches.push({
      ...batch,
      batchNumber: this.batchNumber(demoMedicine(batch.medicine)),
      updatedAt: batch.createdAt,
    });
    this.medicineMoved.set(batch.medicine, batch.createdAt);
    return this.batches.length - 1;
  }

  /** The stock the store started with — one batch each, bought from the brand's first agency. */
  private planOpeningBatches(): void {
    const thisMonth = monthStartOf(this.input.today);
    for (const medicine of DEMO_MEDICINES) {
      const supplier = DEMO_SUPPLIERS.find((item) =>
        item.manufacturers.includes(medicine.manufacturer),
      )!;
      this.addBatch({
        medicine: medicine.key,
        expiryMonth: addMonths({ monthStart: thisMonth, months: medicine.opening.expiresInMonths }),
        quantity: medicine.opening.quantity,
        purchaseRatePaise: this.priceOf({ medicine: medicine.key, supplier: supplier.key })
          .ratePaise,
        supplier: supplier.key,
        createdAt: this.openedAt,
      });
    }
  }

  /** The orders: written when ordered; received into new batches; paid in full when paid. */
  private planOrders(events: TimelineEvent[]): void {
    const { faker } = this.input;
    for (const [index, order] of PURCHASE_ORDERS.entries()) {
      const orderDate = this.daysAgo(order.orderedDaysAgo);
      const orderedAt = at({ date: orderDate, minutes: faker.number.int({ min: 660, max: 720 }) });
      const lines = order.lines.map((line) => {
        const { ratePaise } = this.priceOf({ medicine: line.medicine, supplier: order.supplier });
        return {
          medicine: line.medicine,
          quantity: line.quantity,
          freeQuantity: line.free ?? 0,
          ratePaise,
          amountPaise: line.quantity * ratePaise,
        };
      });
      const planned: DemoPurchaseOrderPlan & { lines: DemoPurchaseOrderLinePlan[] } = {
        supplier: order.supplier,
        orderDate,
        orderedAt,
        lines,
        totalPaise: lines.reduce((total, line) => total + line.amountPaise, 0),
        paidPaise: 0,
        creditedPaise: 0,
        updatedAt: orderedAt,
      };
      this.orders.push(planned);
      if (order.receivedDaysAgo !== undefined) {
        const receivedAt = at({ date: this.daysAgo(order.receivedDaysAgo), minutes: 900 });
        const supplierName = this.suppliers.find((item) => item.key === order.supplier)!.name;
        const billNumber = `${initialsOf(supplierName)}/${faker.string.numeric(4)}`;
        const shelfLife = lines.map(() => faker.number.int({ min: 18, max: 30 }));
        events.push({
          at: receivedAt,
          rank: 0,
          run: () => this.receiveOrder({ index, receivedAt, billNumber, shelfLife }),
        });
      }
      if (order.paidDaysAgo !== undefined) {
        const paidAt = at({ date: this.daysAgo(order.paidDaysAgo), minutes: 720 });
        const mode = paymentMode(faker);
        events.push({ at: paidAt, rank: 1, run: () => this.payOrder({ index, paidAt, mode }) });
      }
    }
  }

  /** MD16: each line goes into a new batch (`quantity + free`); the agency's open credits apply. */
  private receiveOrder(options: {
    index: number;
    receivedAt: DemoMoment;
    billNumber: string;
    shelfLife: readonly number[];
  }): void {
    const order = this.orders[options.index]!;
    const receivedMonth = monthStartOf(options.receivedAt.date);
    order.receivedAt = options.receivedAt;
    order.supplierBillNumber = options.billNumber;
    order.updatedAt = options.receivedAt;
    for (const [lineIndex, line] of order.lines.entries()) {
      line.batch = this.addBatch({
        medicine: line.medicine,
        expiryMonth: addMonths({
          monthStart: receivedMonth,
          months: options.shelfLife[lineIndex]!,
        }),
        quantity: line.quantity + line.freeQuantity,
        purchaseRatePaise: line.ratePaise,
        supplier: order.supplier,
        purchaseOrder: options.index,
        createdAt: options.receivedAt,
      });
    }
    this.applyCredits({ supplier: order.supplier, at: options.receivedAt });
  }

  /** A received order's due, in paise (nothing is due while it is only ordered). */
  private dueOf(order: DemoPurchaseOrderPlan): number {
    return order.receivedAt ? order.totalPaise - order.paidPaise - order.creditedPaise : 0;
  }

  /** The supplier bill that settles what an order still owes. */
  private payOrder(options: { index: number; paidAt: DemoMoment; mode: DemoPaymentMode }): void {
    const order = this.orders[options.index]!;
    const amountPaise = this.dueOf(order);
    if (amountPaise <= 0) return;
    order.paidPaise += amountPaise;
    order.payment = { mode: options.mode, at: options.paidAt, amountPaise };
    order.updatedAt = latestOf([order.updatedAt, options.paidAt]);
  }

  /**
   * MD11: an agency's open credits, oldest first, against its received orders still due, oldest
   * first — each order's credited amount and each credit's applied amount move by the same paise.
   */
  private applyCredits(options: { supplier: DemoSupplierKey; at: DemoMoment }): void {
    const dues = this.orders
      .filter((order) => order.supplier === options.supplier && this.dueOf(order) > 0)
      .sort((first, second) =>
        momentKey(first.receivedAt!).localeCompare(momentKey(second.receivedAt!)),
      );
    for (const credit of this.credits) {
      if (credit.supplier !== options.supplier) continue;
      for (const order of dues) {
        const take = Math.min(credit.amountPaise - credit.appliedPaise, this.dueOf(order));
        if (take <= 0) continue;
        credit.appliedPaise += take;
        order.creditedPaise += take;
        credit.updatedAt = latestOf([credit.updatedAt, options.at]);
        order.updatedAt = latestOf([order.updatedAt, options.at]);
      }
    }
  }

  /** The returns to agencies: packs out of the batch at its purchase rate, owed back (MD11). */
  private planCredits(events: TimelineEvent[]): void {
    for (const credit of SUPPLIER_CREDITS) {
      const creditAt = at({ date: this.daysAgo(credit.daysAgo), minutes: 1050 });
      events.push({
        at: creditAt,
        rank: 1,
        run: () => {
          const batchIndex = this.batches.findIndex(
            (batch) =>
              batch.medicine === credit.medicine &&
              batch.purchaseOrder === credit.fromOrder &&
              batch.supplier === credit.supplier,
          );
          const batch = this.batches[batchIndex];
          if (!batch) return;
          const quantity = Math.min(credit.quantity ?? batch.quantity, batch.quantity);
          if (quantity <= 0) return;
          this.moveBatch({ index: batchIndex, change: -quantity, at: creditAt });
          this.credits.push({
            supplier: credit.supplier,
            medicine: credit.medicine,
            batch: batchIndex,
            quantity,
            ratePaise: batch.purchaseRatePaise,
            amountPaise: quantity * batch.purchaseRatePaise,
            appliedPaise: 0,
            at: creditAt,
            updatedAt: creditAt,
          });
          this.applyCredits({ supplier: credit.supplier, at: creditAt });
        },
      });
    }
  }

  private moveBatch(options: { index: number; change: number; at: DemoMoment }): void {
    const batch = this.batches[options.index]!;
    batch.quantity += options.change;
    batch.updatedAt = latestOf([batch.updatedAt, options.at]);
    this.medicineMoved.set(
      batch.medicine,
      latestOf([this.medicineMoved.get(batch.medicine)!, options.at]),
    );
  }

  /**
   * The sales: after every third visit of the last four weeks, what the doctor sent the patient
   * for (by their case), and one walk-in buying a sunscreen. Each draws its packs when it happens.
   */
  private planSales(events: TimelineEvent[]): void {
    const { faker, today, appointments, patients } = this.input;
    const from = this.daysAgo(SALE_DAYS);
    const visits = appointments
      .filter((visit) => visit.status === 'completed' && visit.completedAt && visit.date >= from)
      .sort((first, second) =>
        momentKey(first.completedAt!).localeCompare(momentKey(second.completedAt!)),
      )
      .filter((_visit, index) => index % 3 === 0)
      .slice(0, VISIT_SALES_MAX);
    const intents: {
      sale: Omit<DemoMedicalSalePlan, 'lines' | 'paidShare' | 'payment'>;
      wants: { medicine: DemoMedicineKey; quantity: number }[];
    }[] = [];
    for (const visit of visits) {
      const patient = patients.find((item) => item.person === visit.person)!;
      const shelf = DEMO_CASE_MEDICINES[patient.caseKey] ?? ['suncros'];
      const picks = faker.helpers.arrayElements(shelf, { min: 1, max: Math.min(3, shelf.length) });
      intents.push({
        sale: {
          person: visit.person,
          branch: visit.branch,
          doctor: visit.doctor,
          at: later({ moment: visit.completedAt!, minutes: 10 }),
        },
        wants: picks.map((medicine) => ({
          medicine,
          quantity: demoMedicine(medicine).packsPerSale,
        })),
      });
    }
    const walkIn = this.input.leads.find((lead) => lead.status === 'contacted');
    if (walkIn) {
      const day = addDaysToCalendarDate({ date: walkIn.createdAt.date, days: 1 });
      intents.push({
        sale: {
          person: walkIn.person,
          branch: walkIn.branch,
          at: at({ date: day > today ? today : day, minutes: 1050 }),
        },
        wants: [{ medicine: 'suncros', quantity: 1 }],
      });
    }
    for (const intent of intents) {
      events.push({
        at: intent.sale.at,
        rank: 2,
        run: () => {
          const lines = intent.wants.flatMap((want) =>
            this.drawSale({ ...want, at: intent.sale.at }),
          );
          if (lines.length > 0) {
            this.sales.push({ ...intent.sale, lines, paidShare: 1, payment: null });
          }
        },
      });
    }
  }

  /**
   * What was paid on each sale, in the order they were rung up: the third sale after a visit is
   * left unpaid and the sixth part-paid; the rest — and the walk-in — paid at the counter.
   */
  private settleSales(): void {
    const { faker } = this.input;
    let afterVisit = 0;
    for (const sale of this.sales) {
      let paidShare = 1;
      if (sale.doctor !== undefined) {
        afterVisit += 1;
        if (afterVisit === 3) paidShare = 0;
        else if (afterVisit === 6) paidShare = 0.5;
      }
      sale.paidShare = paidShare;
      sale.payment =
        paidShare > 0
          ? {
              mode: sale.doctor === undefined ? 'upi' : paymentMode(faker),
              at: later({ moment: sale.at, minutes: 2 }),
            }
          : null;
    }
  }

  /**
   * MD5: takes packs of a medicine from its unexpired batches that have stock — the earliest
   * expiry first, then the oldest batch — as many as there are; one line per batch drawn, at the
   * medicine's near-expiry discount.
   */
  private drawSale(options: {
    medicine: DemoMedicineKey;
    quantity: number;
    at: DemoMoment;
  }): DemoMedicalSaleLinePlan[] {
    const monthStart = monthStartOf(options.at.date);
    const sellable = this.batches
      .map((batch, index) => ({ batch, index }))
      .filter(
        ({ batch }) =>
          batch.medicine === options.medicine &&
          batch.quantity > 0 &&
          batch.expiryMonth >= monthStart &&
          momentKey(batch.createdAt) <= momentKey(options.at),
      )
      .sort(
        (first, second) =>
          first.batch.expiryMonth.localeCompare(second.batch.expiryMonth) ||
          first.index - second.index,
      );
    const lines: DemoMedicalSaleLinePlan[] = [];
    let left = options.quantity;
    for (const { batch, index } of sellable) {
      if (left === 0) break;
      const quantity = Math.min(left, batch.quantity);
      this.moveBatch({ index, change: -quantity, at: options.at });
      lines.push({
        medicine: options.medicine,
        batch: index,
        quantity,
        discountPercent: demoMedicine(options.medicine).nearExpiryDiscountPercent ?? 0,
      });
      left -= quantity;
    }
    return lines;
  }

  /** A courier for an urgent order — the store's `medicines` expense. */
  private planExpenses(): DemoStoreExpensePlan[] {
    return [
      {
        payeeName: 'City Express Couriers',
        note: 'Same-day courier for the urgent Isotroin order',
        amountPaise: 18_000,
        mode: 'cash',
        at: at({ date: this.daysAgo(26), minutes: 750 }),
      },
    ];
  }

  /** The MRs — one per brand — their visits so far and the next they are due for. */
  private planReps(): { reps: DemoMedicalRepPlan[]; repVisits: DemoMedicalRepVisitPlan[] } {
    const { input } = this;
    const reps: DemoMedicalRepPlan[] = [];
    const repVisits: DemoMedicalRepVisitPlan[] = [];
    for (const rep of MEDICAL_REPS) {
      const name = input.newName('male');
      const phone = input.newMobile();
      const nextVisitOn = addDaysToCalendarDate({ date: input.today, days: rep.nextInDays });
      const dates = rep.visitDaysAgo.map((days) => openDay(this.daysAgo(days)));
      const notes = DEMO_REP_VISITS[rep.manufacturer] ?? [];
      const repIndex = reps.length;
      let lastLogged = at({ date: this.daysAgo(HISTORY_DAYS - 2), minutes: 720 });
      const createdAt = lastLogged;
      for (const [visitIndex, visitDate] of dates.entries()) {
        const visitAt = at({
          date: visitDate,
          minutes: 810 + input.faker.number.int({ min: 0, max: 6 }) * 10,
        });
        const words = notes[visitIndex % Math.max(notes.length, 1)];
        repVisits.push({
          rep: repIndex,
          visitDate,
          nextVisitOn: dates[visitIndex + 1] ?? nextVisitOn,
          samples: words?.samples ?? 'Product literature',
          notes: words?.notes ?? 'Shared the latest product literature.',
          loggedBy: 'owner',
          at: visitAt,
        });
        lastLogged = visitAt;
      }
      reps.push({
        name: `${name.firstName} ${name.lastName}`,
        phone,
        manufacturers: [rep.manufacturer],
        nextVisitOn,
        createdAt,
        updatedAt: lastLogged,
      });
    }
    return { reps, repVisits };
  }
}

/**
 * Plans the clinic's own stock: the vendors, every item's opening balance, the vendor bills
 * received line by line, what each treatment session and each week's procedures used, a damaged
 * pack, a return, an entry made twice and reverted, and two stock checks — every movement with the
 * balance it left.
 */
export function planClinicStock(input: DemoStockPlanInput): DemoClinicStockPlan {
  return new ClinicStockPlanner(input).plan();
}

/** Builds the stock movements on one timeline, so each balance is the sum before it. */
class ClinicStockPlanner {
  private readonly input: DemoStockPlanInput;
  private readonly openedAt: DemoMoment;
  private readonly balance = new Map<DemoStockItemKey, number>();
  private readonly lastRate = new Map<DemoStockItemKey, number>();
  private readonly moved = new Map<DemoStockItemKey, DemoMoment>();
  private readonly movements: DemoStockMovementPlan[] = [];
  private readonly purchases: DemoStockPurchasePlan[] = [];
  private readonly counts: DemoStockCountPlan[] = [];

  constructor(input: DemoStockPlanInput) {
    this.input = input;
    this.openedAt = at({ date: this.daysAgo(HISTORY_DAYS), minutes: 585 });
  }

  private daysAgo(days: number): string {
    return addDaysToCalendarDate({ date: this.input.today, days: -days });
  }

  plan(): DemoClinicStockPlan {
    const vendors = DEMO_STOCK_VENDORS.map((vendor) => ({
      key: vendor.key,
      name: vendor.name,
      phone: this.input.newMobile(),
    }));
    const events: TimelineEvent[] = [];
    for (const item of DEMO_STOCK_ITEMS) {
      events.push({
        at: this.openedAt,
        rank: 0,
        run: () =>
          this.move({
            item: item.key,
            type: 'opening',
            changeMilli: milliOf(item.opening),
            at: this.openedAt,
            by: 'frontDesk',
            note: 'Opening balance',
          }),
      });
    }
    this.planPurchases(events);
    this.planUse(events);
    this.planCorrections(events);
    this.planCounts(events);
    runTimeline(events);
    return {
      vendors,
      items: DEMO_STOCK_ITEMS.map((item) => ({
        key: item.key,
        quantityMilli: this.balance.get(item.key) ?? 0,
        lastRatePaise: this.lastRate.get(item.key) ?? null,
        updatedAt: this.moved.get(item.key) ?? this.openedAt,
      })),
      purchases: this.purchases,
      counts: this.counts,
      movements: this.movements,
      openedAt: this.openedAt,
    };
  }

  /**
   * S5: one movement — a taking one only when the balance covers it (`partial` takes what is
   * there); returns its index, or null when nothing moved.
   */
  private move(
    movement: Omit<DemoStockMovementPlan, 'afterMilli'> & { partial?: boolean },
  ): number | null {
    const { partial, ...rest } = movement;
    const before = this.balance.get(movement.item) ?? 0;
    let change = movement.changeMilli;
    if (before + change < 0) {
      if (!partial || before === 0) return null;
      change = -before;
    }
    if (change === 0) return null;
    const afterMilli = before + change;
    this.balance.set(movement.item, afterMilli);
    this.moved.set(movement.item, movement.at);
    this.movements.push({ ...rest, changeMilli: change, afterMilli });
    return this.movements.length - 1;
  }

  /** The vendor bills: each line a `received` movement and the item's latest rate (S10, S11). */
  private planPurchases(events: TimelineEvent[]): void {
    const { faker } = this.input;
    for (const purchase of STOCK_PURCHASES) {
      const vendor = DEMO_STOCK_VENDORS.find((item) => item.key === purchase.vendor)!;
      const purchaseDate = this.daysAgo(purchase.daysAgo);
      const purchaseAt = at({ date: purchaseDate, minutes: 690 });
      const lines = purchase.lines.map(([key, quantity]) => {
        const item = DEMO_STOCK_ITEMS.find((entry) => entry.key === key)!;
        const quantityMilli = milliOf(quantity);
        const ratePaise = Math.round(item.rate * 100);
        return {
          item: key,
          quantityMilli,
          ratePaise,
          amountPaise: Math.round((quantityMilli * ratePaise) / 1000),
        };
      });
      const billPaise = lines.reduce((total, line) => total + line.amountPaise, 0);
      const paid = purchase.paid;
      const payment = paid
        ? {
            mode: paid.mode,
            at: at({
              date: this.daysAgo(paid.daysAgo),
              minutes: paid.daysAgo === purchase.daysAgo ? 705 : 720,
            }),
            // Part-payments go in whole rupees, as the desk pays them.
            amountPaise:
              paid.share === 1 ? billPaise : Math.round((billPaise * paid.share) / 100) * 100,
          }
        : undefined;
      const index = this.purchases.length;
      this.purchases.push({
        vendor: purchase.vendor,
        purchaseDate,
        at: purchaseAt,
        billNumber: `${vendor.billPrefix}/${faker.string.numeric(4)}`,
        lines,
        billPaise,
        paidPaise: payment?.amountPaise ?? 0,
        ...(payment ? { payment } : {}),
        updatedAt: payment ? latestOf([purchaseAt, payment.at]) : purchaseAt,
      });
      events.push({
        at: purchaseAt,
        rank: 0,
        run: () => {
          for (const line of lines) {
            this.move({
              item: line.item,
              type: 'received',
              changeMilli: line.quantityMilli,
              at: purchaseAt,
              by: 'frontDesk',
              purchase: index,
            });
            this.lastRate.set(line.item, line.ratePaise);
          }
        },
      });
    }
  }

  /** What was used: each treatment session's share (on its file), and each week's procedures. */
  private planUse(events: TimelineEvent[]): void {
    const { appointments, treatments } = this.input;
    for (const [index, treatment] of treatments.entries()) {
      const visit = appointments[treatment.appointment]!;
      const usedAt = later({ moment: treatment.at, minutes: 20 });
      for (const item of DEMO_STOCK_ITEMS) {
        const perSession = item.perSession?.[visit.offering];
        if (perSession === undefined) continue;
        events.push({
          at: usedAt,
          rank: 1,
          run: () =>
            this.move({
              item: item.key,
              type: 'used',
              changeMilli: -milliOf(perSession),
              at: usedAt,
              by: visit.therapist ?? visit.doctor,
              usedFor: OFFERING_NAME_BY_KEY.get(visit.offering)!,
              treatment: index,
            }),
        });
      }
    }
    for (const item of DEMO_STOCK_ITEMS) {
      if (!item.isWeekly) continue;
      for (let days = HISTORY_DAYS - 1; days > 0; days -= 7) {
        const usedAt = at({ date: this.daysAgo(days), minutes: 1170 });
        events.push({
          at: usedAt,
          rank: 1,
          run: () =>
            this.move({
              item: item.key,
              type: 'used',
              changeMilli: -milliOf(item.usagePerWeek),
              at: usedAt,
              by: 'frontDesk',
              usedFor: 'Procedure room — the week',
              partial: true,
            }),
        });
      }
    }
    const touchUp = at({ date: this.daysAgo(8), minutes: 960 });
    events.push({
      at: touchUp,
      rank: 1,
      run: () =>
        this.move({
          item: 'salicylicPeel',
          type: 'used',
          changeMilli: -milliOf(0.3),
          at: touchUp,
          by: 'mainTherapist',
          usedFor: 'Acne touch-up peel',
          partial: true,
        }),
    });
  }

  /** A return to a vendor, a damaged pack, and an entry made twice and reverted (S8). */
  private planCorrections(events: TimelineEvent[]): void {
    const returnedAt = at({ date: this.daysAgo(33), minutes: 720 });
    events.push({
      at: returnedAt,
      rank: 1,
      run: () =>
        this.move({
          item: 'gloves',
          type: 'returned',
          changeMilli: -milliOf(1),
          at: returnedAt,
          by: 'frontDesk',
          note: 'Large size sent by mistake — returned to Medisafe Surgicals',
        }),
    });
    const damagedAt = at({ date: this.daysAgo(17), minutes: 735 });
    events.push({
      at: damagedAt,
      rank: 1,
      run: () =>
        this.move({
          item: 'sheetMasks',
          type: 'damaged',
          changeMilli: -milliOf(2),
          at: damagedAt,
          by: 'secondTherapist',
          note: 'Pouches torn in the delivery carton',
          partial: true,
        }),
    });
    const twiceAt = at({ date: this.daysAgo(10), minutes: 1080 });
    const revertAt = later({ moment: twiceAt, minutes: 20 });
    let twice: number | null = null;
    events.push({
      at: twiceAt,
      rank: 1,
      run: () => {
        twice = this.move({
          item: 'gauze',
          type: 'used',
          changeMilli: -milliOf(1),
          at: twiceAt,
          by: 'frontDesk',
          usedFor: 'Procedure room — the week',
        });
      },
    });
    events.push({
      at: revertAt,
      rank: 1,
      run: () => {
        if (twice === null) return;
        this.move({
          item: 'gauze',
          type: 'reverted',
          changeMilli: milliOf(1),
          at: revertAt,
          by: 'frontDesk',
          note: 'Entered twice',
          reverts: twice,
          revertReason: 'mistake',
        });
      },
    });
  }

  /** The stock checks (S9): each counted item's balance then, and an `adjust` for each difference. */
  private planCounts(events: TimelineEvent[]): void {
    for (const count of STOCK_COUNTS) {
      const countedAt = at({ date: this.daysAgo(count.daysAgo), minutes: 1140 });
      events.push({
        at: countedAt,
        rank: 3,
        run: () => {
          const index = this.counts.length;
          const lines = count.items.map((item) => {
            const systemMilli = this.balance.get(item) ?? 0;
            const countedMilli = Math.max(0, systemMilli + milliOf(count.differences[item] ?? 0));
            return { item, systemMilli, countedMilli };
          });
          this.counts.push({ at: countedAt, by: 'mainTherapist', lines });
          for (const line of lines) {
            this.move({
              item: line.item,
              type: 'adjust',
              changeMilli: line.countedMilli - line.systemMilli,
              at: countedAt,
              by: 'mainTherapist',
              note: STOCK_COUNT_MOVEMENT_NOTE,
              count: index,
            });
          }
        },
      });
    }
  }
}

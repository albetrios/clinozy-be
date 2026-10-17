import { describe, expect, it } from 'vitest';
import { Faker, base, en, en_IN } from '@faker-js/faker';
import { buildDemoClinicPlan, type DemoClinicPlan } from '@/scripts/seed/demo-clinic.plan.js';
import { demoMedicine, momentKey, monthStartOf } from '@/scripts/seed/demo-clinic.stock.plan.js';
import { DEMO_MEDICINES, DEMO_STOCK_ITEMS } from '@/scripts/seed/demo-clinic.catalog.js';
import { addDaysToCalendarDate } from '@/shared/utils/validation/record-fields.util.js';
import {
  GST_NUMBER_PATTERN,
  MOBILE_NUMBER_PATTERN,
} from '@/shared/constants/record-fields.constants.js';

/** A plan from its own Faker, so suites running side by side never share a generator. */
function planFor(options: { seed: number; today: string; now: string }): DemoClinicPlan {
  const faker = new Faker({ locale: [en_IN, en, base] });
  faker.seed(options.seed);
  return buildDemoClinicPlan({ faker, today: options.today, now: options.now });
}

/** A week of days (Sunday included) — and a month's first and last days — at two clocks. */
const CASES = [0, 1, 2, 3, 4, 5, 6, 19, 20]
  .flatMap((offset) =>
    ['09:10', '15:40'].map((now) => ({
      seed: 12_345 + offset,
      today: addDaysToCalendarDate({ date: '2026-10-11', days: offset }),
      now,
    })),
  )
  .concat([{ seed: 12_345, today: '2027-01-01', now: '12:00' }]);

describe('buildDemoClinicPlan — the medical store', () => {
  it.each(CASES)(
    'keeps every batch and medicine at what arrived less what left ($today)',
    (options) => {
      const { store } = planFor(options);
      const left = store.batches.map((batch, index) => {
        const order =
          batch.purchaseOrder === undefined ? null : store.purchaseOrders[batch.purchaseOrder]!;
        const line = order?.lines.find((item) => item.batch === index);
        const arrived = line
          ? line.quantity + line.freeQuantity
          : demoMedicine(batch.medicine).opening.quantity;
        const sold = store.sales
          .flatMap((sale) => sale.lines)
          .filter((item) => item.batch === index)
          .reduce((total, item) => total + item.quantity, 0);
        const credited = store.credits
          .filter((credit) => credit.batch === index)
          .reduce((total, credit) => total + credit.quantity, 0);
        return arrived - sold - credited;
      });
      for (const [index, batch] of store.batches.entries()) {
        expect(batch.quantity).toBe(left[index]);
        expect(batch.quantity).toBeGreaterThanOrEqual(0);
        expect(batch.expiryMonth).toMatch(/^\d{4}-\d{2}-01$/);
        expect(momentKey(batch.updatedAt) >= momentKey(batch.createdAt)).toBe(true);
      }
      for (const medicine of store.medicines) {
        const batches = store.batches.filter((batch) => batch.medicine === medicine.key);
        expect(medicine.quantity).toBe(batches.reduce((total, batch) => total + batch.quantity, 0));
        expect(new Set(batches.map((batch) => batch.batchNumber.toLowerCase())).size).toBe(
          batches.length,
        );
      }
    },
  );

  it.each(CASES)(
    'sells only from unexpired batches in stock, earliest expiry first ($today)',
    (options) => {
      const { store, people, patients } = planFor(options);
      expect(store.sales.length).toBeGreaterThanOrEqual(8);
      for (const sale of store.sales) {
        expect(sale.at.date <= options.today).toBe(true);
        expect(sale.lines.length).toBeGreaterThan(0);
        expect(people[sale.person]).toBeDefined();
        for (const line of sale.lines) {
          const batch = store.batches[line.batch]!;
          expect(batch.medicine).toBe(line.medicine);
          expect(batch.expiryMonth >= monthStartOf(sale.at.date)).toBe(true);
          expect(momentKey(batch.createdAt) <= momentKey(sale.at)).toBe(true);
          expect(line.discountPercent).toBe(
            demoMedicine(line.medicine).nearExpiryDiscountPercent ?? 0,
          );
        }
      }
      // Bought by the clinic's patients after their visit, and once by a walk-in enquiry.
      const patientPeople = new Set(patients.map((patient) => patient.person));
      expect(store.sales.some((sale) => sale.doctor && patientPeople.has(sale.person))).toBe(true);
      expect(store.sales.some((sale) => !(sale.doctor || patientPeople.has(sale.person)))).toBe(
        true,
      );
      const shares = new Set(store.sales.map((sale) => sale.paidShare));
      for (const share of [0, 0.5, 1]) expect(shares).toContain(share);
      for (const sale of store.sales) expect(sale.payment === null).toBe(sale.paidShare === 0);
    },
  );

  it.each(CASES)(
    'reconciles every order with its payments and the agencies’ credits ($today)',
    (options) => {
      const { store } = planFor(options);
      for (const order of store.purchaseOrders) {
        for (const line of order.lines) {
          expect(line.amountPaise).toBe(line.quantity * line.ratePaise);
          expect(line.batch === undefined).toBe(order.receivedAt === undefined);
        }
        expect(order.totalPaise).toBe(
          order.lines.reduce((total, line) => total + line.amountPaise, 0),
        );
        expect(order.paidPaise + order.creditedPaise).toBeLessThanOrEqual(order.totalPaise);
        expect(order.paidPaise).toBe(order.payment?.amountPaise ?? 0);
        if (!order.receivedAt) expect(order.paidPaise + order.creditedPaise).toBe(0);
        expect(order.orderDate <= options.today).toBe(true);
      }
      const dues = store.purchaseOrders
        .filter((order) => order.receivedAt)
        .map((order) => order.totalPaise - order.paidPaise - order.creditedPaise);
      expect(dues.some((due) => due === 0)).toBe(true);
      expect(dues.some((due) => due > 0)).toBe(true);
      expect(store.purchaseOrders.some((order) => !order.receivedAt)).toBe(true);
      for (const credit of store.credits) {
        expect(credit.amountPaise).toBe(credit.quantity * credit.ratePaise);
        expect(credit.appliedPaise).toBeLessThanOrEqual(credit.amountPaise);
        expect(store.batches[credit.batch]!.supplier).toBe(credit.supplier);
      }
      for (const supplier of store.suppliers) {
        const credited = store.purchaseOrders
          .filter((order) => order.supplier === supplier.key)
          .reduce((total, order) => total + order.creditedPaise, 0);
        const applied = store.credits
          .filter((credit) => credit.supplier === supplier.key)
          .reduce((total, credit) => total + credit.appliedPaise, 0);
        expect(credited).toBe(applied);
      }
      // One credit set against a later order, one still open.
      expect(store.credits.some((credit) => credit.appliedPaise === credit.amountPaise)).toBe(true);
      expect(store.credits.some((credit) => credit.appliedPaise === 0)).toBe(true);
    },
  );

  it.each(CASES)('shows low, out-of-stock and near-expiry medicines ($today)', (options) => {
    const { store } = planFor(options);
    const level = (key: string) => {
      const medicine = store.medicines.find((item) => item.key === key)!;
      return { quantity: medicine.quantity, min: demoMedicine(medicine.key).minStock };
    };
    expect(store.medicines).toHaveLength(DEMO_MEDICINES.length);
    expect(store.medicines.some((medicine) => medicine.quantity === 0)).toBe(true);
    expect(
      store.medicines.some((medicine) => {
        const { quantity, min } = level(medicine.key);
        return quantity > 0 && quantity <= min;
      }),
    ).toBe(true);
    const horizon = addDaysToCalendarDate({ date: options.today, days: 90 });
    const thisMonth = monthStartOf(options.today);
    expect(
      store.batches.some(
        (batch) =>
          batch.quantity > 0 && batch.expiryMonth >= thisMonth && batch.expiryMonth <= horizon,
      ),
    ).toBe(true);
  });

  it.each(CASES)(
    'gives agencies and MRs real-looking numbers, and MRs visits in order ($today)',
    (options) => {
      const plan = planFor(options);
      const { store } = plan;
      for (const supplier of store.suppliers) {
        expect(supplier.gstNumber).toMatch(new RegExp(GST_NUMBER_PATTERN));
        expect(supplier.gstNumber.slice(0, 2)).toBe(plan.city.gstStateCode);
      }
      const phones = [
        ...plan.staff.map((member) => member.phone),
        ...plan.people.map((person) => person.phone),
        ...plan.branches.map((branch) => branch.phone),
        ...store.suppliers.map((supplier) => supplier.phone),
        ...store.reps.map((rep) => rep.phone),
        ...plan.stock.vendors.map((vendor) => vendor.phone),
      ];
      for (const phone of phones) expect(phone).toMatch(new RegExp(MOBILE_NUMBER_PATTERN));
      expect(new Set(phones).size).toBe(phones.length);
      for (const visit of store.repVisits) {
        expect(visit.nextVisitOn > visit.visitDate).toBe(true);
        expect(visit.visitDate < options.today).toBe(true);
        expect(store.reps[visit.rep]).toBeDefined();
      }
      // One MR is due today: the app's MR rule opens their "Meet" task.
      expect(store.reps.some((rep) => rep.nextVisitOn === options.today)).toBe(true);
    },
  );
});

describe('buildDemoClinicPlan — the clinic stock', () => {
  it.each(CASES)(
    'keeps every balance the sum of its movements, never below zero ($today)',
    (options) => {
      const { stock, treatments } = planFor(options);
      const balance = new Map<string, number>();
      let previous = '';
      for (const [index, movement] of stock.movements.entries()) {
        expect(momentKey(movement.at) >= previous).toBe(true);
        previous = momentKey(movement.at);
        expect(movement.changeMilli).not.toBe(0);
        const after = (balance.get(movement.item) ?? 0) + movement.changeMilli;
        expect(movement.afterMilli).toBe(after);
        expect(after).toBeGreaterThanOrEqual(0);
        balance.set(movement.item, after);
        if (['opening', 'received'].includes(movement.type))
          expect(movement.changeMilli).toBeGreaterThan(0);
        if (['used', 'damaged', 'returned'].includes(movement.type))
          expect(movement.changeMilli).toBeLessThan(0);
        expect(movement.usedFor === undefined || movement.type === 'used').toBe(true);
        if (movement.treatment !== undefined) {
          expect(movement.type).toBe('used');
          expect(treatments[movement.treatment]).toBeDefined();
        }
        expect(movement.purchase === undefined || movement.type === 'received').toBe(true);
        expect(movement.count === undefined || movement.type === 'adjust').toBe(true);
        if (movement.type === 'reverted') {
          const reverted = stock.movements[movement.reverts!]!;
          expect(movement.reverts!).toBeLessThan(index);
          expect(reverted.item).toBe(movement.item);
          expect(movement.changeMilli).toBe(-reverted.changeMilli);
        }
      }
      expect(stock.items).toHaveLength(DEMO_STOCK_ITEMS.length);
      for (const item of stock.items) expect(item.quantityMilli).toBe(balance.get(item.key) ?? 0);
      expect(stock.movements.some((movement) => movement.treatment !== undefined)).toBe(true);
    },
  );

  it.each(CASES)(
    'receives each bill line and adjusts each counted difference ($today)',
    (options) => {
      const { stock } = planFor(options);
      for (const [index, purchase] of stock.purchases.entries()) {
        for (const line of purchase.lines) {
          expect(line.amountPaise).toBe(Math.round((line.quantityMilli * line.ratePaise) / 1000));
        }
        expect(purchase.billPaise).toBe(
          purchase.lines.reduce((total, line) => total + line.amountPaise, 0),
        );
        expect(purchase.paidPaise).toBe(purchase.payment?.amountPaise ?? 0);
        expect(purchase.paidPaise).toBeLessThanOrEqual(purchase.billPaise);
        const received = stock.movements.filter((movement) => movement.purchase === index);
        expect(received.map((movement) => [movement.item, movement.changeMilli])).toEqual(
          purchase.lines.map((line) => [line.item, line.quantityMilli]),
        );
      }
      const paid = stock.purchases.map((purchase) => purchase.paidPaise / purchase.billPaise);
      expect(paid).toContain(1);
      expect(paid).toContain(0);
      expect(paid.some((share) => share > 0 && share < 1)).toBe(true);
      for (const [index, count] of stock.counts.entries()) {
        expect(count.lines.some((line) => line.countedMilli !== line.systemMilli)).toBe(true);
        for (const line of count.lines) {
          const adjust = stock.movements.filter(
            (movement) => movement.count === index && movement.item === line.item,
          );
          expect(adjust.reduce((total, movement) => total + movement.changeMilli, 0)).toBe(
            line.countedMilli - line.systemMilli,
          );
        }
      }
    },
  );

  it.each(CASES)('puts low and out-of-stock items on the low list ($today)', (options) => {
    const { stock } = planFor(options);
    const levels = stock.items.map((item) => ({
      quantity: item.quantityMilli,
      min: Math.round(DEMO_STOCK_ITEMS.find((entry) => entry.key === item.key)!.minQuantity * 1000),
    }));
    expect(levels.some((level) => level.quantity === 0)).toBe(true);
    expect(levels.some((level) => level.quantity > 0 && level.quantity <= level.min)).toBe(true);
  });
});

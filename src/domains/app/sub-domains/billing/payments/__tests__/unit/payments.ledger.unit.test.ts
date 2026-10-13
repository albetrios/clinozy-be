import { describe, expect, it } from 'vitest';
import {
  columnsToSplits,
  invoiceEffect,
  paymentActivityBody,
  pendingCreditEffect,
  purchaseEffect,
  scaleInvoiceMove,
  splitsToColumns,
} from '@/domains/app/sub-domains/billing/payments/payments.ledger.js';
import type { BaseRecordRow } from '@/domains/app/base-record.repository.js';

/** A stored payment row as the rules read it — only the fields the money rules look at. */
function payment(fields: Record<string, unknown>): BaseRecordRow {
  return { id: 1, public_id: 'pay_x', ...fields } as unknown as BaseRecordRow;
}

/**
 * The payments ledger's money arithmetic (B5, B18, B21, B24, S11): what a payment's splits store,
 * and what it does to its invoice, its purchase and its pending credit — a reversal undoing exactly
 * what it reverses.
 */
describe('splitsToColumns (B18)', () => {
  it('stores each mode in its column and the amount as their total', () => {
    expect(
      splitsToColumns([
        { mode: 'cash', amount: 300 },
        { mode: 'upi', amount: 150.5 },
      ]),
    ).toEqual({
      amount: 450.5,
      cash_amount: 300,
      upi_amount: 150.5,
      card_amount: 0,
      credit_amount: 0,
    });
  });

  it('adds in paise, so 0.1 + 0.2 is 0.3', () => {
    const columns = splitsToColumns([
      { mode: 'cash', amount: 0.1 },
      { mode: 'card', amount: 0.2 },
    ]);
    expect(columns.amount).toBe(0.3);
  });

  it('adds a mode named twice into one column', () => {
    expect(
      splitsToColumns([
        { mode: 'cash', amount: 100 },
        { mode: 'cash', amount: 50.25 },
      ]).cash_amount,
    ).toBe(150.25);
  });
});

describe('columnsToSplits (B18)', () => {
  it('reads the non-zero columns back in the modes’ order, from stored numerics', () => {
    expect(
      columnsToSplits({
        cash_amount: '0.00',
        upi_amount: '150.50',
        card_amount: null,
        credit_amount: '20.00',
      }),
    ).toEqual([
      { mode: 'upi', amount: 150.5 },
      { mode: 'credit', amount: 20 },
    ]);
  });

  it('round-trips what splitsToColumns stored', () => {
    const splits = [
      { mode: 'cash' as const, amount: 200 },
      { mode: 'card' as const, amount: 99.99 },
    ];
    expect(columnsToSplits({ ...splitsToColumns(splits) })).toEqual(splits);
  });
});

describe('invoiceEffect (8.10, B5, B16, B21)', () => {
  it('a receipt adds to what is paid; a refund moves its money from paid to refunded', () => {
    expect(invoiceEffect({ row: payment({ kind: 'receipt', amount: '500.00' }) })).toEqual({
      paid: 500,
      refunded: 0,
    });
    expect(invoiceEffect({ row: payment({ kind: 'refund', amount: '200.00' }) })).toEqual({
      paid: -200,
      refunded: 200,
    });
  });

  it('a reversal undoes exactly what it reverses', () => {
    const receipt = payment({ kind: 'receipt', amount: '500.00' });
    const refund = payment({ kind: 'refund', amount: '200.00' });
    expect(invoiceEffect({ row: payment({ kind: 'reversal' }), reversed: receipt })).toEqual({
      paid: -500,
      refunded: -0,
    });
    expect(invoiceEffect({ row: payment({ kind: 'reversal' }), reversed: refund })).toEqual({
      paid: 200,
      refunded: -200,
    });
  });

  it('nothing else touches the invoice', () => {
    for (const kind of ['expense', 'supplier_bill', 'money_back']) {
      expect(invoiceEffect({ row: payment({ kind, amount: '10.00' }) })).toEqual({
        paid: 0,
        refunded: 0,
      });
    }
    expect(invoiceEffect({ row: payment({ kind: 'reversal', amount: '10.00' }) })).toEqual({
      paid: 0,
      refunded: 0,
    });
  });
});

describe('scaleInvoiceMove', () => {
  it('scales a move, or takes one from another', () => {
    const refund = { paid: -200, refunded: 200 };
    expect(scaleInvoiceMove({ move: refund, factor: -1 })).toEqual({ paid: 200, refunded: -200 });
    expect(scaleInvoiceMove({ move: { paid: -250, refunded: 250 }, minus: refund })).toEqual({
      paid: -50,
      refunded: 50,
    });
  });
});

describe('purchaseEffect (S11, MD7)', () => {
  it('a supplier bill adds to the purchase it points at; its reversal takes it away', () => {
    const bill = payment({ kind: 'supplier_bill', amount: '1200.00', stock_purchase_id: 7 });
    expect(purchaseEffect({ row: bill, field: 'stock_purchase_id' })).toBe(1200);
    expect(
      purchaseEffect({
        row: payment({ kind: 'reversal', stock_purchase_id: 7 }),
        field: 'stock_purchase_id',
        reversed: bill,
      }),
    ).toBe(-1200);
  });

  it('a payment that points at no purchase, or another kind, moves nothing', () => {
    const bill = payment({ kind: 'supplier_bill', amount: '1200.00', stock_purchase_id: null });
    expect(purchaseEffect({ row: bill, field: 'stock_purchase_id' })).toBe(0);
    const receipt = payment({ kind: 'receipt', amount: '5.00', medical_purchase_order_id: 3 });
    expect(purchaseEffect({ row: receipt, field: 'medical_purchase_order_id' })).toBe(0);
  });
});

describe('pendingCreditEffect (B24)', () => {
  it('a settlement adds to the settled amount; its reversal takes it away', () => {
    expect(
      pendingCreditEffect(payment({ kind: 'receipt', amount: '80.00', pending_credit_id: 4 })),
    ).toBe(80);
    expect(
      pendingCreditEffect(payment({ kind: 'reversal', amount: '80.00', pending_credit_id: 4 })),
    ).toBe(-80);
  });

  it('a payment of no pending credit moves none', () => {
    expect(
      pendingCreditEffect(payment({ kind: 'receipt', amount: '80.00', pending_credit_id: null })),
    ).toBe(0);
  });
});

describe('paymentActivityBody (B7)', () => {
  it('names each money move a contact sees, in rupees', () => {
    expect(paymentActivityBody(payment({ kind: 'receipt', amount: '1500.00' }))).toBe(
      'Payment received: ₹1,500.00',
    );
    expect(paymentActivityBody(payment({ kind: 'refund', amount: '200.00' }))).toBe(
      'Refund given: ₹200.00',
    );
    expect(paymentActivityBody(payment({ kind: 'money_back', amount: '50.00' }))).toBe(
      'Money back: ₹50.00',
    );
    expect(paymentActivityBody(payment({ kind: 'reversal', amount: '1500.00' }))).toBe(
      'Payment reversed: ₹1,500.00',
    );
  });

  it('writes nothing for the clinic’s own money (an expense, a supplier bill)', () => {
    expect(paymentActivityBody(payment({ kind: 'expense', amount: '10.00' }))).toBeNull();
    expect(paymentActivityBody(payment({ kind: 'supplier_bill', amount: '10.00' }))).toBeNull();
  });
});

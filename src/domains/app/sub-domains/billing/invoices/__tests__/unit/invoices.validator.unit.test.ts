import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/shared/errors/index.js';
import {
  validateCreateInvoice,
  validatePreviewInvoiceChange,
  validateUpdateInvoice,
} from '@/domains/app/sub-domains/billing/invoices/invoices.validator.js';

const BRANCH = 'brn_k7x9m2pqr4w8n1v3a1b2c';
const OFFERING = 'off_k7x9m2pqr4w8n1v3a1b2c';
const LINE = 'invi_k7x9m2pqr4w8n1v3a1b2c';

/** A new bill of one line with the given extra line fields. */
const bill = (line: Record<string, unknown>) => ({
  branch_id: BRANCH,
  items: [{ offering_id: OFFERING, quantity: 1, ...line }],
});

/**
 * A bill line's description (feat-bill-line-description BD1, BD4): optional free text, trimmed,
 * 1–280; `null` clears it, omitted keeps a kept line's.
 */
describe("invoices.validator — a line's description", () => {
  it('takes it trimmed, up to 280', () => {
    const input = validateCreateInvoice(bill({ description: '  LHR Axilla 10 sessions =10*550 ' }));
    expect(input.items[0]?.description).toBe('LHR Axilla 10 sessions =10*550');
    expect(
      validateCreateInvoice(bill({ description: 'x'.repeat(280) })).items[0]?.description,
    ).toHaveLength(280);
  });

  it('leaves it out when not sent, and takes null', () => {
    expect(validateCreateInvoice(bill({})).items[0]?.description).toBeUndefined();
    const change = validateUpdateInvoice({ items: [{ id: LINE, quantity: 1, description: null }] });
    expect(change.items?.[0]?.description).toBeNull();
  });

  it('refuses more than 280 and empty text', () => {
    for (const description of ['x'.repeat(281), '   ']) {
      expect(() => validateCreateInvoice(bill({ description }))).toThrow(ValidationError);
      expect(() =>
        validatePreviewInvoiceChange({ items: [{ id: LINE, quantity: 1, description }] }),
      ).toThrow(ValidationError);
    }
  });
});

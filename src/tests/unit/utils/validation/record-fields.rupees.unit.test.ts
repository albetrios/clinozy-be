import { describe, expect, it } from 'vitest';
import { rupees } from '@/shared/utils/validation/record-fields.util.js';

/** `rupees` — money as an activity entry, an event or a message shows it. */
describe('rupees', () => {
  it('groups in the Indian way and always shows two decimals', () => {
    expect(rupees(0)).toBe('₹0.00');
    expect(rupees(500)).toBe('₹500.00');
    expect(rupees(1500.5)).toBe('₹1,500.50');
    expect(rupees(1_234_567.891)).toBe('₹12,34,567.89');
  });
});

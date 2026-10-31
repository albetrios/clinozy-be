import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/shared/errors/index.js';
import {
  readContactLinkedSearch,
  validateCreateContact,
  validateListContactsQuery,
  validateUpdateContact,
} from '@/domains/app/sub-domains/contacts/contacts.validator.js';

/**
 * How `GET /app/contacts` reads `q` (CT9, SHELL-M1 — launch ROUTE #155, D81): `C-n` is the contact
 * number, `#n` the number of the person's patient file or lead, `PT-n` the patient number; numbers
 * and text keep their rules. Pinned on the list input the repository receives.
 */
describe('contacts.validator — the contact search', () => {
  it('reads C-n as the contact number, in each way it is typed', () => {
    for (const q of ['C-12', 'c12', 'c 0012', 'C-0012']) {
      const input = validateListContactsQuery({ q });
      expect(input.equals?.contact_number, q).toBe(12);
      expect(input.q, q).toBeUndefined();
      expect(input.derived?.record_number, q).toBeUndefined();
      expect(input.derived?.patient_number, q).toBeUndefined();
    }
  });

  it('reads #n as a patient or lead number, never the contact number (SHELL-M1)', () => {
    for (const q of ['#3', '# 3', '#0003']) {
      const input = validateListContactsQuery({ q });
      expect(input.derived?.record_number, q).toBe(3);
      expect(input.derived?.patient_number, q).toBeUndefined();
      expect(input.equals?.contact_number, q).toBeUndefined();
      expect(input.q, q).toBeUndefined();
    }
  });

  it('reads PT-n as the patient number only', () => {
    for (const q of ['PT-412', 'pt412', 'Pt 0412']) {
      const input = validateListContactsQuery({ q });
      expect(input.derived?.patient_number, q).toBe(412);
      expect(input.derived?.record_number, q).toBeUndefined();
      expect(input.equals?.contact_number, q).toBeUndefined();
      expect(input.q, q).toBeUndefined();
    }
  });

  it('keeps the name sort (no best-match rank) for a number search', () => {
    expect(validateListContactsQuery({ q: '#3' }).sort).toBeUndefined();
    expect(validateListContactsQuery({ q: 'PT-3' }).sort).toBeUndefined();
    expect(validateListContactsQuery({ q: 'riya' }).sort).toBe('match');
  });

  it('keeps text and typed numbers as the search text', () => {
    expect(validateListContactsQuery({ q: 'riya' }).q).toBe('riya');
    expect(validateListContactsQuery({ q: '+91 98765 43210' }).q).toBe('9876543210');
    expect(validateListContactsQuery({ q: 'pta' }).q).toBe('pta');
  });

  it('reads a number inside a text as its digits, the words as typed (NS6)', () => {
    expect(validateListContactsQuery({ q: 'Meera +91 98250-11241' }).q).toBe('Meera 9825011241');
    expect(validateListContactsQuery({ q: '98250 11241 meera iyer' }).q).toBe(
      '9825011241 meera iyer',
    );
    expect(validateListContactsQuery({ q: 'Meera 98250' }).q).toBe('Meera 98250');
    expect(validateListContactsQuery({ q: 'iyer meera' }).q).toBe('iyer meera');
    expect(validateListContactsQuery({ q: 'meera 098250 11241' }).q).toBe('meera 9825011241');
    expect(validateListContactsQuery({ q: 'Meera iyer' }).sort).toBe('match');
  });

  it('refuses a search too short to read (400 q)', () => {
    for (const q of ['ri', '981', '#']) {
      expect(() => validateListContactsQuery({ q }), q).toThrow(ValidationError);
    }
  });

  it('leaves the search out without q', () => {
    const input = validateListContactsQuery({});
    expect(input.q).toBeUndefined();
    expect(input.derived?.record_number).toBeUndefined();
    expect(input.derived?.patient_number).toBeUndefined();
    expect(input.equals?.contact_number).toBeUndefined();
  });
});

describe('contacts.validator — a list about a contact (leads L7, patients P9)', () => {
  it('keeps #n as the record number and C-n as the contact number', () => {
    expect(readContactLinkedSearch({ q: '#2371' })).toEqual({ recordNumber: 2371 });
    expect(readContactLinkedSearch({ q: 'C-12' })).toEqual({ contactNumber: 12 });
  });

  it('reads the record prefix when the list has one', () => {
    expect(readContactLinkedSearch({ q: 'PT-0412', options: { recordPrefix: 'PT' } })).toEqual({
      recordNumber: 412,
    });
    expect(readContactLinkedSearch({ q: 'PT-0412' })).toEqual({ text: 'PT-0412' });
  });

  it('reads a number inside a text as its digits (NS6)', () => {
    expect(readContactLinkedSearch({ q: 'Meera +91 98250-11241' })).toEqual({
      text: 'Meera 9825011241',
    });
    expect(readContactLinkedSearch({ q: 'iyer meera' })).toEqual({ text: 'iyer meera' });
  });
});

/** A typed age instead of a birth date, and the age filters (feat-approximate-age AG1, AG4). */
describe('contacts.validator — age', () => {
  const body = { first_name: 'Asha', phones: [{ phone: '+919825000001', is_primary: true }] };

  it('takes an age of 0–120 whole years instead of a birth date', () => {
    expect(validateCreateContact({ ...body, age: 0 }).age).toBe(0);
    expect(validateCreateContact({ ...body, age: 120 }).age).toBe(120);
    for (const age of [-1, 121, 3.5, '34']) {
      expect(() => validateCreateContact({ ...body, age }), String(age)).toThrow(ValidationError);
    }
  });

  it('refuses an age and a birth date in one body', () => {
    expect(() => validateCreateContact({ ...body, age: 34, date_of_birth: '1992-01-01' })).toThrow(
      ValidationError,
    );
    expect(() => validateUpdateContact({ age: 34, date_of_birth: null })).toThrow(ValidationError);
    expect(validateUpdateContact({ age: 34 }).age).toBe(34);
  });

  it('reads age_from / age_to as the age filter, absent when neither is set', () => {
    expect(validateListContactsQuery({ age_from: '30', age_to: '40' }).derived?.age).toEqual({
      from: 30,
      to: 40,
    });
    expect(validateListContactsQuery({ age_to: '29' }).derived?.age).toEqual({
      from: undefined,
      to: 29,
    });
    expect(validateListContactsQuery({}).derived?.age).toBeUndefined();
    expect(() => validateListContactsQuery({ age_from: '121' })).toThrow(ValidationError);
  });
});

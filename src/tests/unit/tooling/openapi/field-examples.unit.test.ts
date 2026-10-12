import { describe, expect, it } from 'vitest';
import { generateFieldExample } from '@tooling/openapi/enrichers/field-examples.js';
import { COMMA_SEPARATED_ID_LIST_OPENAPI_EXTENSION } from '@/shared/utils/validation/record-fields.util.js';

describe('field-examples', () => {
  it('generateFieldExample returns email-shaped examples for email fields', () => {
    const example = generateFieldExample('email', { type: 'string', format: 'email' });
    expect(String(example)).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  });

  it('generateFieldExample prefers enum values', () => {
    expect(generateFieldExample('status', { type: 'string', enum: ['ACTIVE', 'SUSPENDED'] })).toBe(
      'ACTIVE',
    );
  });

  it("generateFieldExample takes the schema's own example before any guess", () => {
    expect(
      generateFieldExample('status', { type: 'string', example: 'new,contacted', enum: ['x'] }),
    ).toBe('new,contacted');
  });

  it('generateFieldExample maps organization_id to a public id shape', () => {
    const example = generateFieldExample('organization_id', { type: 'string' });
    expect(String(example)).toMatch(/^org_/);
  });

  it("generateFieldExample gives an entity's id field its prefixed public id", () => {
    expect(generateFieldExample('branch_id', { type: 'string' })).toBe('brn_a1b2c3d4e5f6g7h8i9j0k');
    expect(generateFieldExample('contact_id', { type: 'string' })).toMatch(/^con_[a-z0-9]{21}$/);
  });

  it('generateFieldExample gives a comma-separated id list two prefixed ids', () => {
    const list = { type: 'string', [COMMA_SEPARATED_ID_LIST_OPENAPI_EXTENSION]: true };
    expect(generateFieldExample('branch_ids', list)).toBe(
      'brn_a1b2c3d4e5f6g7h8i9j0k,brn_k0j9i8h7g6f5e4d3c2b1a',
    );
    expect(generateFieldExample('branch_id', list)).toBe(
      'brn_a1b2c3d4e5f6g7h8i9j0k,brn_k0j9i8h7g6f5e4d3c2b1a',
    );
  });

  it('generateFieldExample gives a calendar date a date', () => {
    expect(generateFieldExample('appointment_date_from', { type: 'string', format: 'date' })).toBe(
      '2026-02-14',
    );
  });

  it('generateFieldExample uses redacted placeholders for secret-bearing fields', () => {
    // The placeholders MUST NOT use real Stripe prefixes (`whsec_`, `sk_live_`)
    // — see the comment in `enrichers/field-examples.ts` for the GitHub Secret
    // Scanning rationale.
    expect(generateFieldExample('secret', { type: 'string' })).toBe(
      '<webhook-signing-key-shown-once>',
    );
    expect(generateFieldExample('raw_key', { type: 'string' })).toBe('<api-key-shown-once>');
  });
});

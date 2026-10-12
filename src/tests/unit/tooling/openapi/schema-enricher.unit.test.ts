import { describe, expect, it } from 'vitest';
import { enrichSchema } from '@tooling/openapi/enrichers/schema-enricher.js';

type EnrichedProperties = Record<string, Record<string, unknown>>;

describe('schema-enricher', () => {
  it('enrichSchema adds descriptions and examples to object properties', () => {
    const enriched = enrichSchema({
      type: 'object',
      required: ['email'],
      properties: {
        email: { type: 'string', format: 'email' },
      },
    });

    const emailProperty = (enriched.properties as EnrichedProperties).email;
    expect(emailProperty?.description).toContain('Required');
    expect(emailProperty?.example).toMatch(/@/);
    expect(enriched.example).toEqual({ email: emailProperty?.example });
  });

  it("keeps a field's own description and example ahead of the name-keyed dictionary (OFFERINGS-M1)", () => {
    const enriched = enrichSchema({
      type: 'object',
      properties: {
        code: { type: 'string', description: 'The offer code.', example: 'DIWALI25' },
      },
    });

    const codeProperty = (enriched.properties as EnrichedProperties).code;
    expect(codeProperty?.description).toBe('The offer code. *Optional.*');
    expect(codeProperty?.example).toBe('DIWALI25');
    expect(enriched.example).toEqual({ code: 'DIWALI25' });
  });

  it('falls back to the dictionary when a field carries no description of its own', () => {
    const enriched = enrichSchema({
      type: 'object',
      required: ['code'],
      properties: { code: { type: 'string', pattern: '^\\d+$' } },
    });

    const codeProperty = (enriched.properties as EnrichedProperties).code;
    expect(codeProperty?.description).toBe(
      'TOTP verification code (6 digits). **Required.** Digits only.',
    );
    expect(codeProperty?.example).toBe('123456');
  });
});

import { describe, expect, it } from 'vitest';
import {
  generateOperationId,
  getQueryParameters,
  getRequestBodySchema,
  inferTagFromPath,
} from '@tooling/openapi/emitters/operation-helpers.js';

type DocumentedField = { description?: string; example?: unknown };
type DocumentedParameter = DocumentedField & { name: string };

/** One request-body property as the document describes it. */
function bodyField(options: { method: string; path: string; field: string }): DocumentedField {
  const schema = getRequestBodySchema(options.method, options.path) as {
    properties: Record<string, DocumentedField>;
  };
  return schema.properties[options.field] ?? {};
}

/** One query parameter as the document describes it. */
function queryParameter(options: { path: string; name: string }): DocumentedParameter {
  const parameters = getQueryParameters('GET', options.path) as DocumentedParameter[];
  const parameter = parameters.find((candidate) => candidate.name === options.name);
  if (!parameter) throw new Error(`No query parameter ${options.name} on ${options.path}`);
  return parameter;
}

describe('operation-helpers', () => {
  it('generateOperationId builds camelCase operation ids', () => {
    expect(generateOperationId('GET', '/api/v1/auth/me')).toMatch(/^getAuth/i);
    expect(generateOperationId('POST', '/api/v1/tenancy/organization/invitations')).toMatch(
      /^postTenancy/i,
    );
  });

  it('inferTagFromPath title-cases the first API segment', () => {
    expect(inferTagFromPath('/api/v1/auth/login')).toBe('Auth');
    expect(inferTagFromPath('/readyz')).toBe('General');
  });

  it("describes an offer's code as the offer's, and the MFA code still as a TOTP code (OFFERINGS-M1)", () => {
    for (const [method, path] of [
      ['POST', '/api/v1/app/offers'],
      ['PATCH', '/api/v1/app/offers/{offer_id}'],
    ] as const) {
      const code = bodyField({ method, path, field: 'code' });
      expect(code.description).toMatch(/^The offer's code/);
      expect(code.description).not.toContain('TOTP');
      expect(code.example).toBe('DIWALI25');
    }
    const mfaCode = bodyField({
      method: 'POST',
      path: '/api/v1/auth/me/mfa/verify',
      field: 'code',
    });
    expect(mfaCode.description).toContain('TOTP verification code');
  });

  it('gives the comma-separated query lists their values and real examples', () => {
    const kind = queryParameter({ path: '/api/v1/app/tasks', name: 'kind' });
    expect(kind.example).toBe('rule,follow_up');
    expect(kind.description).toMatch(
      /^Several, comma-separated, each once: `rule`, `follow_up`, `manual`\./,
    );
    expect(queryParameter({ path: '/api/v1/app/invoices', name: 'payment_status' }).example).toBe(
      'paid,partial',
    );
    const branches = queryParameter({ path: '/api/v1/app/tasks', name: 'branch_id' });
    expect(branches.example).toBe('brn_a1b2c3d4e5f6g7h8i9j0k,brn_k0j9i8h7g6f5e4d3c2b1a');
    expect(branches.description).toMatch(/^Several: up to 20 public ids, comma-separated\./);
  });
});

import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/shared/errors/index.js';
import { validateListAuditLogsQuery } from '@/domains/audit/audit.validator.js';

describe('audit.validator', () => {
  it('validateListAuditLogsQuery applies pagination defaults', () => {
    expect(validateListAuditLogsQuery({})).toMatchObject({ limit: 25 });
  });

  it('validateListAuditLogsQuery accepts filter fields', () => {
    const result = validateListAuditLogsQuery({
      resource_type: 'user',
      action: 'created',
      from: '2026-01-01T00:00:00.000Z',
    });
    expect(result.resource_type).toBe('user');
    expect(result.action).toBe('created');
  });

  it('validateListAuditLogsQuery rejects invalid datetime', () => {
    expect(() => validateListAuditLogsQuery({ from: 'not-a-date' })).toThrow(ValidationError);
  });

  it('validateListAuditLogsQuery rejects invalid to datetime', () => {
    expect(() => validateListAuditLogsQuery({ to: '2026-13-40' })).toThrow(ValidationError);
  });

  it('validateListAuditLogsQuery rejects rejects a page query parameter (cursor-only, strict query)', () => {
    // `page` is not a parameter of any list query — the strict schema refuses it like any other
    // unknown key.
    expect(() => validateListAuditLogsQuery({ page: '1', limit: '20' })).toThrow(ValidationError);
  });
});

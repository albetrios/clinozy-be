import { describe, expect, it } from 'vitest';
import { parsePositiveIntegerEnv, resolveQueueNames } from '@/scripts/ops/settle-check.config.js';

describe('parsePositiveIntegerEnv', () => {
  it('returns the fallback when the value is absent', () => {
    expect(parsePositiveIntegerEnv({ fallback: 120_000, rawValue: undefined })).toBe(120_000);
  });

  it('parses a valid positive integer', () => {
    expect(parsePositiveIntegerEnv({ rawValue: '30000', fallback: 120_000 })).toBe(30_000);
  });

  it('falls back on a non-numeric value', () => {
    expect(parsePositiveIntegerEnv({ rawValue: 'soon', fallback: 2_000 })).toBe(2_000);
  });

  it('falls back on zero and negative values', () => {
    expect(parsePositiveIntegerEnv({ rawValue: '0', fallback: 2_000 })).toBe(2_000);
    expect(parsePositiveIntegerEnv({ rawValue: '-5', fallback: 2_000 })).toBe(2_000);
  });

  it('parses the leading integer of a mixed value', () => {
    expect(parsePositiveIntegerEnv({ rawValue: '15s', fallback: 2_000 })).toBe(15);
  });
});

describe('resolveQueueNames', () => {
  const defaults = ['mail', 'webhook-delivery', 'notification', 'stripe-webhook'] as const;

  it('returns a copy of the defaults when no override is set', () => {
    const resolved = resolveQueueNames({ defaults, override: undefined });
    expect(resolved).toEqual([...defaults]);
    expect(resolved).not.toBe(defaults);
  });

  it('falls back to defaults for a blank or whitespace override', () => {
    expect(resolveQueueNames({ override: '', defaults })).toEqual([...defaults]);
    expect(resolveQueueNames({ override: '   ', defaults })).toEqual([...defaults]);
  });

  it('parses a comma-separated override, trimming blanks', () => {
    expect(
      resolveQueueNames({ override: 'mail, notification ,, webhook-delivery', defaults }),
    ).toEqual(['mail', 'notification', 'webhook-delivery']);
  });

  it('falls back to defaults when every override entry is blank', () => {
    expect(resolveQueueNames({ override: ', ,', defaults })).toEqual([...defaults]);
  });
});

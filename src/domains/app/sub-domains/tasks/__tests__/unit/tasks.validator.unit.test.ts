import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/shared/errors/index.js';
import { validateListTasksQuery } from '@/domains/app/sub-domains/tasks/tasks.validator.js';

/** The Tasks type filter (D81 T6): `rule_key` and `kind`, each a comma list, are one filter. */
describe('validateListTasksQuery — the type filter (D81 T6)', () => {
  it('takes several kinds', () => {
    const input = validateListTasksQuery({ kind: 'follow_up,manual' });
    expect(input.derived?.type).toEqual({ ruleKeys: [], kinds: ['follow_up', 'manual'] });
  });

  it('puts the rules and the kinds named into one filter, not two equalities', () => {
    const input = validateListTasksQuery({ rule_key: 'confirm,reply', kind: 'manual' });
    expect(input.derived?.type).toEqual({ ruleKeys: ['confirm', 'reply'], kinds: ['manual'] });
    expect(input.equals).not.toHaveProperty('kind');
    expect(input.equals).not.toHaveProperty('rule_key');
  });

  it('takes the rules alone', () => {
    const input = validateListTasksQuery({ rule_key: 'medical_rep_visit' });
    expect(input.derived?.type).toEqual({ ruleKeys: ['medical_rep_visit'], kinds: [] });
  });

  it('filters nothing when neither is sent', () => {
    expect(validateListTasksQuery({}).derived?.type).toBeUndefined();
  });

  it.each(['later', 'manual,later', 'manual,manual', 'manual,'])('refuses kind=%s', (kind) => {
    expect(() => validateListTasksQuery({ kind })).toThrow(ValidationError);
  });
});

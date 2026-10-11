import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ eval: vi.fn(), warn: vi.fn() }));

vi.mock('@/infrastructure/cache/redis.client.js', () => ({
  redisConnection: { eval: mocks.eval },
}));
vi.mock('@/shared/config/env.config.js', () => ({
  env: { PATIENT_IDEAS_DAILY_CALL_LIMIT: 3 },
}));
vi.mock('@/shared/utils/infrastructure/logger.util.js', () => ({
  logger: { info: vi.fn(), warn: mocks.warn, error: vi.fn(), debug: vi.fn() },
}));

import {
  ideasCallBudgetKey,
  reserveIdeasCall,
} from '@/domains/app/sub-domains/patients/patient-ideas/patient-ideas.call-budget.js';

/** I4: the ideas worker's daily Claude call budget per organization (launch D80). */
describe('reserveIdeasCall', () => {
  beforeEach(() => {
    mocks.eval.mockReset();
    mocks.warn.mockReset();
  });

  it('keys the budget by organization and UTC day', () => {
    expect(
      ideasCallBudgetKey({ organizationPublicId: 'org_x', now: new Date('2026-10-09T23:59:59Z') }),
    ).toBe('patient-ideas:calls:org_x:2026-10-09');
    expect(
      ideasCallBudgetKey({ organizationPublicId: 'org_x', now: new Date('2026-10-10T00:00:00Z') }),
    ).toBe('patient-ideas:calls:org_x:2026-10-10');
  });

  it('takes a call while the day has budget, with the limit and a two-day expiry', async () => {
    mocks.eval.mockResolvedValue(2);

    expect(await reserveIdeasCall('org_x')).toBe(true);
    expect(mocks.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('INCR'"),
      1,
      expect.stringMatching(/^patient-ideas:calls:org_x:\d{4}-\d{2}-\d{2}$/),
      '3',
      String(2 * 24 * 60 * 60),
    );
  });

  it('refuses once the day is spent', async () => {
    mocks.eval.mockResolvedValue(-1);

    expect(await reserveIdeasCall('org_x')).toBe(false);
  });

  it('fails closed when Redis cannot count — no call without a counted budget', async () => {
    mocks.eval.mockRejectedValue(new Error('redis down'));

    expect(await reserveIdeasCall('org_x')).toBe(false);
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ organizationPublicId: 'org_x' }),
      'patient-ideas.call_budget_unavailable',
    );
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  memoizePlanCatalog,
  resetPlanCatalogMemoForTests,
} from '@/domains/billing/sub-domains/plan/plan-catalog-memo.js';
import type { PlanOutput } from '@/domains/billing/sub-domains/plan/plan.types.js';

const FRESH_PLANS = [{ public_id: 'plan_fresh' }] as unknown as PlanOutput[];
const STALE_PLANS = [{ public_id: 'plan_stale' }] as unknown as PlanOutput[];

describe('memoizePlanCatalog', () => {
  afterEach(() => {
    resetPlanCatalogMemoForTests();
  });

  it('runs one load for concurrent callers and memoizes the success', async () => {
    let release: (value: PlanOutput[]) => void = () => undefined;
    const gate = new Promise<PlanOutput[]>((resolve) => {
      release = resolve;
    });
    const load = vi.fn(() => gate);
    const first = memoizePlanCatalog(load);
    const second = memoizePlanCatalog(load);
    release(FRESH_PLANS);

    await expect(Promise.all([first, second])).resolves.toEqual([FRESH_PLANS, FRESH_PLANS]);
    expect(load).toHaveBeenCalledTimes(1);

    const laterLoad = vi.fn(async () => STALE_PLANS);
    await expect(memoizePlanCatalog(laterLoad)).resolves.toEqual(FRESH_PLANS);
    expect(laterLoad).not.toHaveBeenCalled();
  });

  it('does not memoize a rejected load', async () => {
    const load = vi
      .fn<() => Promise<PlanOutput[]>>()
      .mockRejectedValueOnce(new Error('database down'))
      .mockResolvedValueOnce(FRESH_PLANS);

    await expect(memoizePlanCatalog(load)).rejects.toThrow('database down');
    await expect(memoizePlanCatalog(load)).resolves.toEqual(FRESH_PLANS);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('reset drops the memo so the next read loads again, and a late flight does not restore it', async () => {
    let release: (value: PlanOutput[]) => void = () => undefined;
    const gate = new Promise<PlanOutput[]>((resolve) => {
      release = resolve;
    });
    const firstLoad = vi.fn(() => gate);
    const inFlight = memoizePlanCatalog(firstLoad);
    resetPlanCatalogMemoForTests();

    const secondLoad = vi.fn(async () => FRESH_PLANS);
    await expect(memoizePlanCatalog(secondLoad)).resolves.toEqual(FRESH_PLANS);
    expect(secondLoad).toHaveBeenCalledTimes(1);

    release(STALE_PLANS);
    await expect(inFlight).resolves.toEqual(STALE_PLANS);

    const laterLoad = vi.fn(async () => STALE_PLANS);
    await expect(memoizePlanCatalog(laterLoad)).resolves.toEqual(FRESH_PLANS);
    expect(laterLoad).not.toHaveBeenCalled();
  });
});

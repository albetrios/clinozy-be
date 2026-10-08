import { describe, expect, it, vi } from 'vitest';
import { createSingleflight } from '@/shared/utils/infrastructure/singleflight.util.js';

describe('createSingleflight', () => {
  it('runs one load for concurrent callers of the same key and both receive it', async () => {
    const singleflight = createSingleflight<string>();
    let release: (value: string) => void = () => undefined;
    const gate = new Promise<string>((resolve) => {
      release = resolve;
    });
    const load = vi.fn(() => gate);

    const first = singleflight.run({ key: 'session-hash', load });
    const second = singleflight.run({ key: 'session-hash', load });
    release('loaded');

    await expect(Promise.all([first, second])).resolves.toEqual(['loaded', 'loaded']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not coalesce different keys', async () => {
    const singleflight = createSingleflight<string>();
    const load = vi.fn(async () => 'value');

    await singleflight.run({ key: 'one', load });
    await singleflight.run({ key: 'two', load });

    expect(load).toHaveBeenCalledTimes(2);
  });

  it('loads again after the in-flight promise settles', async () => {
    const singleflight = createSingleflight<number>();
    const load = vi.fn(async () => 1);

    await singleflight.run({ key: 'again', load });
    await singleflight.run({ key: 'again', load });

    expect(load).toHaveBeenCalledTimes(2);
  });

  it('shares a rejection and then allows a later load', async () => {
    const singleflight = createSingleflight<string>();
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('database down'))
      .mockResolvedValueOnce('recovered');

    const first = singleflight.run({ key: 'fail', load });
    const second = singleflight.run({ key: 'fail', load });

    await expect(first).rejects.toThrow('database down');
    await expect(second).rejects.toThrow('database down');
    await expect(singleflight.run({ key: 'fail', load })).resolves.toBe('recovered');
    expect(load).toHaveBeenCalledTimes(2);
  });
});

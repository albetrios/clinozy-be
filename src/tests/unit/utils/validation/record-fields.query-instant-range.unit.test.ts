import { describe, expect, it } from 'vitest';
import { queryInstantRange } from '@/shared/utils/validation/record-fields.util.js';

describe('queryInstantRange', () => {
  it('reads both bounds of a list query as Dates', () => {
    expect(
      queryInstantRange({ from: '2026-10-01T00:00:00.000Z', to: '2026-10-10T18:30:00.000Z' }),
    ).toEqual({
      from: new Date('2026-10-01T00:00:00.000Z'),
      to: new Date('2026-10-10T18:30:00.000Z'),
    });
  });

  it('leaves out a bound the query leaves out, so the repository skips it', () => {
    expect(queryInstantRange({ from: '2026-10-01T00:00:00.000Z', to: undefined })).toEqual({
      from: new Date('2026-10-01T00:00:00.000Z'),
      to: undefined,
    });
    expect(queryInstantRange({ from: undefined, to: undefined })).toEqual({
      from: undefined,
      to: undefined,
    });
  });
});

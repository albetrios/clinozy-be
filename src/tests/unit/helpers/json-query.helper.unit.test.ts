import { describe, expect, it } from 'vitest';
import { type JsonValue, jsonQuery, jsonQueryAll } from '@/tests/helpers/json-query.helper.js';

const body: JsonValue = {
  data: [
    { id: 'a', name: 'Laser 17', status: 'live', min_price: null, tags: ['x', 'y'] },
    { id: 'b', name: 'Peel 17', status: 'ended', min_price: 200, tags: [] },
  ],
  meta: { pagination: { next: null, estimated_total: 2, has_more: false } },
  error: { reason: 'record_changed', errors: [{ field: 'name' }, { field: 'price' }] },
};

describe('jsonQuery — the jq subset the app flows use', () => {
  it.each([
    ['.meta.pagination.estimated_total', '2'],
    ['.data[0].id', 'a'],
    ['.data[-1].id', 'b'],
    ['.data[1].min_price', '200'],
    ['.data[0].min_price', 'null'],
    ['.meta.pagination.has_more', 'false'],
    ['.missing.deep', 'null'],
    ['.data | length', '2'],
    ['[.data[].id] | join(",")', 'a,b'],
    ['[.error.errors[].field] | join(",")', 'name,price'],
    ['[.data[].name | rtrimstr(" 17")] | join(",")', 'Laser,Peel'],
    ['[.data[].min_price] | map(tostring) | join(",")', 'null,200'],
    ['[.data[].min_price] | unique | map(tostring) | join(",")', 'null,200'],
    ['[.data[] | select(.status == "live")] | length', '1'],
    ['[.data[].id | select(. == "b")] | length', '1'],
    ['[.data[].id] | index("b") != null', 'true'],
    ['[.data[].id] | index("z") == null', 'true'],
    ['.meta.pagination.next // empty', ''],
    ['.data[0].missing // "none"', 'none'],
    ['[.data[] | select(.id == "b") | .min_price] | first // 0', '200'],
    ['[.data[] | select(.id == "z") | .min_price] | first // 0', '0'],
    ['(.data[0].name | startswith("Laser")) and (.data[1].name | endswith("17"))', 'true'],
    ['.data[0].name | contains("ser")', 'true'],
    ['.data[0].name | test("^L[a-z]+")', 'true'],
    ['[.data[0].status, .data[1].status] | join("|")', 'live|ended'],
    ['[.data[] | "\\(.id):\\(.status)"] | join("+")', 'a:live+b:ended'],
    ['.data | map(.id) | sort | join(",")', 'a,b'],
    ['[.data[] | has("tags")] | all', 'true'],
    ['[.data[].tags | length] | map(. > 0) | any', 'true'],
    ['.data[0] | keys | length', '5'],
    ['.data[0].tags | type', 'array'],
    ['.data[1:] | length', '1'],
    ['"a,b,c" | split(",")[1]', 'b'],
    ['.meta.pagination.estimated_total >= 2', 'true'],
    ['.data[0].name > "A"', 'true'],
  ])('%s → %s', (expression, expected) => {
    expect(jsonQuery(body, expression)).toBe(expected);
  });

  it('prints objects and arrays as compact JSON and several outputs one per line', () => {
    expect(jsonQuery(body, '.data[0].tags')).toBe('["x","y"]');
    expect(jsonQuery(body, '.data[].id')).toBe('a\nb');
    expect(jsonQueryAll(body, '.data[].id')).toEqual(['a', 'b']);
  });

  it('refuses what it does not know instead of guessing', () => {
    expect(() => jsonQuery(body, '.data | frobnicate')).toThrow(/unknown function/);
    expect(() => jsonQuery(body, '.data[')).toThrow();
  });
});

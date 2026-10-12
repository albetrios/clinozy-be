import { describe, expect, it } from 'vitest';
import { exampleBodyOf } from '@/tests/helpers/route-status-observer.js';

/** A JSON value nested `depth` objects deep — a resource-exhaustion test's request body. */
function nestedBody(depth: number): unknown {
  let body: Record<string, unknown> = {};
  for (let level = 0; level < depth; level += 1) body = { a: body };
  return body;
}

describe('route-status observer — example bodies', () => {
  it('keeps a body that writes as JSON', () => {
    const body = { name: 'Riya', items: [{ quantity: 1 }] };
    expect(exampleBodyOf(body)).toBe(body);
  });

  it('drops a body nested deeper than JSON.stringify can recurse, instead of failing the flush', () => {
    expect(exampleBodyOf(nestedBody(200_000))).toBeUndefined();
  });
});

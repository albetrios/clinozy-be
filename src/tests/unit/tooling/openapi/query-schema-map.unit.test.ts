import { describe, expect, it } from 'vitest';
import { collectAllRouteSchemaEntries } from '@tooling/openapi/extractors/route-schema-metadata.js';
import { routeQuerySchemaMap } from '@tooling/openapi/query-schema-map.js';

/**
 * Routes whose `schema.querystring` is not a named DTO the map can import — each with why it is not
 * in `routeQuerySchemaMap` (documented in its route description instead).
 */
const QUERY_MAP_EXEMPT: Readonly<Record<string, string>> = {};

/**
 * The OpenAPI document takes a route's query parameters from `routeQuerySchemaMap`, not from the
 * route's own `schema.querystring` — so a route that validates a query the map lacks is published
 * without it: every record delete's required `reason` (and `note`) was (launch D83 (6), QA B2).
 * Every declared query has its entry.
 */
describe('OpenAPI query parameters — every declared querystring is in routeQuerySchemaMap', () => {
  it('maps each route that declares schema.querystring', () => {
    const missing = collectAllRouteSchemaEntries()
      .filter((entry) => entry.hasQuerySchema === true)
      .map((entry) => entry.lookupKey)
      .filter((key) => !(key in routeQuerySchemaMap || key in QUERY_MAP_EXEMPT));
    expect(missing).toEqual([]);
  });

  it("documents a record delete's reason — every DELETE that takes a query", () => {
    const deletes = collectAllRouteSchemaEntries().filter(
      (entry) => entry.method === 'DELETE' && entry.hasQuerySchema === true,
    );
    expect(deletes.length).toBeGreaterThan(30);
    for (const entry of deletes) {
      const schema = routeQuerySchemaMap[entry.lookupKey] as
        | { shape?: Record<string, unknown> }
        | undefined;
      expect(Object.keys(schema?.shape ?? {}), entry.lookupKey).toContain('reason');
    }
  });

  it('keeps the exemptions honest — each still declares a query and has no map entry', () => {
    const declared = new Set(
      collectAllRouteSchemaEntries()
        .filter((entry) => entry.hasQuerySchema === true)
        .map((entry) => entry.lookupKey),
    );
    for (const key of Object.keys(QUERY_MAP_EXEMPT)) {
      expect(declared.has(key), key).toBe(true);
      expect(key in routeQuerySchemaMap, key).toBe(false);
    }
  });
});

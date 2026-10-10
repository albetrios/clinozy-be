import { describe, expect, it } from 'vitest';
import { collectAllRouteSchemaEntries } from '@tooling/openapi/extractors/route-schema-metadata.js';
import { routeSchemaMap } from '@tooling/openapi/schema-map.js';

/**
 * Routes whose `schema.body` is not a named DTO the map can import — each with why it is not in
 * `routeSchemaMap` (documented in its route description instead).
 */
const BODY_MAP_EXEMPT: Readonly<Record<string, string>> = {
  'POST /api/v1/auth/switch-to-organization': 'an inline z.object in auth.routes.ts',
  'POST /api/v1/auth/me/webauthn/register/options': 'an empty strict object — no fields',
  'POST /api/v1/app/messaging-webhook': "Meta's own payload, verified by X-Hub-Signature-256 (D77)",
};

/**
 * The OpenAPI document takes a route's request body from `routeSchemaMap`, not from the route's
 * own `schema.body` — so a new write route that declares a body but has no map entry is published
 * with no request body at all (the invoice previews were, D81). Every declared body has its entry.
 */
describe('OpenAPI request bodies — every declared body is in routeSchemaMap', () => {
  it('maps each POST / PATCH / PUT route that declares schema.body', () => {
    const missing = collectAllRouteSchemaEntries()
      .filter((entry) => ['POST', 'PATCH', 'PUT'].includes(entry.method))
      .filter((entry) => entry.hasBodySchema === true)
      .map((entry) => entry.lookupKey)
      .filter((key) => !(key in routeSchemaMap || key in BODY_MAP_EXEMPT));
    expect(missing).toEqual([]);
  });

  it('keeps the exemptions honest — each still declares a body and has no map entry', () => {
    const declared = new Set(
      collectAllRouteSchemaEntries()
        .filter((entry) => entry.hasBodySchema === true)
        .map((entry) => entry.lookupKey),
    );
    for (const key of Object.keys(BODY_MAP_EXEMPT)) {
      expect(declared.has(key), key).toBe(true);
      expect(key in routeSchemaMap, key).toBe(false);
    }
  });
});

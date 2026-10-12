import { describe, expect, it } from 'vitest';
import { collectRouteSchemaMetadata } from '@tooling/openapi/extractors/route-schema-metadata.js';
import { MCP_OPENAPI_RESOURCE_URI } from '@/shared/constants/project-identity.constants.js';

describe('route-schema-metadata', () => {
  const metadata = collectRouteSchemaMetadata();

  it('reads a description past its escaped quotes — none is cut short', () => {
    for (const [routeKey, entry] of metadata) {
      expect(entry.description ?? '', routeKey).not.toMatch(/\\$/);
      expect(entry.description ?? '', routeKey).not.toMatch(/\\['"`]/);
    }
    // Holds `the drawer's "Paid"` before its last words
    expect(metadata.get('POST /api/v1/app/stock-purchases')?.description).toMatch(
      /Requires stock_item:create\.$/,
    );
  });

  it('fills a template description from the string constants it names', () => {
    for (const [routeKey, entry] of metadata) {
      expect(entry.description ?? '', routeKey).not.toContain('${');
    }
    // A same-file phrase (`${DAY_CLOSE_FIGURES}`) and an imported, re-exported constant
    expect(metadata.get('GET /api/v1/app/day-closes')?.description).toContain(
      'each with the opening cash and who accepted it',
    );
    expect(metadata.get('GET /api/v1/mcp')?.description).toContain(MCP_OPENAPI_RESOURCE_URI);
  });
});

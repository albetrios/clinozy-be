import { renamePreviousServerKeys } from '@tooling/dev/mcp-config.js';
import { describe, expect, it } from 'vitest';

/**
 * Pins the rename `pnpm mcp:setup` applies to a `.mcp.json` scaffolded before the `be-` prefix:
 * each old key becomes its prefixed one with its definition kept, and never twice.
 */
describe('MCP server keys used before the be- prefix', () => {
  it('renames a previous key in place, keeping its definition', () => {
    const { servers, renamed } = renamePreviousServerKeys({
      codegraph: { command: 'previous' },
      stripe: { command: 'npx' },
    });
    expect(servers).toEqual({
      'be-codegraph': { command: 'previous' },
      stripe: { command: 'npx' },
    });
    expect(renamed).toEqual(['codegraph → be-codegraph']);
  });

  it('drops the previous key when the current one is already declared', () => {
    const { servers, renamed } = renamePreviousServerKeys({
      headroom: { command: 'previous' },
      'be-headroom': { command: 'current' },
    });
    expect(servers).toEqual({ 'be-headroom': { command: 'current' } });
    expect(renamed).toEqual(['headroom → be-headroom']);
  });

  it('leaves a config without previous keys as it is', () => {
    const { servers, renamed } = renamePreviousServerKeys({ 'be-semgrep': { command: 'uvx' } });
    expect(servers).toEqual({ 'be-semgrep': { command: 'uvx' } });
    expect(renamed).toEqual([]);
  });
});

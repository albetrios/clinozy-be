import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stepsFor } from '@tooling/validate/gates.js';

const ROOT = process.cwd();

function readWorkflow(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

function resolveDocsCheckScript(command: string): string {
  const match = command.match(/tsx\s+(\S+)/);
  if (!match) {
    throw new Error(`docs:check script does not invoke tsx with a path: ${command}`);
  }
  return join(ROOT, match[1] ?? '');
}

describe('OpenAPI drift check policy', () => {
  it('runs docs:check in ci:quality and post-merge API docs workflow', () => {
    const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    const docsCheckCommand = packageJson.scripts['docs:check'];
    expect(docsCheckCommand).toBeDefined();

    const scriptPath = resolveDocsCheckScript(docsCheckCommand ?? '');
    expect(existsSync(scriptPath)).toBe(true);
    expect(scriptPath).toContain('src/scripts/codegen/check-api-docs-sync.ts');

    expect(stepsFor('quality').map((step) => step.command.join(' '))).toContain('pnpm docs:check');

    // Every docs job (development docs, the production release) generates through one action.
    const docsGenerate = readWorkflow('.github/actions/generate-api-docs/action.yml');
    expect(docsGenerate).toContain('pnpm docs:check');
    expect(readWorkflow('.github/workflows/reusable-openapi-postman-publish.yml')).toContain(
      'uses: ./.github/actions/generate-api-docs',
    );
  });
});

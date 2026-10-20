import { spawnSync } from 'node:child_process';
import { cpSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createScratchFolder,
  removeScratchFolders,
} from '@/tests/helpers/git-repository.helper.js';
import { afterEach, describe, expect, it } from 'vitest';

const VALIDATOR = join(
  process.cwd(),
  'src',
  'scripts',
  'validators',
  'domain',
  'validate-domain.ts',
);
const TSX = join(process.cwd(), 'node_modules', '.bin', 'tsx');
afterEach(removeScratchFolders);

/** The domain gate's exit code and output, run from `cwd` (its `src/domains/` is what it checks). */
function validate(options: { cwd: string; args: string[] }) {
  const result = spawnSync(
    TSX,
    ['--tsconfig', join(process.cwd(), 'tsconfig.json'), VALIDATOR, ...options.args],
    { cwd: options.cwd, encoding: 'utf8' },
  );
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

/**
 * Locks in a domain gate that checks domains. It listed them with `require('node:fs')` in an ES
 * module, so every domain was filtered out and `pnpm validate:domain` passed silently from 2 Oct to
 * 20 Oct 2026; its rules then drifted from the documented layout (CLAUDE.md → Testing).
 */
describe('validate-domain.ts (pnpm validate:domain)', () => {
  it('checks every domain under src/domains/ and passes strict mode on this tree', () => {
    const domains = readdirSync(join(process.cwd(), 'src', 'domains'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    expect(domains.length).toBeGreaterThan(0);
    const { status, output } = validate({ cwd: process.cwd(), args: ['--strict'] });
    expect(status, output).toBe(0);
    for (const domain of domains) expect(output).toContain(`✅ ${domain}`);
  });

  it('fails a spec placed outside unit/, integration/ and e2e/', () => {
    const root = createScratchFolder('validate-domain-');
    cpSync(join(process.cwd(), 'src', 'domains', 'audit'), join(root, 'src', 'domains', 'audit'), {
      recursive: true,
    });
    writeFileSync(join(root, 'src', 'domains', 'audit', '__tests__', 'stray.test.ts'), '');
    const { status, output } = validate({ cwd: root, args: ['audit'] });
    expect(status).toBe(1);
    expect(output).toContain('audit/__tests__/stray.test.ts');
  });
});

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyDotenvFile } from '@/shared/config/load-env-files.js';

const PREFIX = 'ENV_LOADER_PROBE_';

/**
 * A blank `KEY=` line in an env file unsets that key — but only when the value in effect is
 * blank. A cloud session supplies its development values as environment Variables, and
 * `.env.local` (scaffolded from `.env.example`) is full of blank placeholders: those must not
 * delete what the shell set.
 */
describe('applyDotenvFile', () => {
  let directory = '';
  let file = '';

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'load-env-files-'));
    file = join(directory, '.env.local');
    writeFileSync(
      file,
      [`${PREFIX}BLANK=`, `${PREFIX}FROM_FILE=file`, `${PREFIX}SHELL_AND_FILE=file`, ''].join('\n'),
    );
  });

  afterEach(() => {
    for (const key of Object.keys(process.env).filter((name) => name.startsWith(PREFIX))) {
      delete process.env[key];
    }
    rmSync(directory, { recursive: true, force: true });
  });

  it('keeps a value the shell set over a blank placeholder (no override)', () => {
    process.env[`${PREFIX}BLANK`] = 'from-the-cloud-environment';
    applyDotenvFile({ envFilePath: file });
    expect(process.env[`${PREFIX}BLANK`]).toBe('from-the-cloud-environment');
  });

  it('unsets a key the file leaves blank when nothing else set it', () => {
    applyDotenvFile({ envFilePath: file });
    expect(`${PREFIX}BLANK` in process.env).toBe(false);
    expect(process.env[`${PREFIX}FROM_FILE`]).toBe('file');
  });

  it('lets the shell win without override, and the file win with it', () => {
    process.env[`${PREFIX}SHELL_AND_FILE`] = 'shell';
    applyDotenvFile({ envFilePath: file });
    expect(process.env[`${PREFIX}SHELL_AND_FILE`]).toBe('shell');
    applyDotenvFile({ envFilePath: file, override: true });
    expect(process.env[`${PREFIX}SHELL_AND_FILE`]).toBe('file');
  });

  it('with override, a blank file line still unsets the key', () => {
    process.env[`${PREFIX}BLANK`] = 'shell';
    applyDotenvFile({ envFilePath: file, override: true });
    expect(`${PREFIX}BLANK` in process.env).toBe(false);
  });
});

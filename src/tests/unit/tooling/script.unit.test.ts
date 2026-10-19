/**
 * `tooling/setup/common/script.ts` — the one command-line parser and the one entry check every
 * tooling script uses (policy: src/tests/unit/ci/tooling-command-line.policy.unit.test.ts).
 */
import { relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { isMain, parseCommandLine } from '@tooling/setup/common/script.js';

const OPTIONS = {
  base: { type: 'string' },
  check: { type: 'boolean', short: 'c' },
  file: { type: 'string', multiple: true },
} as const;

describe('parseCommandLine', () => {
  it('reads --name value, --name=value, short flags and repeated values', () => {
    const { values, positionals } = parseCommandLine({
      args: ['--base', 'main', '-c', '--file=a.ts', '--file', 'b.ts', 'first'],
      options: OPTIONS,
      maxPositionals: 1,
    });
    expect(values).toEqual({ base: 'main', check: true, file: ['a.ts', 'b.ts'] });
    expect(positionals).toEqual(['first']);
  });

  it('leaves an option that was not given absent', () => {
    expect(parseCommandLine({ args: [], options: OPTIONS }).values).toEqual({});
  });

  it('takes everything after a later -- as positionals', () => {
    const { values, positionals } = parseCommandLine({
      args: ['-c', '--', '--base', '-x'],
      options: OPTIONS,
      maxPositionals: Number.POSITIVE_INFINITY,
    });
    expect(values).toEqual({ check: true });
    expect(positionals).toEqual(['--base', '-x']);
  });

  it('drops a leading -- (the separator `pnpm <script> -- --flag` forwards)', () => {
    expect(parseCommandLine({ args: ['--', '--check'], options: OPTIONS }).values).toEqual({
      check: true,
    });
  });

  it('stops on an unknown option, long or short, and names it', () => {
    expect(() => parseCommandLine({ args: ['--not-an-option'], options: OPTIONS })).toThrow(
      'Unknown option "--not-an-option".',
    );
    expect(() => parseCommandLine({ args: ['-x'], options: OPTIONS })).toThrow(
      'Unknown option "-x".',
    );
    expect(() => parseCommandLine({ args: ['--check'] })).toThrow('Unknown option "--check".');
  });

  it('treats a flag given a value as unknown rather than ignoring the value', () => {
    expect(() => parseCommandLine({ args: ['--check=yes'], options: OPTIONS })).toThrow(
      'Unknown option "--check=yes".',
    );
  });

  it('never resolves an option name to an inherited Object member', () => {
    expect(() => parseCommandLine({ args: ['--constructor'], options: OPTIONS })).toThrow(
      'Unknown option "--constructor".',
    );
  });

  it('stops on a value option without its value: at the end, empty, or followed by an option', () => {
    const usage = 'usage: probe [--base <ref>]';
    for (const args of [['--base'], ['--base='], ['--base', '--check']]) {
      expect(() => parseCommandLine({ args, options: OPTIONS, usage })).toThrow(
        `--base needs a value — ${usage}`,
      );
    }
    expect(() => parseCommandLine({ args: ['--base'], options: OPTIONS })).toThrow(
      '--base needs a value.',
    );
  });

  it('accepts a value that starts with a single dash', () => {
    expect(parseCommandLine({ args: ['--base', '-5'], options: OPTIONS }).values.base).toBe('-5');
  });

  it('takes no positionals by default and names the extra ones', () => {
    expect(() => parseCommandLine({ args: ['stray'] })).toThrow('Too many arguments: stray.');
    expect(() =>
      parseCommandLine({ args: ['a', 'b', 'c'], maxPositionals: 2, usage: 'expected <a> <b>.' }),
    ).toThrow('Too many arguments: a b c — expected <a> <b>.');
  });

  it("words the errors the script's own way when it asks to, and falls back otherwise", () => {
    const messages = {
      unknownOption: (option: string) => `Unknown flag: ${option}`,
      needsValue: (option: string) => (option === '--base' ? 'Missing --base <ref>' : undefined),
    };
    expect(() => parseCommandLine({ args: ['--nope'], options: OPTIONS, messages })).toThrow(
      'Unknown flag: --nope',
    );
    expect(() => parseCommandLine({ args: ['--base'], options: OPTIONS, messages })).toThrow(
      'Missing --base <ref>',
    );
    expect(() =>
      parseCommandLine({
        args: ['--file'],
        options: OPTIONS,
        messages: { needsValue: () => undefined },
      }),
    ).toThrow('--file needs a value.');
  });
});

describe('isMain', () => {
  const originalEntry = process.argv[1];
  const thisFile = new URL(import.meta.url);

  afterEach(() => {
    if (originalEntry === undefined) process.argv.splice(1);
    else process.argv[1] = originalEntry;
  });

  it('is true for the module node was started with, given absolute or relative', () => {
    process.argv[1] = thisFile.pathname;
    expect(isMain(import.meta.url)).toBe(true);
    process.argv[1] = relative(process.cwd(), thisFile.pathname);
    expect(isMain(import.meta.url)).toBe(true);
  });

  it('is false for a module another script imported', () => {
    process.argv[1] = thisFile.pathname;
    expect(isMain(pathToFileURL('/elsewhere/script.ts').href)).toBe(false);
  });

  it('is false when there is no entry path (a REPL or node -e)', () => {
    process.argv.splice(1);
    expect(isMain(import.meta.url)).toBe(false);
  });
});

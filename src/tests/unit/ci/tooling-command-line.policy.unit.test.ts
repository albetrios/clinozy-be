/**
 * Policy: one command-line parser and one entry check for every script under `tooling/`,
 * `src/scripts/` and `agent-os/evals/` — `parseCommandLine` and `isMain` from
 * `tooling/setup/common/script.ts` (node:util `parseArgs` underneath, strict).
 *
 * Before, each script read `process.argv` its own way — node:util `parseArgs` in a few, hand
 * loops, `argv.indexOf('--x') + 1`, `includes('--x')`, a local `option()` helper — and decided
 * "am I the entry module" about ten different ways (`import.meta.url === \`file://${argv[1]}\``,
 * `fileURLToPath(import.meta.url) === argv[1]`, `resolve(...)` variants, a file-name match).
 * A script silently ignored a flag it did not know; now every one stops on it.
 *
 * (a) `process.argv` is read only whole, as `process.argv.slice(2)` handed to `parseCommandLine`
 *     — directly (`parseCommandLine({ args: process.argv.slice(2), … })`) or through the script's
 *     own tested parser (`parseOptions(process.argv.slice(2))`), whose module calls
 *     `parseCommandLine` itself. node:util `parseArgs` is imported by script.ts alone.
 * (b) No entry check but `isMain(import.meta.url)`.
 * (c) Every script a package.json script runs stops on `--not-an-option`, exits non-zero and names
 *     the option.
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const SCANNED_DIRECTORIES = ['tooling', 'src/scripts', 'agent-os/evals'] as const;
const HELPER_FILE = 'tooling/setup/common/script.ts';
const UNKNOWN_OPTION = '--not-an-option';

/** Files this policy does not hold yet, each with the reason. */
const EXEMPTIONS: Readonly<Record<string, string>> = {
  'src/scripts/tooling/run-pre-commit-guard.ts': 'converted with its own row',
  'tooling/vitest/affected.ts': 'converted with its own row',
  'tooling/vitest/pre-push-tests.ts': 'converted with its own row',
  'tooling/ci/check-load-coverage.mjs': 'converted with its own row',
  'agent-os/hooks/': 'converted with its own row',
  'src/tests/': 'converted with its own row',
  'tooling/vitest/run-as-application-role.ts':
    'a pass-through: forwards its whole command line to Vitest unparsed (`pnpm test:rls-role --project e2e --shard=1/4`)',
  'tooling/vitest/worker-databases.ts':
    "no script of its own: the Vitest config reads Vitest's own command line (`--coverage`, `--project`) through it",
};

/**
 * Package scripts whose file cannot be run with `--not-an-option` in a unit test because it needs
 * a database or the network before it parses its command line. Empty today: every script parses
 * first. Name the file and the reason here rather than leaving it out of the run.
 */
const SPAWN_SKIPS: Readonly<Record<string, string>> = {};

function isExempt(file: string): string | undefined {
  const match = Object.keys(EXEMPTIONS).find((path) =>
    path.endsWith('/') ? file.startsWith(path) : file === path,
  );
  return match === undefined ? undefined : EXEMPTIONS[match];
}

function sourceFiles(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, directory), { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) sourceFiles(path, found);
    else if (/\.(?:[cm]?[jt]s)$/.test(entry.name) && !/\.(?:test|d)\.[cm]?[jt]s$/.test(entry.name))
      found.push(path);
  }
  return found;
}

/** The code of a file without its comment lines (a usage line may quote any form freely). */
function code(file: string): string {
  return readFileSync(join(ROOT, file), 'utf8')
    .split('\n')
    .filter((line) => !/^\s*(?:\/\/|\*|\/\*)/.test(line))
    .join('\n');
}

/** The repository file an import specifier names, if it is one of ours. */
function resolveImport(options: { from: string; specifier: string }): string | undefined {
  const { from, specifier } = options;
  let base: string;
  if (specifier.startsWith('@tooling/')) base = `tooling/${specifier.slice('@tooling/'.length)}`;
  else if (specifier.startsWith('@/')) base = `src/${specifier.slice('@/'.length)}`;
  else if (specifier.startsWith('.')) base = relative(ROOT, join(ROOT, dirname(from), specifier));
  else return undefined;
  const stem = base.replace(/\.(?:[cm]?[jt]s)$/, '');
  return [`${stem}.ts`, `${stem}.mjs`, `${stem}.js`, base].find((candidate) =>
    existsSync(join(ROOT, candidate)),
  );
}

/** The file that defines `name` for `file` — itself, or the module it imports `name` from. */
function definingFile(options: { file: string; name: string }): string | undefined {
  const { file, name } = options;
  const source = code(file);
  if (new RegExp(String.raw`function\s+${name}\s*\(`).test(source)) return file;
  for (const match of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
    const names = (match[1] ?? '').split(',').map((part) => part.trim().split(/\s+/)[0]);
    if (names.includes(name)) return resolveImport({ from: file, specifier: match[2] ?? '' });
  }
  return undefined;
}

/** `process.argv.slice(2)` handed straight to the parser. */
const HANDED_TO_PARSER = /parseCommandLine\(\{\s*args:\s*process\.argv\.slice\(2\)/g;
/** `process.argv.slice(2)` handed to a function (its argument, or its `commandLine` field). */
const HANDED_TO_FUNCTION = /(\w+)\(\s*(?:\{\s*commandLine:\s*)?process\.argv\.slice\(2\)/g;
/** Any read of `process.argv` that is left once the allowed forms are taken out. */
const READS_ARGV = /process\.argv/;
/** The entry checks this policy replaced: `import.meta.url` compared, `require.main`, … */
const HAND_WRITTEN_ENTRY_CHECK =
  /import\.meta\.(?:url|filename)[^\n;]*[!=]==|[!=]==[^\n;]*import\.meta\.(?:url|filename)|\brequire\.main\b|import\.meta\.main\b/;
const IMPORTS_NODE_PARSE_ARGS = /import\s*\{[^}]*\bparseArgs\b[^}]*\}\s*from\s*'node:util'/;

/** What is left of a file's `process.argv` reads once the allowed forms are taken out. */
function unparsedArgvReads(file: string): string[] {
  let source = code(file).replace(HANDED_TO_PARSER, 'parseCommandLine({ args: ARGUMENTS');
  const problems: string[] = [];
  source = source.replace(HANDED_TO_FUNCTION, (whole, name: string) => {
    const defining = definingFile({ file, name });
    if (defining !== undefined && code(defining).includes('parseCommandLine(')) {
      return whole.replace('process.argv.slice(2)', 'ARGUMENTS');
    }
    problems.push(`${name}(process.argv.slice(2)) — ${name} does not parse with parseCommandLine`);
    return whole;
  });
  for (const line of source.split('\n')) {
    if (READS_ARGV.test(line) && !problems.some((problem) => line.includes(problem)))
      problems.push(line.trim());
  }
  return problems;
}

const scripts = SCANNED_DIRECTORIES.flatMap((directory) => sourceFiles(directory)).filter(
  (file) => file !== HELPER_FILE,
);
const heldScripts = scripts.filter((file) => isExempt(file) === undefined);

interface PackageScript {
  readonly file: string;
  readonly runner: 'tsx' | 'node';
  readonly names: string[];
}

/** Every script file a package.json script starts with `tsx <file>` or `node <file>`. */
function packageScripts(): PackageScript[] {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };
  const byFile = new Map<string, PackageScript>();
  for (const [name, command] of Object.entries(manifest.scripts)) {
    for (const match of command.matchAll(
      /\b(tsx|node)\s+(?:\.\/)?((?:tooling|src|agent-os)\/[^\s&|;]+\.(?:ts|mjs|js))/g,
    )) {
      const file = match[2] ?? '';
      const existing = byFile.get(file);
      if (existing) existing.names.push(name);
      else byFile.set(file, { file, runner: match[1] === 'node' ? 'node' : 'tsx', names: [name] });
    }
  }
  return [...byFile.values()].sort((left, right) => left.file.localeCompare(right.file));
}

interface SpawnResult {
  readonly code: number | null;
  readonly output: string;
}

function runWithUnknownOption(script: PackageScript): Promise<SpawnResult> {
  const command = script.runner === 'node' ? process.execPath : join(ROOT, 'node_modules/.bin/tsx');
  return new Promise((done) => {
    const child = spawn(command, [script.file, UNKNOWN_OPTION], {
      cwd: ROOT,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), 45_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      done({ code, output });
    });
  });
}

async function inPool<Item, Result>(options: {
  items: readonly Item[];
  size: number;
  run: (item: Item) => Promise<Result>;
}): Promise<Map<Item, Result>> {
  const results = new Map<Item, Result>();
  const queue = [...options.items];
  await Promise.all(
    Array.from({ length: options.size }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
        results.set(item, await options.run(item));
      }
    }),
  );
  return results;
}

describe('tooling command lines — one parser, one entry check', () => {
  it('scans the scripts that read a command line (anti-vacuity)', () => {
    expect(heldScripts).toEqual(
      expect.arrayContaining([
        'agent-os/evals/check.ts',
        'src/scripts/seed/demo-clinic.ts',
        'tooling/ci/check-patch-coverage.mjs',
        'tooling/iterations/intake-iteration.ts',
        'tooling/setup/github/sync.ts',
      ]),
    );
    expect(
      heldScripts.filter((file) => code(file).includes('process.argv')).length,
    ).toBeGreaterThan(60);
  });

  it('(a) reads process.argv only whole, as process.argv.slice(2) handed to parseCommandLine', () => {
    const offenders = heldScripts.flatMap((file) =>
      unparsedArgvReads(file).map((problem) => `${file}: ${problem}`),
    );
    expect(offenders).toEqual([]);
  });

  it('(a) imports node:util parseArgs nowhere but script.ts', () => {
    expect(heldScripts.filter((file) => IMPORTS_NODE_PARSE_ARGS.test(code(file)))).toEqual([]);
  });

  it('(b) decides "am I the entry module" only with isMain(import.meta.url)', () => {
    expect(heldScripts.filter((file) => HAND_WRITTEN_ENTRY_CHECK.test(code(file)))).toEqual([]);
    const callers = heldScripts.filter((file) => /\bisMain\(/.test(code(file)));
    expect(callers.filter((file) => !/\bisMain\(import\.meta\.url\)/.test(code(file)))).toEqual([]);
  });

  it('flags the hand-written shapes it replaced', () => {
    for (const shape of [
      "process.argv.includes('--check')",
      "const after = process.argv[process.argv.indexOf('--live') + 1];",
      'resolve(process.argv[1]) === currentScriptPath',
    ]) {
      expect(READS_ARGV.test(shape.replace(HANDED_TO_PARSER, ''))).toBe(true);
    }
    expect(
      'parseCommandLine({ args: process.argv.slice(2), options: {} })'
        .replace(HANDED_TO_PARSER, '')
        .includes('process.argv'),
    ).toBe(false);
    for (const shape of [
      "if (import.meta.url === 'file://' + process.argv[1]) {",
      'const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);',
      "if (import.meta.url === new URL(process.argv[1] ?? '', 'file:').href) {",
      'if (process.argv[1] === new URL(import.meta.url).pathname) {',
    ]) {
      expect(HAND_WRITTEN_ENTRY_CHECK.test(shape)).toBe(true);
    }
    expect(HAND_WRITTEN_ENTRY_CHECK.test('if (isMain(import.meta.url)) {')).toBe(false);
  });

  it('keeps each exemption pointing at a path that exists', () => {
    expect(Object.keys(EXEMPTIONS).filter((path) => !existsSync(join(ROOT, path)))).toEqual([]);
    expect(Object.keys(SPAWN_SKIPS).filter((path) => !existsSync(join(ROOT, path)))).toEqual([]);
  });

  describe('(c) every package script stops on an unknown option', () => {
    const spawned = packageScripts().filter(
      (script) => isExempt(script.file) === undefined && SPAWN_SKIPS[script.file] === undefined,
    );
    let results = new Map<PackageScript, SpawnResult>();

    beforeAll(async () => {
      results = await inPool({
        items: spawned,
        size: Math.max(2, Math.min(8, Math.floor(availableParallelism() / 2))),
        run: runWithUnknownOption,
      });
    }, 300_000);

    it('finds the package scripts (anti-vacuity)', () => {
      expect(spawned.length).toBeGreaterThan(80);
    });

    it.each(spawned.map((script) => [`${script.file} (${script.names.join(', ')})`, script]))(
      '%s',
      (_label, script) => {
        const result = results.get(script);
        expect(result, 'spawned').toBeDefined();
        expect(
          {
            exitedNonZero: result?.code !== 0,
            namesTheOption: result?.output.includes(UNKNOWN_OPTION),
          },
          result?.output.slice(0, 2000),
        ).toEqual({ exitedNonZero: true, namesTheOption: true });
      },
    );
  });
});

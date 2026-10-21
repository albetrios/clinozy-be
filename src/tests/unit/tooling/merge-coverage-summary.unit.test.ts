import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const MERGE_SCRIPT = resolve(process.cwd(), 'tooling/ci/merge-coverage-and-check-thresholds.mjs');

/** One file, two statements on two lines; `hits` says which statement this shard ran. */
function shardCoverage(hits: readonly [number, number]): object {
  return {
    '/repo/src/example.ts': {
      path: '/repo/src/example.ts',
      statementMap: {
        '0': { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
        '1': { start: { line: 2, column: 0 }, end: { line: 2, column: 10 } },
      },
      fnMap: {},
      branchMap: {},
      s: { '0': hits[0], '1': hits[1] },
      f: {},
      b: {},
    },
  };
}

describe('merge-coverage-and-check-thresholds merged summary', () => {
  let root = '';

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('counts the union of the shards, not any one shard', () => {
    root = mkdtempSync(join(tmpdir(), 'merge-coverage-'));
    for (const [shard, hits] of [
      ['first', [1, 0]],
      ['second', [0, 1]],
    ] as const) {
      mkdirSync(join(root, shard));
      writeFileSync(join(root, shard, 'coverage-final.json'), JSON.stringify(shardCoverage(hits)));
    }

    const output = execFileSync(
      'node',
      [
        MERGE_SCRIPT,
        'first/coverage-final.json',
        'second/coverage-final.json',
        '--output',
        'coverage-merged/coverage-final.json',
        '--report-only',
      ],
      { cwd: root, encoding: 'utf8' },
    );

    // Each shard alone covers one of the two lines; the union covers both.
    expect(output).toContain('lines      : 100.00% (2/2)');
    expect(output).toContain('statements : 100.00% (2/2)');
  });
});

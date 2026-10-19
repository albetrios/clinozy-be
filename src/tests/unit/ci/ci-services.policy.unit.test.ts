import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * One Postgres and Redis service definition (`.github/ci-services.yml`): every job's copy must
 * equal it — GitHub Actions cannot share a `services:` block between workflows — and every job
 * with Postgres turns its durability off with `tune-ci-postgres`, except the k6 load job, which
 * measures latency against production durability.
 */
const WORKFLOWS = '.github/workflows';
const DURABLE_JOBS = new Set(['scheduled-k6-load-slo.yml → k6']);

const canonical = readFileSync('.github/ci-services.yml', 'utf8');
/** The `<name>:` block of a YAML text whose keys sit at `indent` spaces, dedented to column 0. */
function block(options: { text: string; name: string; indent: number }): string | undefined {
  const pad = ' '.repeat(options.indent);
  const lines = options.text.split('\n');
  const start = lines.indexOf(`${pad}${options.name}:`);
  if (start === -1) return undefined;
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() !== '' && !line.startsWith(`${pad} `)) break;
    body.push(line.slice(options.indent));
  }
  return [`${options.name}:`, ...body].join('\n').trimEnd();
}

/** Every job (`  <job>:` under `jobs:`) of every workflow, as `[label, block]`. */
const jobs = readdirSync(WORKFLOWS)
  .filter((name) => name.endsWith('.yml'))
  .flatMap((name) => {
    const text = readFileSync(join(WORKFLOWS, name), 'utf8');
    const body = text.slice(text.indexOf('\njobs:\n'));
    const parts = body.split(/^ {2}([a-z][a-z0-9-]*):\n/m).slice(1);
    const found: Array<[string, string]> = [];
    for (let index = 0; index + 1 < parts.length; index += 2) {
      found.push([`${name} → ${parts[index]}`, parts[index + 1] ?? '']);
    }
    return found;
  });

describe('CI services', () => {
  for (const service of ['postgres', 'redis']) {
    it(`every ${service} service equals .github/ci-services.yml`, () => {
      const expected = block({ text: canonical, name: service, indent: 0 });
      const copies = jobs
        .map(([label, text]) => [label, block({ text, name: service, indent: 6 })] as const)
        .filter(([, copy]) => copy !== undefined);
      // Anti-vacuity: the database lanes carry Postgres, and Redis rides along in more.
      expect(copies.length).toBeGreaterThanOrEqual(service === 'postgres' ? 9 : 13);
      for (const [label, copy] of copies) expect(copy, label).toBe(expected);
    });
  }

  it('turns durability off in every job with Postgres, except the latency-measuring load job', () => {
    const untuned = jobs
      .filter(([, text]) => block({ text, name: 'postgres', indent: 6 }) !== undefined)
      .filter(([, text]) => !text.includes('uses: ./.github/actions/tune-ci-postgres'))
      .map(([label]) => label);
    expect(untuned).toEqual([...DURABLE_JOBS]);
  });
});

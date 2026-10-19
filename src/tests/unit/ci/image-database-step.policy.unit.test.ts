import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A container of the API image sets its database up the one way too: the compiled
 * `node dist/src/scripts/ops/db-prepare.js [--seed <level>]` (`prepareDatabase`, which runs the
 * compiled migration runner when it runs from dist/). The migration runner and the seed modules are
 * never started on their own — `seed/minimal.js` only exports `runMinimalSeed`, so a direct run
 * would seed nothing and pass.
 */
const WORKFLOWS = join(process.cwd(), '.github', 'workflows');
const workflows = readdirSync(WORKFLOWS).filter((name) => name.endsWith('.yml'));
const text = (name: string) => readFileSync(join(WORKFLOWS, name), 'utf8');

describe('the database step inside the image', () => {
  it('starts no migration runner or seed module of dist/ directly', () => {
    const direct = workflows.filter((name) =>
      /node dist\/src\/(?:infrastructure\/database\/migration\/migrate|scripts\/seed\/\w+)\.js/.test(
        text(name),
      ),
    );
    expect(direct).toEqual([]);
  });

  it('runs the compiled one-way step in the image smoke boot', () => {
    expect(text('reusable-docker-build-trivy.yml')).toContain(
      'node dist/src/scripts/ops/db-prepare.js',
    );
  });
});

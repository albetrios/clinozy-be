import { describe, expect, it } from 'vitest';
import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { applyLocalTestMode } from '@tooling/dev/local-test-mode.js';

const TEMPLATE = ['LOG_LEVEL=debug', '# TEST_MODE=false', 'RATE_LIMIT_RELAXED_CAPS=true', ''].join(
  '\n',
);

describe('setup:local turns TEST_MODE on locally', () => {
  it('turns it on when the file does not set it, leaving everything else as it was', () => {
    const updated = applyLocalTestMode(TEMPLATE);
    expect(dotenv.parse(updated)).toEqual({
      LOG_LEVEL: 'debug',
      RATE_LIMIT_RELAXED_CAPS: 'true',
      TEST_MODE: 'true',
    });
    expect(updated.startsWith(TEMPLATE)).toBe(true);
    expect(applyLocalTestMode(updated)).toBe(updated);
  });

  it('keeps a TEST_MODE the developer set, false included', () => {
    const off = TEMPLATE.replace('# TEST_MODE=false', 'TEST_MODE=false');
    expect(applyLocalTestMode(off)).toBe(off);
  });

  it('the template itself leaves it off, so no hosted env file scaffolded from it echoes codes', () => {
    expect(dotenv.parse(readFileSync('.env.example', 'utf8')).TEST_MODE).toBeUndefined();
  });
});

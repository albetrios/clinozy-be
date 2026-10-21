import { describe, expect, it } from 'vitest';
import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { applyLocalSwitches } from '@tooling/dev/local-switches.js';

const TEMPLATE = ['LOG_LEVEL=debug', '# TEST_MODE=false', 'RATE_LIMIT_RELAXED_CAPS=true', ''].join(
  '\n',
);

describe('setup:local turns the local-only switches on', () => {
  it('turns each on when the file does not set it, leaving everything else as it was', () => {
    const { content, turnedOn } = applyLocalSwitches(TEMPLATE);
    expect(dotenv.parse(content)).toEqual({
      LOG_LEVEL: 'debug',
      RATE_LIMIT_RELAXED_CAPS: 'true',
      TEST_MODE: 'true',
      MAIL_RESERVED_DOMAIN_SKIP_ENABLED: 'true',
    });
    expect(turnedOn).toEqual(['TEST_MODE', 'MAIL_RESERVED_DOMAIN_SKIP_ENABLED']);
    expect(content.startsWith(TEMPLATE)).toBe(true);
    expect(applyLocalSwitches(content)).toEqual({ content, turnedOn: [] });
  });

  it('keeps a switch the developer set, false included', () => {
    const off = TEMPLATE.replace('# TEST_MODE=false', 'TEST_MODE=false').concat(
      'MAIL_RESERVED_DOMAIN_SKIP_ENABLED=false\n',
    );
    expect(applyLocalSwitches(off)).toEqual({ content: off, turnedOn: [] });
  });

  it('the template leaves TEST_MODE off, so no hosted env file scaffolded from it echoes codes', () => {
    expect(dotenv.parse(readFileSync('.env.example', 'utf8')).TEST_MODE).toBeUndefined();
  });
});

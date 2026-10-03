import { describe, expect, it } from 'vitest';
import dotenv from 'dotenv';
import {
  commentOutEnvAssignment,
  formatEnvValue,
  upsertEnvAssignment,
} from '@tooling/dev/env-file.util.js';

describe('env-file editing (setup:local)', () => {
  it('replaces an existing assignment and appends a missing one', () => {
    const updated = upsertEnvAssignment(upsertEnvAssignment('A=1\nB=2\n', 'A', '9'), 'C', '3');
    expect(updated).toBe('A=9\nB=2\nC=3\n');
  });

  it('writes a `$` in a value literally (never as a replacement pattern)', () => {
    const updated = upsertEnvAssignment('SECRET=old\n', 'SECRET', 'pa$&ss$1');
    expect(updated).toBe('SECRET=pa$&ss$1\n');
  });

  it('quotes a value that is not a bare token so dotenv reads it back unchanged', () => {
    const values = [
      'plain-token_1.2',
      'Name <a@b.test>',
      'with space',
      'has"quote',
      "it's",
      '-----BEGIN KEY-----\nline two\n-----END KEY-----',
    ];
    for (const value of values) {
      const parsed = dotenv.parse(upsertEnvAssignment('', 'KEY', formatEnvValue(value)));
      expect(parsed.KEY).toBe(value);
    }
  });

  it('comments out an assignment so dotenv no longer sets it', () => {
    const updated = commentOutEnvAssignment('A=1\nB=2\n', 'A');
    expect(updated).toBe('# A=1\nB=2\n');
    expect(dotenv.parse(updated).A).toBeUndefined();
  });
});

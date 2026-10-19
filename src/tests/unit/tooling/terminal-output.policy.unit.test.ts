import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The TypeScript and Node scripts of the tooling and `src/scripts`. */
const scripts = ['tooling', join('src', 'scripts')].flatMap((root) =>
  readdirSync(root, { recursive: true, encoding: 'utf8' })
    .map((path) => join(root, path))
    .filter((path) => /\.(?:ts|mts|mjs)$/.test(path) && !path.includes('node_modules')),
);
const source = (path: string) => readFileSync(path, 'utf8');

/** An escape sequence written by hand (`\x1b[`, `\u001b[`, `\033[`), as source text. */
const HAND_WRITTEN_ESCAPE = /\\(?:x1b|u001b|033)\[/;
/** The UTC calendar day cut from an ISO timestamp — the tooling's "today" is local. */
const UTC_TODAY = /toISOString\(\)\.slice\(0, ?10\)/;

/**
 * Locks in one way to colour terminal output — chalk, with the logger's theme-safe `muted` for
 * gray (`tooling/setup/common/logger.ts`) — and one "today", `localDate`
 * (`tooling/setup/common/date.ts`). Hand-written escapes ignore NO_COLOR and a piped stdout;
 * a UTC day records the wrong date for an evening run.
 */
describe('terminal output and dates in the tooling', () => {
  it('colours with chalk, never hand-written ANSI escapes', () => {
    expect(scripts.length).toBeGreaterThan(100);
    expect(scripts.filter((path) => HAND_WRITTEN_ESCAPE.test(source(path)))).toEqual([]);
  });

  it('takes "today" from localDate, never the UTC day of an ISO timestamp', () => {
    expect(scripts.filter((path) => UTC_TODAY.test(source(path)))).toEqual([]);
    expect(source('tooling/setup/common/date.ts')).toContain('export function localDate');
  });
});

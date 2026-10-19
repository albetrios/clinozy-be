/**
 * Flags user-facing English fallback strings on throws that already use a translation messageKey.
 * Run by `src/tests/unit/validators/locale-hardcoded-fallbacks.policy.unit.test.ts` (the unit lane).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC_ROOT = join(process.cwd(), 'src');

/** Paths excluded from fallback audit (tests may use explicit fallbacks). */
const EXCLUDED_PATH_PATTERNS = [
  /\/__tests__\//,
  /\/tests\//,
  /\.test\.ts$/,
  /\.unit\.test\.ts$/,
  /\.integration\.test\.ts$/,
  /\.e2e\.test\.ts$/,
];

const MESSAGE_KEY_PREFIX = /^(errors|success|common|mail):/;

/** Matches `, undefined, 'English fallback'` or `, { ... }, 'English fallback'` after an errors: messageKey. */
const REDUNDANT_FALLBACK_PATTERN =
  /(['"]errors:[^'"]+['"][\s\S]*?),\s*(?:undefined|\{[^}]*\}),\s*['"]([^'"]+)['"]/g;

/** AppError(messageCode, statusCode, messageKey, …) — messageKey is the third string literal. */
const RAW_APP_ERROR_MESSAGE_KEY_PATTERN =
  /throw new AppError\(\s*['"][^'"]+['"]\s*,\s*\d+\s*,\s*['"](?!errors:|success:|common:|mail:)([^'"]+)['"]/g;

/** Subclasses use messageKey as the first string literal. */
const RAW_SUBCLASS_MESSAGE_KEY_PATTERN =
  /throw new (?:UnauthorizedError|ForbiddenError|ValidationError|ConflictError|NotImplementedError|RateLimitedError|PayloadTooLargeError|UnprocessableEntityError|ServiceUnavailableError|GoneError)\(\s*['"](?!errors:|success:|common:|mail:)([^'"]+)['"]/g;

/** NotFoundError first argument is a resource label for errors:notFound interpolation, not a messageKey. */
const NOT_FOUND_RESOURCE_PATTERN = /^[A-Za-z][A-Za-z0-9 /_-]{0,80}$/;

/** One file × line where the hardcoded-fallback validator detected a missing or redundant translation. */
export type HardcodedFallbackViolation = {
  file: string;
  line: number;
  kind: 'redundant_fallback' | 'raw_message_key';
  detail: string;
};

function isExcluded(filePath: string): boolean {
  return EXCLUDED_PATH_PATTERNS.some((pattern) => pattern.test(filePath));
}

function lineNumberAt({ content, index }: { content: string; index: number }): number {
  return content.slice(0, index).split('\n').length;
}

function collectTypeScriptFiles({
  directory,
  collected = [],
}: {
  directory: string;
  collected?: string[] | undefined;
}): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectTypeScriptFiles({ directory: absolutePath, collected });
    } else if (entry.name.endsWith('.ts')) {
      collected.push(absolutePath);
    }
  }
  return collected;
}

/**
 * Scans every `src/**\/*.ts` file (excluding tests) for `throw` sites that
 * either use a raw English string in place of a translation key or pair a
 * translation key with a redundant English fallback. Used by the
 * locale-hardcoded-fallback CLI to enforce that user-facing copy lives only
 * in `src/shared/locales/`.
 */
export function findHardcodedFallbackViolations(): HardcodedFallbackViolation[] {
  const violations: HardcodedFallbackViolation[] = [];
  const files = collectTypeScriptFiles({ directory: SRC_ROOT });

  for (const absolutePath of files) {
    const relativePath = relative(process.cwd(), absolutePath);
    if (isExcluded(relativePath)) continue;

    const content = readFileSync(absolutePath, 'utf-8');

    for (const pattern of [RAW_APP_ERROR_MESSAGE_KEY_PATTERN, RAW_SUBCLASS_MESSAGE_KEY_PATTERN]) {
      for (const match of content.matchAll(pattern)) {
        const messageKey = match[1];
        if (!messageKey) continue;
        violations.push({
          file: relativePath,
          line: lineNumberAt({ content, index: match.index ?? 0 }),
          kind: 'raw_message_key',
          detail: `messageKey must use errors:/success:/common:/mail: namespace, got "${messageKey}"`,
        });
      }
    }

    for (const match of content.matchAll(/throw new NotFoundError\(\s*['"]([^'"]+)['"]/g)) {
      const resource = match[1];
      if (!resource || NOT_FOUND_RESOURCE_PATTERN.test(resource)) continue;
      violations.push({
        file: relativePath,
        line: lineNumberAt({ content, index: match.index ?? 0 }),
        kind: 'raw_message_key',
        detail: `NotFoundError resource looks like a sentence; add an errors: key instead of "${resource}"`,
      });
    }

    REDUNDANT_FALLBACK_PATTERN.lastIndex = 0;
    for (const match of content.matchAll(REDUNDANT_FALLBACK_PATTERN)) {
      const matchIndex = match.index ?? 0;
      const contextBefore = content.slice(Math.max(0, matchIndex - 400), matchIndex);
      if (contextBefore.includes('translateDetail(')) continue;

      const fallback = match[2];
      if (!fallback || MESSAGE_KEY_PREFIX.test(fallback)) continue;
      violations.push({
        file: relativePath,
        line: lineNumberAt({ content, index: matchIndex }),
        kind: 'redundant_fallback',
        detail: `remove hardcoded fallback "${fallback}"; use messageKey + request.t() only`,
      });
    }
  }

  return violations;
}

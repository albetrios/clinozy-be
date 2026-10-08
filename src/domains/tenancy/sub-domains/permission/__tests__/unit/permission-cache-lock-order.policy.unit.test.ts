import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const permissionCacheServicePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../permission-cache.service.ts',
);

function extractWithPermissionCacheRecomputeLockBody(source: string): string {
  const start = source.indexOf('async function recomputePermissionsUnderLock');
  expect(start).toBeGreaterThanOrEqual(0);
  // The parameter type is `options: { ... }`, so the first brace is not the function body.
  const returnType = source.indexOf('Promise<string[]>', start);
  const openBrace = source.indexOf('{', returnType);
  let depth = 0;
  for (let index = openBrace; index < source.length; index++) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error('withPermissionCacheRecomputeLock body not found');
}

describe('permission-cache lock ordering policy', () => {
  it('commits the cache write before releasing the recompute lock in finally', () => {
    const source = readFileSync(permissionCacheServicePath, 'utf8');
    const functionBody = extractWithPermissionCacheRecomputeLockBody(source);

    const commitIndex = functionBody.indexOf('await commitCachedPermissionsIfLockHeld');
    const finallyIndex = functionBody.indexOf('} finally {');
    const lockReleaseIndex = functionBody.indexOf(
      'PERMISSION_CACHE_RELEASE_LOCK_IF_HELD_LUA',
      finallyIndex,
    );

    expect(commitIndex).toBeGreaterThanOrEqual(0);
    expect(finallyIndex).toBeGreaterThan(commitIndex);
    expect(lockReleaseIndex).toBeGreaterThan(finallyIndex);
  });
});

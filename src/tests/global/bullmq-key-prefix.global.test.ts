import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SOURCE_ROOT = join(ROOT, 'src');

/** A BullMQ construction that owns Redis keys: `new Queue(`, `new Worker<T>(`, `new QueueEvents(`… */
const BULLMQ_CONSTRUCTION = /\bnew\s+(Queue|Worker|QueueEvents|FlowProducer)\s*(<[^>(]*>)?\s*\(/g;

function collectTypeScriptFiles(directory: string, files: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules') continue;
    const fullPath = join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      collectTypeScriptFiles(fullPath, files);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

/** The source of the call starting at `openParenIndex` (balanced parentheses). */
function callArguments(content: string, openParenIndex: number): string {
  let depth = 0;
  for (let index = openParenIndex; index < content.length; index += 1) {
    const character = content[index];
    if (character === '(') depth += 1;
    if (character === ')') {
      depth -= 1;
      if (depth === 0) return content.slice(openParenIndex, index + 1);
    }
  }
  return content.slice(openParenIndex);
}

function lineNumberAt(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}

/**
 * BullMQ takes its key prefix only from the `prefix` option of the Queue / Worker / QueueEvents
 * itself (default `bull`) — a `prefix` inside the ioredis connection options is silently ignored.
 * Without it every environment sharing one Redis shares every queue: the test harness and a
 * running `pnpm dev:worker`, or two deploy targets, consume each other's jobs. Every construction
 * in `src/` — production code and the tests that watch the application's queues — must pass
 * `prefix: getBullMQKeyPrefix()` (`src/infrastructure/queue/connection.ts`).
 */
describe('BullMQ key prefix', () => {
  it('every Queue / Worker / QueueEvents / FlowProducer construction passes getBullMQKeyPrefix()', () => {
    const violations: string[] = [];
    let constructions = 0;
    for (const file of collectTypeScriptFiles(SOURCE_ROOT)) {
      const content = readFileSync(file, 'utf8');
      if (!content.includes("from 'bullmq'")) continue;
      for (const match of content.matchAll(BULLMQ_CONSTRUCTION)) {
        constructions += 1;
        const openParenIndex = match.index + match[0].length - 1;
        if (!callArguments(content, openParenIndex).includes('prefix: getBullMQKeyPrefix()')) {
          violations.push(
            `${relative(ROOT, file)}:${lineNumberAt(content, match.index)}: new ${match[1]}(…) without prefix: getBullMQKeyPrefix()`,
          );
        }
      }
    }
    // Guards the scan itself: a regex that silently matched nothing would pass vacuously.
    expect(constructions).toBeGreaterThan(50);
    expect(violations).toEqual([]);
  });
});

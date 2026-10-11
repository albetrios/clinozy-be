import { spawn, type ChildProcess } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { listProcessTree, signalProcesses } from '@/scripts/ops/process-tree.util.js';

/**
 * The shape `pnpm dev` has: a parent whose child runs in a process group of its own. Signalling
 * only the parent — what `verify:base` did — left the child (the API) running.
 */

/** Whether a process is still alive (signal 0 checks without delivering anything). */
function isAlive(processId: number): boolean {
  try {
    process.kill(processId, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitUntil(condition: () => boolean): Promise<boolean> {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return condition();
}

/** Starts the parent and resolves with its pid and its detached child's pid. */
async function startParentWithDetachedChild(): Promise<{ parent: ChildProcess; childId: number }> {
  const parent = spawn(
    process.execPath,
    [
      '-e',
      `const child = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });
       console.log(child.pid);
       setInterval(() => {}, 1000);`,
    ],
    { stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const childId = await new Promise<number>((resolve) => {
    parent.stdout?.once('data', (chunk: Buffer) => resolve(Number(chunk.toString().trim())));
  });
  return { parent, childId };
}

const started: number[] = [];

afterEach(() => {
  signalProcesses({ processIds: started.splice(0), signal: 'SIGKILL' });
});

describe.skipIf(process.platform === 'win32')('process tree helpers', () => {
  it('lists the root first, then a descendant in another process group', async () => {
    const { parent, childId } = await startParentWithDetachedChild();
    started.push(parent.pid as number, childId);

    const tree = listProcessTree(parent.pid as number);

    expect(tree[0]).toBe(parent.pid);
    expect(tree).toContain(childId);
  });

  it('stops the whole tree, where signalling the parent alone leaves the child running', async () => {
    const { parent, childId } = await startParentWithDetachedChild();
    started.push(parent.pid as number, childId);
    const processIds = listProcessTree(parent.pid as number);

    signalProcesses({ processIds: [parent.pid as number], signal: 'SIGTERM' });
    expect(await waitUntil(() => !isAlive(parent.pid as number))).toBe(true);
    expect(isAlive(childId)).toBe(true);

    signalProcesses({ processIds, signal: 'SIGTERM' });
    expect(await waitUntil(() => !isAlive(childId))).toBe(true);
  });

  it('skips a process that already exited', () => {
    expect(() => signalProcesses({ processIds: [2_147_483_000], signal: 'SIGTERM' })).not.toThrow();
  });
});

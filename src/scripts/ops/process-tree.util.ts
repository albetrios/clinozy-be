import { execFileSync } from 'node:child_process';

/**
 * A spawned process and every process under it, from one `ps` snapshot: the root first.
 *
 * @remarks
 * - **Algorithm:** the walk `stop_process_tree` does in `tooling/setup/agent/stack.sh` — one
 *   `ps -A -o pid= -o ppid=` table, then children by parent from the root down. No `/proc`, so
 *   macOS and Linux both work.
 * - **Failure modes:** none raised — on Windows (no `ps`) or when `ps` fails, only the root.
 */
export function listProcessTree(rootProcessId: number): number[] {
  if (process.platform === 'win32') return [rootProcessId];
  let table: string;
  try {
    table = execFileSync('ps', ['-A', '-o', 'pid=', '-o', 'ppid='], { encoding: 'utf8' });
  } catch {
    return [rootProcessId];
  }
  const childrenByParent = new Map<number, number[]>();
  for (const line of table.split('\n')) {
    const [processId, parentProcessId] = line.trim().split(/\s+/).map(Number);
    if (!processId || parentProcessId === undefined || Number.isNaN(parentProcessId)) continue;
    childrenByParent.set(parentProcessId, [
      ...(childrenByParent.get(parentProcessId) ?? []),
      processId,
    ]);
  }
  const tree = [rootProcessId];
  for (let index = 0; index < tree.length; index++) {
    tree.push(...(childrenByParent.get(tree[index] as number) ?? []));
  }
  return tree;
}

/**
 * Sends `signal` to each process, skipping the ones already gone.
 *
 * @remarks
 * - **Why a whole tree:** `pnpm <script>` runs the script's shell in a process group of its own, so
 *   a signal to the pnpm process never reaches the server it started — `verify:base` left
 *   `pnpm dev`'s API listening on its port after every run. Snapshot the tree with
 *   {@link listProcessTree} before the first signal: once a parent exits, its children are
 *   re-parented and no longer found under it.
 * - **Failure modes:** none raised — a process that already exited is skipped.
 */
export function signalProcesses({
  processIds,
  signal,
}: {
  processIds: number[];
  signal: NodeJS.Signals;
}): void {
  for (const processId of processIds) {
    try {
      process.kill(processId, signal);
    } catch {
      // Already exited.
    }
  }
}

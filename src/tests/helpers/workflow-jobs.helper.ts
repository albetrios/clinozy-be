/**
 * A GitHub Actions workflow sliced into its top-level jobs — the one slicer the `src/tests/unit/ci`
 * workflow policies share, as clinozy-fe's `tests/utils/workflow-jobs.ts`. Line by line, without a
 * backtracking regex: a job runs from its `  <job>:` header to the next 2-space-indented line (the
 * next job, or a comment above it).
 */

/** One top-level job, from its `  <job>:` header to the next job key; `''` when there is none. */
export function jobBlock(options: { readonly workflow: string; readonly job: string }): string {
  const { workflow, job } = options;
  const start = workflow.indexOf(`\n  ${job}:\n`);
  if (start === -1) return '';
  const lines = workflow.slice(start + 1).split('\n');
  const block: string[] = [lines[0] ?? ''];
  for (const line of lines.slice(1)) {
    if (/^ {2}\S/.test(line)) break;
    block.push(line);
  }
  return block.join('\n');
}

/** Every top-level job under `jobs:`, as `[job, block]` in file order. */
export function jobBlocks(workflow: string): Array<[string, string]> {
  const start = workflow.indexOf('\njobs:\n');
  if (start === -1) return [];
  const jobs = workflow.slice(start);
  return [...jobs.matchAll(/^ {2}([a-z][a-z0-9_-]*):$/gm)].map((match) => {
    const job = match[1] ?? '';
    return [job, jobBlock({ workflow: jobs, job })];
  });
}

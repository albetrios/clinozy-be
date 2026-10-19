/**
 * The one way a gate checks for a tool it needs: {@link requireTool}.
 *
 * @remarks
 * Before this, each gate checked in its own way and said something different when the tool was
 * missing — gitleaks blocked with a brew hint, semgrep warned with a pin name, Docker for
 * SonarQube surfaced as a failed `docker info`. Now every gate names the tool, what it was
 * needed for, and the same fix: the tool's installer under `tooling/setup/agent/`, which moves
 * the machine to the version pinned in `tooling/setup/agent/tool-versions.sh`.
 *
 * Which tools block is decided by the caller, once, in the `mode` it passes:
 *
 * - `block` — gitleaks (pre-commit secrets scan) and Docker (the SonarQube gate): the gate has
 *   no stand-in, so a missing tool fails it.
 * - `warn` — semgrep at push: the PR's SAST lane scans everything, so the push goes on.
 */
import { spawnSync } from 'node:child_process';

/** The tools a gate can require, with the arguments that print each one's version. */
const VERSION_ARGUMENTS = {
  docker: ['--version'],
  gitleaks: ['version'],
  semgrep: ['--version'],
} as const satisfies Record<string, readonly string[]>;

/** A tool a gate can require. */
export type RequiredTool = keyof typeof VERSION_ARGUMENTS;

/** `block` fails the gate when the tool is missing; `warn` skips the step and goes on. */
export type ToolMode = 'block' | 'warn';

/**
 * The fix for a missing tool: its installer, which moves the machine to the pinned version.
 *
 * @remarks
 * Every required tool has `tooling/setup/agent/install-<tool>.sh`, so the hint is derived, never
 * hand-written per gate. Failure modes: none.
 */
export function toolInstallHint(name: RequiredTool): string {
  return `bash tooling/setup/agent/install-${name}.sh (pins: tooling/setup/agent/tool-versions.sh)`;
}

/**
 * Whether `name` is installed; when it is not, says so — what it was needed for and how to
 * install it — as an error (`block`) or a warning (`warn`).
 *
 * @remarks
 * Runs the tool's version command; a missing binary and a binary that cannot start both count as
 * missing. The caller acts on the answer: a `block` caller fails its step, a `warn` caller skips
 * it. Side effects: one line on stderr when the tool is missing. Failure modes: never throws.
 *
 * @example
 * ```ts
 * if (!requireTool({ name: 'gitleaks', mode: 'block', purpose: 'the staged secrets scan' })) return 1;
 * ```
 */
export function requireTool(options: {
  readonly name: RequiredTool;
  readonly mode: ToolMode;
  readonly purpose: string;
}): boolean {
  const result = spawnSync(options.name, [...VERSION_ARGUMENTS[options.name]], { stdio: 'ignore' });
  if (result.status === 0) return true;
  const consequence = options.mode === 'block' ? 'cannot run' : 'skipped';
  const marker = options.mode === 'block' ? '✖' : '⚠';
  console.error(
    `${marker} ${options.name} is not installed — ${options.purpose} ${consequence}. Install: ${toolInstallHint(options.name)}`,
  );
  return false;
}

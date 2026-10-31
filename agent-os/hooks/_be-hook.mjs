// The one copy of what every clinozy-be hook does around its own rule: read the JSON payload
// from stdin, find this repository's root, tell whether a path is inside it, and write the
// outputs Claude Code reads. Every hook under agent-os/hooks/ is a Node script built on it (the
// shape of clinozy-fe's _fe-hook.mjs), so no hook needs bash or jq, and no two hooks can read the
// payload or judge "this repository" differently.
//
// Fails open: a payload that cannot be read or parsed is `null`, and each hook then exits 0
// (allows the action) — a hook bug must never brick a session.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * This repository's root: `CLAUDE_PROJECT_DIR` (Claude Code sets it; in a session that holds
 * several repositories tooling/agent-os/session-hooks.ts sets it per repository), else the
 * directory two levels above `agent-os/hooks/`.
 */
export const repositoryRoot = resolve(
  process.env.CLAUDE_PROJECT_DIR || join(dirname(fileURLToPath(import.meta.url)), "../.."),
);

/**
 * Where the hooks keep their per-session state (the turn record, the format queue, the locks,
 * the background probes): `$TMPDIR/clinozy-be-hooks`, `/tmp` when `TMPDIR` is unset.
 */
export const hookStateDirectory = join(process.env.TMPDIR || "/tmp", "clinozy-be-hooks");

/**
 * The hook payload on stdin as an object, or `null` when there is none to read — a terminal, an
 * unreadable stream, malformed JSON, or JSON that is not an object (fail-open).
 */
export function readHookPayload() {
  if (process.stdin.isTTY) return null;
  try {
    const payload = JSON.parse(readFileSync(0, "utf8"));
    return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : null;
  } catch {
    return null;
  }
}

/**
 * True when `path` — absolute, or relative to the repository root — is the root or inside it. A
 * session that holds several repositories runs every repository's hooks on every call, and
 * clinozy-be's conventions judge only its own files.
 */
export function isInsideRepository(path) {
  const absolute = resolve(repositoryRoot, path);
  return absolute === repositoryRoot || absolute.startsWith(`${repositoryRoot}/`);
}

/**
 * The most recently modified in-progress autonomous build, `docs/builds/<name>/`, or `""` when
 * there is none (the session-end and pre-compact hooks name it so a build can be resumed).
 */
export function latestBuildDirectory() {
  try {
    const builds = join(repositoryRoot, "docs", "builds");
    const newest = readdirSync(builds, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({ name: entry.name, modified: statSync(join(builds, entry.name)).mtimeMs }))
      .sort((left, right) => right.modified - left.modified)[0];
    return newest ? `docs/builds/${newest.name}/` : "";
  } catch {
    return "";
  }
}

/** Prints `output` as the one JSON line Claude Code reads from a hook's stdout. */
export function writeHookOutput(output) {
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

/** Writes the PreToolUse `decision` (`deny`) with `reason` shown to the model. */
export function writePermissionDecision({ decision, reason }) {
  writeHookOutput({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: decision,
      permissionDecisionReason: reason,
    },
  });
}

/**
 * Adds `context` to the model's context from the `event` hook (PostToolUse, PostToolUseFailure,
 * UserPromptSubmit, SessionStart or PreCompact): plain stdout from PostToolUse never reaches the
 * model, `hookSpecificOutput.additionalContext` does.
 */
export function addModelContext({ event, context }) {
  writeHookOutput({ hookSpecificOutput: { hookEventName: event, additionalContext: context } });
}

/** Shows `message` to the user as a warning; it blocks nothing. */
export function showSystemMessage(message) {
  writeHookOutput({ systemMessage: message });
}

#!/usr/bin/env node
// Claude Code PostToolUse hook (Read | Grep).
//
// Token-efficiency nudge: when the agent reads a LARGE file whole, or runs a repo-wide content
// Grep, inject a one-line reminder to prefer the code index (codegraph), a ranged Read, or a
// delegated Explore subagent — and to compress large output with headroom. Operationalizes
// agent-os/rules/be-token-efficient-navigation.mdc.
//
// Non-blocking (PostToolUse can only add context — the tool already ran). Fires only on the
// wasteful shapes, so an ordinary scoped read/grep is silent. Records what it flagged (bytes for a
// whole-file read, `grep=unscoped` for a repo-wide grep) as the telemetry detail, so
// `pnpm agent-os:hooks:report` can quantify the flagged volume. Fails OPEN: no input or any error
// exits 0.
import { statSync } from "node:fs";
import { resolve } from "node:path";
import { addModelContext, isInsideRepository, readHookPayload, repositoryRoot } from "./_be-hook.mjs";
import { recordTelemetry } from "./_be-telemetry.mjs";

const LARGE_FILE_BYTES = 25000; // ~600 lines: below this a whole-file read is cheap enough

/** The nudge for this tool call and its telemetry detail, or `null` for an ordinary call. */
function nudge(payload) {
  const input = payload.tool_input ?? {};
  if (payload.tool_name === "Read") {
    // Whole-file read (no offset/limit) of a large file in this repository. Another repository in
    // the same session (tooling/agent-os/session-hooks.ts) runs its own hooks.
    const file = typeof input.file_path === "string" ? input.file_path : "";
    if (!file || "limit" in input || "offset" in input || !isInsideRepository(file)) return null;
    let size = 0;
    try {
      const stats = statSync(resolve(repositoryRoot, file));
      if (stats.isFile()) size = stats.size;
    } catch {
      return null;
    }
    if (size <= LARGE_FILE_BYTES) return null;
    return {
      hint: `Read a large file whole (${size} bytes). For "where/who/what" prefer codegraph (codegraph_search / callers / impact) or a ranged Read (offset/limit); if you must load it all, compress with headroom_compress. (be-token-efficient-navigation)`,
      detail: `bytes=${size}`,
    };
  }
  if (payload.tool_name === "Grep") {
    // Repo-wide CONTENT grep (no path/glob scope).
    const mode = input.output_mode ?? "files_with_matches";
    if (mode !== "content" || "path" in input || "glob" in input) return null;
    return {
      hint: "Repo-wide content grep with no path/glob scope. Prefer codegraph_search for symbols/usages, or scope the grep; for a broad sweep delegate to a read-only Explore subagent (skill: be-delegate-search) so the reads stay out of your context.",
      detail: "grep=unscoped",
    };
  }
  return null;
}

const payload = readHookPayload();
const found = payload ? nudge(payload) : null;
if (found) addModelContext({ event: "PostToolUse", context: `⚡ token-efficiency: ${found.hint}` });
recordTelemetry("be-large-read-nudge", "PostToolUse", found ? "fired" : "silent", found?.detail);

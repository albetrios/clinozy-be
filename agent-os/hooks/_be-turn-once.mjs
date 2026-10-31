// The once-per-turn record of clinozy-be's hooks: a reminder reaches the model through
// PostToolUse additionalContext the first time it applies in a turn (be-edit-hooks.mjs,
// be-subagent-verify.mjs), and not again on every later call of that turn.
// be-prompt-skill-router.mjs (UserPromptSubmit) starts each turn by clearing the record.
//
// The record is one empty file per entry under $TMPDIR/clinozy-be-hooks/<session_id>/. Fails open:
// when the directory cannot be written, every reminder counts as new.
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hookStateDirectory } from "./_be-hook.mjs";

/** The directory that holds `session`'s turn record. */
export function turnDirectory(session) {
  return join(hookStateDirectory, session || "unknown-session");
}

/** True the first time `key` is seen in `session`'s turn, false after that. */
export function turnOnce({ session, key }) {
  try {
    mkdirSync(turnDirectory(session), { recursive: true });
    const marker = join(turnDirectory(session), `once.${createHash("sha1").update(key).digest("hex")}`);
    writeFileSync(marker, "", { flag: "wx" });
  } catch (error) {
    if (error?.code === "EEXIST") return false;
    /* every reminder counts as new when the record cannot be written */
  }
  return true;
}

/** Clears `session`'s turn record: a new prompt starts a new turn. */
export function resetTurn(session) {
  try {
    for (const entry of readdirSync(turnDirectory(session), { withFileTypes: true })) {
      if (entry.isFile()) rmSync(join(turnDirectory(session), entry.name), { force: true });
    }
  } catch {
    /* no record yet */
  }
}

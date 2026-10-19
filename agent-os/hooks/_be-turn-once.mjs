// The once-per-turn record of clinozy-be's hooks: a reminder reaches the model through
// PostToolUse additionalContext the first time it applies in a turn (be-edit-hooks.mjs,
// be-subagent-verify.mjs), and not again on every later call of that turn; a turn the user
// started with /be-ship or /be-open-pr is marked as the PR request (be-prompt-skill-router.mjs
// marks it, be-no-unrequested-pr.mjs reads it). be-prompt-skill-router.mjs (UserPromptSubmit)
// starts each turn by clearing the record.
//
// The record is one empty file per entry under $TMPDIR/clinozy-be-hooks/<session_id>/. Fails open:
// when the directory cannot be written, every reminder counts as new and nothing is marked.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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

/** Records `mark` (lowercase letters and dashes) for the rest of `session`'s turn. */
export function markTurn({ session, mark }) {
  try {
    mkdirSync(turnDirectory(session), { recursive: true });
    writeFileSync(join(turnDirectory(session), `mark.${mark}`), "");
  } catch {
    /* not marked: the confirmation it would skip is asked again */
  }
}

/** True when `mark` was recorded in `session`'s turn. */
export function isTurnMarked({ session, mark }) {
  return existsSync(join(turnDirectory(session), `mark.${mark}`));
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

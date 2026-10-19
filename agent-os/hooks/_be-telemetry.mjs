// Shared telemetry for every hook. Appends one CSV line — timestamp,hook-id,event,fired|silent
// and an optional fifth detail column (e.g. `bytes=31204`, or the outcome of a hook with more
// than two, such as `no-gh`) — to the gitignored agent-os/hooks/.telemetry.log, so
// `pnpm agent-os:hooks:report` can show which hooks fire, how often, what they flagged, and why a
// quiet one stayed quiet. The status is only ever `fired` or `silent`: the readers count `fired`.
// Fail-open: any error is swallowed so telemetry never blocks a hook.
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { repositoryRoot } from "./_be-hook.mjs";

/** Append `timestamp,hookId,event,status[,detail]` to the telemetry log; never throws. */
export function recordTelemetry(hookId, event, status, detail) {
  try {
    // Commas and newlines would break the CSV shape; readers that take 4 columns ignore a 5th.
    const extra = detail ? `,${String(detail).replace(/[,\n]/g, "")}` : "";
    const line = `${new Date().toISOString()},${hookId},${event},${status}${extra}\n`;
    // HOOK_TELEMETRY_LOG moves the log: the hook tests point it at a scratch file, so a test run
    // that spawns the real hooks against this checkout never counts in the real log.
    const log = process.env.HOOK_TELEMETRY_LOG || join(repositoryRoot, "agent-os", "hooks", ".telemetry.log");
    appendFileSync(log, line);
  } catch {
    /* fail-open — telemetry must never break a hook */
  }
}

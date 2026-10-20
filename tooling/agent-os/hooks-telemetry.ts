#!/usr/bin/env tsx
/**
 * agent-os hooks telemetry report — aggregates agent-os/hooks/.telemetry.log
 * (written by _be-telemetry.sh / _be-telemetry.mjs) into a per-hook summary: total
 * runs, fired vs silent, silent ratio, last-fired timestamp, and why a quiet hook stayed quiet
 * (the detail column of its silent rows: `not-a-push`, `no-gh`, …).
 *
 * Every hook declared in agent-os/hooks/hooks.json is listed even with zero
 * runs, so a hook that never fires (or was never invoked) is visible. A hook
 * silent for 30+ days is a pruning candidate — see agent-os/hooks/README.md.
 *
 * Read-only: it never writes or deletes the log. Usage: `pnpm agent-os:hooks:report`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCommandLine } from '@tooling/setup/common/script.js';

parseCommandLine({ args: process.argv.slice(2) });

const repositoryRoot = process.cwd();
const logPath = join(repositoryRoot, 'agent-os', 'hooks', '.telemetry.log');
const manifestPath = join(repositoryRoot, 'agent-os', 'hooks', 'hooks.json');

interface Stat {
  total: number;
  fired: number;
  silent: number;
  lastFired: string | null;
  lastRun: string | null;
  /** Sum of `bytes=N` details (5th CSV column) — volume the hook flagged. */
  flaggedBytes: number;
  /** Silent rows by reason: the detail column, or the status of a row written without one. */
  quiet: Map<string, number>;
}

const declaredHookIds: string[] = existsSync(manifestPath)
  ? (
      (JSON.parse(readFileSync(manifestPath, 'utf8')) as { hooks?: Array<{ id?: string }> })
        .hooks ?? []
    )
      .map((entry) => entry.id)
      .filter((id): id is string => typeof id === 'string')
  : [];

const stats = new Map<string, Stat>();
const ensure = (id: string): Stat => {
  const existing = stats.get(id);
  if (existing) return existing;
  const fresh: Stat = {
    total: 0,
    fired: 0,
    silent: 0,
    lastFired: null,
    lastRun: null,
    flaggedBytes: 0,
    quiet: new Map(),
  };
  stats.set(id, fresh);
  return fresh;
};
for (const id of declaredHookIds) ensure(id);

if (existsSync(logPath)) {
  for (const line of readFileSync(logPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [timestamp, hookId, , status, detail] = trimmed.split(',');
    if (!hookId) continue;
    const stat = ensure(hookId);
    stat.total++;
    if (status === 'fired') {
      stat.fired++;
      if (timestamp && (!stat.lastFired || timestamp > stat.lastFired)) stat.lastFired = timestamp;
    } else {
      stat.silent++;
      const reason = detail || status || 'silent';
      stat.quiet.set(reason, (stat.quiet.get(reason) ?? 0) + 1);
    }
    if (detail?.startsWith('bytes=')) {
      const bytes = Number(detail.slice('bytes='.length));
      if (Number.isFinite(bytes) && bytes > 0) stat.flaggedBytes += bytes;
    }
    if (timestamp && (!stat.lastRun || timestamp > stat.lastRun)) stat.lastRun = timestamp;
  }
}

const now = Date.now();
const daysAgo = (iso: string | null): number | null =>
  iso ? Math.floor((now - Date.parse(iso)) / (24 * 60 * 60 * 1000)) : null;

const rows = [...stats.entries()].sort((a, b) => b[1].fired - a[1].fired);

console.log('\nagent-os hook telemetry\n');
if (!existsSync(logPath)) console.log('  (no .telemetry.log yet — hooks log here as they run)\n');
console.log('  hook                      runs   fired  silent  silent%  last-fired');
console.log('  ------------------------  -----  -----  ------  -------  ----------');
const pruningCandidates: string[] = [];
/** Ids in the log that hooks.json no longer declares (a renamed or removed hook's old rows). */
const retiredIds: string[] = [];
for (const [id, stat] of rows) {
  const silentPct = stat.total ? Math.round((stat.silent / stat.total) * 100) : 0;
  const firedDays = daysAgo(stat.lastFired);
  const lastFired = stat.lastFired ? `${firedDays}d ago` : 'never';
  console.log(
    `  ${id.padEnd(24)}  ${String(stat.total).padStart(5)}  ${String(stat.fired).padStart(5)}  ${String(stat.silent).padStart(6)}  ${String(silentPct).padStart(6)}%  ${lastFired}`,
  );
  if (!declaredHookIds.includes(id)) retiredIds.push(id);
  else if (stat.fired === 0 || (firedDays !== null && firedDays >= 30)) pruningCandidates.push(id);
}

const totalFlaggedBytes = [...stats.values()].reduce((sum, stat) => sum + stat.flaggedBytes, 0);
if (totalFlaggedBytes > 0) {
  console.log(
    `\n  flagged read volume (be-large-read-nudge \`bytes=\` details): ${(totalFlaggedBytes / 1024).toFixed(0)} KiB — candidate savings via ranged Reads / codegraph / headroom_compress`,
  );
}

/** A hook's top three silent reasons, e.g. `not-a-push 519, no-gh 18`. */
const whyQuiet = (id: string): string =>
  [...(stats.get(id)?.quiet ?? new Map<string, number>())]
    .sort((first, second) => second[1] - first[1])
    .slice(0, 3)
    .map(([reason, count]) => `${reason} ${count}`)
    .join(', ');

console.log('');
if (pruningCandidates.length) {
  console.log('⚠ pruning candidates (never fired, or silent 30+ days), and why each stayed quiet:');
  for (const id of pruningCandidates) console.log(`  ${id}: ${whyQuiet(id) || 'no runs'}`);
  console.log(
    '  Review monthly — a hook that never fires is dead weight (agent-os/hooks/README.md).\n',
  );
} else {
  console.log('✓ every declared hook has fired recently.\n');
}
if (retiredIds.length) {
  console.log(`  retired ids still in the log (not in hooks.json): ${retiredIds.join(', ')}\n`);
}

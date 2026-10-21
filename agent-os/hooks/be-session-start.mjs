#!/usr/bin/env node
// Claude Code SessionStart hook for clinozy-be.
//
// Two jobs:
//   1. (web) Make the env usable: verify Node, switch to a new-enough Node when needed (pinned for
//      the session via $CLAUDE_ENV_FILE) — installing the .nvmrc version first when none is on
//      disk — and install deps so `pnpm validate` / tests / linters work. The installers stay what
//      they are — tooling/setup/agent/*.sh, pnpm and corepack, spawned from here.
//   2. Inject session context: the agent-os skill-trigger routing map plus a short env/commands
//      summary, as SessionStart additionalContext.
//
// The slow probes (agent-os:check, the agent tools against their pins) run detached — this script
// started again with `--probe <name>` — so the banner shows the last finished result and the
// session never waits for them. stderr carries install logs and diagnostics (NOT added to
// context). Fails open: any error exits 0.
import { spawn, spawnSync } from "node:child_process";
import {
  accessSync,
  appendFileSync,
  constants,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { addModelContext, hookStateDirectory, repositoryRoot } from "./_be-hook.mjs";
import { recordTelemetry } from "./_be-telemetry.mjs";

const DEFAULT_NODE_MAJOR = 24;
const isRemote = process.env.CLAUDE_CODE_REMOTE === "true";
const probeDirectory = join(hookStateDirectory, "probes");
/** Exits 0 while a live bring-up holds the stack lock (stack-lock.lib.sh), with bootstrap.sh's default. */
const STACK_LOCK_HOLDER_COMMAND =
  // biome-ignore lint/suspicious/noTemplateCurlyInString: a shell parameter expansion, not a template.
  'source tooling/setup/agent/stack-lock.lib.sh && stack_lock_holder "${AGENT_STACK_DIR:-/tmp/agent-stack}"';
/** The agent tools the banner checks against tooling/setup/agent/tool-versions.sh. */
const AGENT_TOOLS = [
  "codegraph:CODEGRAPH_VERSION:--version",
  "headroom:HEADROOM_VERSION:--version",
  "semgrep:SEMGREP_VERSION:--version",
  "gitleaks:GITLEAKS_VERSION:version",
  "k6:K6_VERSION:version",
];

/** Writes one diagnostic line to stderr (never the model's context). */
function diagnose(message) {
  process.stderr.write(`session-start: ${message}\n`);
}

function isExecutable(path) {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** True when `name` is an executable on PATH (the shell's `command -v`). */
function onPath(name) {
  return (process.env.PATH || "").split(delimiter).some((directory) => directory && isExecutable(join(directory, name)));
}

const dependenciesInstalled = () => isExecutable(join(repositoryRoot, "node_modules", ".bin", "biome"));

/** The major version in a version text (`v24.2.0`, `24.2.0`), or `NaN`. */
function majorOf(text) {
  return Number.parseInt((text || "").replace(/[^0-9.]/g, "").split(".")[0] || "NaN", 10);
}

/** The repository's Node major: `.nvmrc`, else 24. */
function requiredNodeMajor() {
  try {
    const major = majorOf(readFileSync(join(repositoryRoot, ".nvmrc"), "utf8"));
    return Number.isNaN(major) ? DEFAULT_NODE_MAJOR : major;
  } catch {
    return DEFAULT_NODE_MAJOR;
  }
}

/** `<parent>/<prefix>*` directories, sorted, as the shell expands the glob. */
function matchingDirectories({ parent, prefix }) {
  try {
    return readdirSync(parent)
      .filter((entry) => entry.startsWith(prefix))
      .sort()
      .map((entry) => join(parent, entry));
  } catch {
    return [];
  }
}

/** The `bin` directories a new-enough Node may live in, in the order they are tried. */
function nodeCandidates(major) {
  const bins = (directories) => directories.map((directory) => join(directory, "bin"));
  return [
    `/opt/node${major}/bin`,
    ...bins(matchingDirectories({ parent: "/opt", prefix: `node${major}` })),
    ...bins(matchingDirectories({ parent: join(process.env.HOME || "", ".nvm", "versions", "node"), prefix: `v${major}` })),
    ...bins(matchingDirectories({ parent: "/usr/local", prefix: `node${major}` })),
  ];
}

/** Puts a new-enough Node first on PATH for this hook and the session; the switched Node or `null`. */
function activateRequiredNode(requiredMajor) {
  for (const candidate of nodeCandidates(requiredMajor)) {
    if (!isExecutable(join(candidate, "node"))) continue;
    const version = spawnSync(join(candidate, "node"), ["-v"], { encoding: "utf8" }).stdout?.trim() ?? "";
    const major = majorOf(version);
    if (!(major >= requiredMajor)) continue;
    process.env.PATH = `${candidate}:${process.env.PATH || ""}`;
    if (process.env.CLAUDE_ENV_FILE) {
      try {
        appendFileSync(process.env.CLAUDE_ENV_FILE, `export PATH=${candidate}:$PATH\n`);
      } catch {
        /* switched for this hook only */
      }
    }
    diagnose(`switched to ${version} at ${candidate} (persisted for the session).`);
    return { version, major, adequate: true };
  }
  return null;
}

/** Runs `command` in the repository with its output on stderr; true when it exits 0. */
function runToStderr(command, args, options = {}) {
  return spawnSync(command, args, { cwd: repositoryRoot, stdio: ["ignore", process.stderr, process.stderr], ...options }).status === 0;
}

/**
 * The Node to work with: the one on PATH, else a new-enough one switched to for the session —
 * on the web installed first with the .nvmrc installer when none is on disk (the image ships
 * Node 20-22 only; the pinned one comes from the environment's cached Setup script, which may
 * not have run). Best-effort and fail-open.
 */
function provisionNode(requiredMajor) {
  const current = { version: process.version, major: majorOf(process.version), adequate: majorOf(process.version) >= requiredMajor };
  if (current.adequate) return current;
  const switched = activateRequiredNode(requiredMajor);
  if (switched) return switched;
  const installer = "tooling/setup/agent/install-node.sh";
  if (isRemote && existsSync(join(repositoryRoot, installer))) {
    diagnose(`no Node >=${requiredMajor} on disk — installing the .nvmrc version (best-effort)…`);
    const installed = runToStderr("bash", [installer]) && activateRequiredNode(requiredMajor);
    if (installed) return installed;
    diagnose(`Node install failed — run: bash ${installer}`);
  }
  return current;
}

/** Installs the dependencies in a web session, when Node is new enough and they are missing. */
function installDependencies({ node, requiredMajor }) {
  if (!isRemote) return;
  if (!node.adequate) {
    diagnose(`Node ${node.version} is below required v${requiredMajor} (.nvmrc) — skipping pnpm install.`);
  } else if (dependenciesInstalled()) {
    diagnose("dependencies already present — skipping install.");
  } else {
    diagnose("installing dependencies (pnpm install)…");
    spawnSync("corepack", ["enable"], { cwd: repositoryRoot, stdio: "ignore" });
    if (!runToStderr("pnpm", ["install", "--prefer-offline"]) && !runToStderr("pnpm", ["install"])) {
      diagnose("pnpm install failed (see log above).");
    }
  }
}

/** The last finished result of probe `name`, or `fallback` before its first run. */
function lastProbe({ name, fallback }) {
  try {
    return readFileSync(join(probeDirectory, name), "utf8").trim() || fallback;
  } catch {
    return fallback;
  }
}

/** Starts probe `name` detached (this script with `--probe <name>`); it outlives the hook. */
function startProbe(name) {
  try {
    spawn(process.execPath, [fileURLToPath(import.meta.url), "--probe", name], {
      cwd: repositoryRoot,
      detached: true,
      stdio: "ignore",
    }).unref();
  } catch {
    /* the banner keeps the last result */
  }
}

/** Probe: `pnpm agent-os:check` — the only gate at startup (no DB); its log beside the result. */
function probeAgentOsCheck() {
  const log = join(probeDirectory, "agent-os-check.log");
  const output = openSync(log, "w");
  const passed = spawnSync("pnpm", ["agent-os:check"], { cwd: repositoryRoot, stdio: ["ignore", output, output] }).status === 0;
  const at = new Date().toISOString().slice(11, 19);
  writeFileSync(join(probeDirectory, "agent-os-check"), `${passed ? "passed" : `failed — see ${log}`} at ${at}Z\n`);
}

/** Runs a function of a bash library (`source <library>; <function> <args>`); its stdout. */
function libraryFunction({ library, call, args }) {
  return new Promise((resolveOutput) => {
    const child = spawn("bash", ["-c", `source "$0" && ${call} "$@"`, library, ...args], {
      cwd: repositoryRoot,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.on("close", () => resolveOutput(output.trim()));
    child.on("error", () => resolveOutput(""));
  });
}

/**
 * Probe: every agent tool against its pin (tooling/setup/agent/tool-versions.sh), read with the
 * installers' own tool-install.lib.sh. A cached environment keeps the versions it was built with;
 * the installers move a machine to the pin only when they run, so the banner names every tool that
 * drifted. Local `--version` calls only, in parallel (Python CLIs start slowly) — no network.
 */
async function probeToolPins() {
  const library = "tooling/setup/agent/tool-install.lib.sh";
  const rows = await Promise.all(
    AGENT_TOOLS.map(async (entry) => {
      const [name, key, flag] = entry.split(":");
      const [current, pinned] = await Promise.all([
        libraryFunction({ library, call: "installed_version", args: [name, flag] }),
        libraryFunction({ library, call: "pinned_version", args: [key] }),
      ]);
      return { name, current: current || "missing", pinned };
    }),
  );
  // Each drifted tool names its own installer, as `pnpm tool:agent-tools` does: a failed
  // best-effort install still writes bootstrap.sh's install stamp, so re-running the bootstrap
  // skips the installs and repairs nothing.
  const drifted = rows
    .filter((row) => row.current !== row.pinned)
    .map((row) => `${row.name} ${row.current}≠${row.pinned} — run bash tooling/setup/agent/install-${row.name}.sh`);
  let result = `${rows.length - drifted.length}/${rows.length} at pin`;
  if (drifted.length > 0) result += ` (${drifted.join("; ")})`;
  writeFileSync(join(probeDirectory, "tool-pins"), `${result}\n`);
}

/** The agent-os:check line: the last finished result, re-checked in the background (web only). */
function agentOsStatus() {
  if (!isRemote || !dependenciesInstalled()) return "skipped";
  startProbe("agent-os-check");
  return `${lastProbe({ name: "agent-os-check", fallback: "first check running" })} — re-checking in the background (${join(probeDirectory, "agent-os-check.log")})`;
}

/**
 * Best-effort: the Docker daemon on web sessions. DB / Redis / chaos work needs `docker compose`,
 * but the cloud image ships dockerd without starting it; start it through the one way tooling
 * starts Docker (ensure-docker-daemon.sh), bounded so a stuck daemon never holds the session up.
 * compose:up / migrations / seeds stay on demand — only the daemon is started here. A bring-up
 * (launched here or already running) starts the daemon itself at its step 9, so then this only
 * reports: starting it here too would race the bring-up and hold the session for the daemon's
 * start-up (~45 s).
 */
function dockerStatus({ bringUpStartsIt }) {
  if (!isRemote || !onPath("docker")) return "n/a";
  if (spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0) return "up";
  if (bringUpStartsIt) return "starting (bootstrap.sh starts it)";
  diagnose("Docker daemon down — starting it (best-effort)…");
  // In the hook's own probe directory, beside the other probe logs — not a fixed name in /tmp.
  mkdirSync(probeDirectory, { recursive: true });
  const logPath = join(probeDirectory, "dockerd-session-start.log");
  const log = openSync(logPath, "w");
  const started = spawnSync("bash", [join(repositoryRoot, "tooling/setup/agent/ensure-docker-daemon.sh")], {
    cwd: repositoryRoot,
    env: { ...process.env, DOCKERD_WAIT_SECONDS: "10" },
    stdio: ["ignore", log, log],
    timeout: 90_000,
  });
  return started.status === 0
    ? "started"
    : `start-failed (log: ${logPath}; run: bash tooling/setup/agent/ensure-docker-daemon.sh)`;
}

/**
 * Self-heal: gitleaks for the pre-commit secret scan, which hard-errors without it. The cached
 * Setup script installs it, but an older cached image can predate that wiring — install on demand
 * when absent. A plain PATH check when present (the common case).
 */
function gitleaksStatus() {
  if (onPath("gitleaks")) return "present";
  const installer = "tooling/setup/agent/install-gitleaks.sh";
  if (!isRemote || !existsSync(join(repositoryRoot, installer))) return "absent";
  diagnose("gitleaks missing — installing for the pre-commit secret scan (best-effort)…");
  runToStderr("bash", [installer]);
  return onPath("gitleaks") ? "installed" : `install-failed (run: bash ${installer})`;
}

/**
 * The MCP config: declare the default server pair before the first prompt. Claude Code reads
 * `.mcp.json` at startup (a tracked symlink → the gitignored agent-os/mcp/mcp.json); on local
 * sessions, scaffold that target from the committed `.mcp.default.json` (codegraph + headroom,
 * zero-config) when absent, as setup:local does — written directly, since copying onto a dangling
 * symlink fails on a fresh Linux clone. Web sessions load MCP from the platform environment
 * settings, not this file, so there it only reports.
 */
function mcpStatus() {
  const declared = join(repositoryRoot, ".mcp.json");
  if (existsSync(declared)) {
    try {
      return `${Object.keys(JSON.parse(readFileSync(declared, "utf8")).mcpServers ?? {}).length} declared`;
    } catch {
      return "? declared";
    }
  }
  if (!isRemote && existsSync(join(repositoryRoot, ".mcp.default.json"))) {
    try {
      copyFileSync(join(repositoryRoot, ".mcp.default.json"), join(repositoryRoot, "agent-os", "mcp", "mcp.json"));
      diagnose("scaffolded .mcp.json from .mcp.default.json (codegraph + headroom); add the rest with `pnpm mcp:setup`.");
      return "scaffolded default pair (codegraph + headroom)";
    } catch {
      return "template only (run: pnpm mcp:setup:default)";
    }
  }
  return "platform-managed on web (configure in the environment MCP settings); local: pnpm mcp:setup";
}

/**
 * Hook health from telemetry: the README's monthly ritual (prune hooks silent 30+ days), enforced
 * passively — names any hook whose last `fired` row is older than 30 days, or that never fired
 * across 50+ runs, with why it stayed quiet (the detail column, e.g. `not-a-push 519, no-gh 18`),
 * so a dead hook and a too-narrow trigger read differently. Empty when telemetry is absent.
 */
function hookHealth() {
  let rows;
  try {
    rows = readFileSync(join(repositoryRoot, "agent-os", "hooks", ".telemetry.log"), "utf8").split("\n");
  } catch {
    return "";
  }
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const hooks = new Map();
  for (const row of rows) {
    const [timestamp, hook, , status, detail] = row.split(",");
    if (status === undefined) continue;
    const entry = hooks.get(hook) ?? { runs: 0, lastFired: 0, quiet: new Map() };
    entry.runs += 1;
    if (status === "fired") entry.lastFired = Math.max(entry.lastFired, Date.parse(timestamp) || 0);
    else entry.quiet.set(detail || status, (entry.quiet.get(detail || status) ?? 0) + 1);
    hooks.set(hook, entry);
  }
  const why = (quiet) =>
    [...quiet]
      .sort((first, second) => second[1] - first[1])
      .slice(0, 3)
      .map(([reason, count]) => `${reason} ${count}`)
      .join(", ");
  const candidates = [...hooks]
    .map(([hook, { runs, lastFired, quiet }]) => {
      if (lastFired === 0 && runs >= 50) return `${hook} (never fired, ${runs} runs: ${why(quiet)})`;
      if (lastFired !== 0 && lastFired < cutoff) return `${hook} (silent >30d)`;
      return "";
    })
    .filter(Boolean);
  if (candidates.length === 0) return "";
  return `\n- Hook pruning candidates (silent 30+ days / never fired): ${candidates.join(" ")} — review with \`pnpm agent-os:hooks:report\` (agent-os/hooks/README.md)`;
}

/** The tools-vs-pins line: the last finished result, re-checked in the background. */
function toolsStatus() {
  if (!existsSync(join(repositoryRoot, "tooling/setup/agent/tool-install.lib.sh"))) return "n/a";
  startProbe("tool-pins");
  return `${lastProbe({ name: "tool-pins", fallback: "first check running" })} — re-checking in the background`;
}

/**
 * Live playground (web): `bootstrap.sh` (setup → Postgres + Redis → migrate → demo seed → API +
 * worker kept running) launched detached in its own session, so the session starts at once and
 * the stack goes live in the background; the banner tells the agent to wait for "live" before
 * database/API work. Never launches twice: a live API (/livez) or a bring-up holding the stack
 * lock (stack-lock.lib.sh's stack_lock_holder, which treats a lock whose run is gone as stale)
 * skips it. Local sessions are untouched. Returns the banner line and whether a bring-up —
 * launched here or already running — is the one starting the Docker daemon.
 */
async function stackStatus() {
  const stackDirectory = process.env.AGENT_STACK_DIR || "/tmp/agent-stack";
  if (!isRemote) return { line: "on demand (local session) — bash tooling/setup/agent/bootstrap.sh", bringUp: false };
  try {
    const response = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/livez`, { signal: AbortSignal.timeout(2000) });
    if (response.status === 200) return { line: "live — pnpm dev:stack:status", bringUp: false };
  } catch {
    /* not live */
  }
  // The shell reads AGENT_STACK_DIR itself, as bootstrap.sh and stack.sh do: no value of it is
  // ever part of a command line.
  const lockHolder = spawnSync("bash", ["-c", STACK_LOCK_HOLDER_COMMAND], { cwd: repositoryRoot, stdio: "ignore" });
  if (lockHolder.status === 0) {
    return { line: `starting (bring-up already running) — tail -f ${stackDirectory}/bootstrap.log`, bringUp: true };
  }
  if (!dependenciesInstalled()) {
    return { line: "not started (dependencies missing) — bash tooling/setup/agent/bootstrap.sh", bringUp: false };
  }
  mkdirSync(stackDirectory, { recursive: true, mode: 0o700 });
  // A stack directory another user made in /tmp, or a link, could aim this log anywhere: refuse it.
  const directory = lstatSync(stackDirectory);
  if (!directory.isDirectory() || directory.uid !== process.getuid?.()) {
    return { line: `not started (${stackDirectory} is not this user's directory) — bash tooling/setup/agent/bootstrap.sh`, bringUp: false };
  }
  const log = openSync(join(stackDirectory, "bootstrap.log"), "w", 0o600);
  // detached: its own session (setsid), so it outlives this hook and the agent's process group.
  spawn("bash", ["tooling/setup/agent/bootstrap.sh"], { cwd: repositoryRoot, detached: true, stdio: ["ignore", log, log] }).unref();
  return { line: `starting in the background — follow: tail -f ${stackDirectory}/bootstrap.log`, bringUp: true };
}

/** The `gh` version, or `absent`. */
function githubCliStatus() {
  if (!onPath("gh")) return "absent";
  return spawnSync("gh", ["--version"], { encoding: "utf8" }).stdout?.split("\n")[0]?.trim().split(/\s+/)[2] || "absent";
}

function routingMap() {
  try {
    return readFileSync(join(repositoryRoot, "agent-os", "docs", "skill-triggers.md"), "utf8");
  } catch {
    return "";
  }
}

/**
 * The session briefing. Its first line names the repository root the hooks ran from: the canary
 * that shows this repository's hooks loaded (with telemetry's `be-session-start` row in
 * agent-os/hooks/.telemetry.log), including in a session that holds several repositories
 * (tooling/agent-os/session-hooks.ts).
 */
async function sessionContext() {
  const requiredMajor = requiredNodeMajor();
  const node = provisionNode(requiredMajor);
  installDependencies({ node, requiredMajor });
  mkdirSync(probeDirectory, { recursive: true });
  // The stack first: a bring-up starts the Docker daemon itself (bootstrap.sh step 9), so launching
  // it before anything slow hands the session over at once, not after the daemon's start-up.
  const stack = await stackStatus();
  const agentOs = agentOsStatus();
  const docker = dockerStatus({ bringUpStartsIt: stack.bringUp });
  const gitleaks = gitleaksStatus();
  const mcp = mcpStatus();
  const health = hookHealth();
  const tools = toolsStatus();
  const dependencies = dependenciesInstalled() ? "installed" : "missing";
  const codegraph = existsSync(join(repositoryRoot, ".codegraph", "codegraph.db")) ? "present" : "absent";
  // "provisioned" = the cached toolchain the Setup script builds (Node >=required + installed deps) is live.
  const provisioned = node.adequate && dependencies === "installed" ? "yes" : "no";
  const nodeNote = node.adequate ? "" : `  (switch to Node >=${requiredMajor} from .nvmrc, then pnpm install)`;
  return [
    `clinozy-be session ready (hooks from ${repositoryRoot}) — environment provisioned: ${provisioned}.`,
    `- Node ${node.version} (need >=${requiredMajor}) · deps ${dependencies} · gh ${githubCliStatus()} · codegraph ${codegraph} · mcp ${mcp} · gitleaks ${gitleaks} · tools ${tools} · agent-os ${agentOs} · docker ${docker}${nodeNote}${health}`,
    `- Stack: ${stack.line}`,
    "- Web sessions go fully live on their own: bootstrap.sh (setup → Postgres + Redis → migrate → demo seed → API :3000 + worker :9090, kept running). Before any database/API work, wait until pnpm dev:stack:status says live.",
    "- Gates: pnpm validate · pnpm ci:local   (pre-commit: pnpm guard:pre-commit)",
    "- Custom commands: /be-validate · /be-ci-local · /be-new-domain · /be-routes-sync",
    "",
    "agent-os skill routing — consult be-skill-index FIRST, then run the listed skill(s) for the files you change:",
    "",
    routingMap(),
  ].join("\n");
}

const PROBES = { "agent-os-check": probeAgentOsCheck, "tool-pins": probeToolPins };

try {
  if (process.argv[2] === "--probe") {
    mkdirSync(probeDirectory, { recursive: true });
    await PROBES[process.argv[3]]?.();
  } else if (existsSync(repositoryRoot)) {
    process.chdir(repositoryRoot);
    recordTelemetry("be-session-start", "SessionStart", "fired"); // SessionStart always briefs
    addModelContext({ event: "SessionStart", context: await sessionContext() });
  }
} catch {
  /* fail-open */
}

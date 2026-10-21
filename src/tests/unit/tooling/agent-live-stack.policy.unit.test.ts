import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sessionStart = readFileSync('agent-os/hooks/be-session-start.mjs', 'utf8');
const bootstrap = readFileSync('tooling/setup/agent/bootstrap.sh', 'utf8');
const installNode = readFileSync('tooling/setup/agent/install-node.sh', 'utf8');
const stack = readFileSync('tooling/setup/agent/stack.sh', 'utf8');
const packageScripts = (
  JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> }
).scripts;

/**
 * Locks in the live playground: every web session brings itself fully live — setup, then
 * Postgres + Redis, migrations, the demo seed, and the API + worker left running — before
 * the work starts, without slowing the session's start (the hook launches it detached).
 */
describe('live playground stack policy', () => {
  it('the session-start hook launches the bring-up detached, on web sessions only', () => {
    expect(sessionStart).toContain('const isRemote = process.env.CLAUDE_CODE_REMOTE === "true";');
    expect(sessionStart).toContain('if (!isRemote) return { line: "on demand (local session)');
    // Its own session (setsid), its log in the stack directory, and not waited for.
    expect(sessionStart).toContain(
      'spawn("bash", ["tooling/setup/agent/bootstrap.sh"], { cwd: repositoryRoot, detached: true, stdio: ["ignore", log, log] }).unref();',
    );
    expect(sessionStart).toContain('openSync(join(stackDirectory, "bootstrap.log"), "w", 0o600)');
    // The log goes only into a stack directory this user owns: never one another user planted.
    expect(sessionStart).toContain('mkdirSync(stackDirectory, { recursive: true, mode: 0o700 });');
    expect(sessionStart).toContain('directory.uid !== process.getuid?.()');
    // AGENT_STACK_DIR reaches the lock check through the environment, never the command line.
    expect(sessionStart).toContain('spawnSync("bash", ["-c", STACK_LOCK_HOLDER_COMMAND]');
    expect(sessionStart).not.toMatch(/stack_lock_holder "\$1"/);
  });

  it('a web session with no pinned Node on disk installs it before the dependency install', () => {
    expect(sessionStart).toContain('const installer = "tooling/setup/agent/install-node.sh";');
    expect(sessionStart).toContain(
      'runToStderr("bash", [installer]) && activateRequiredNode(requiredMajor)',
    );
    const provision = sessionStart.indexOf('const node = provisionNode(requiredMajor);');
    expect(provision).toBeGreaterThan(-1);
    expect(provision).toBeLessThan(
      sessionStart.indexOf('installDependencies({ node, requiredMajor });'),
    );
    // The installer elevates itself, so the hook and bootstrap.sh call it the same way.
    expect(installNode).toContain('sudo -n env NODE_INSTALL_PREFIX=');
    expect(bootstrap).not.toContain('sudo -n env NODE_INSTALL_PREFIX=');
  });

  it('the hook never launches twice, and has no switch to turn it off', () => {
    expect(sessionStart).not.toContain('AGENT_AUTO_STACK');
    // An API that already answers (a resumed session) or a bring-up holding the lock is left alone.
    expect(sessionStart).toContain('/livez');
    expect(sessionStart).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: asserts the shell parameter expansion.
      'source tooling/setup/agent/stack-lock.lib.sh && stack_lock_holder "${AGENT_STACK_DIR:-/tmp/agent-stack}"',
    );
  });

  it('session start runs on startup and resume only, with the slow probes in the background', () => {
    const manifest = JSON.parse(readFileSync('agent-os/hooks/hooks.json', 'utf8')) as {
      hooks: Array<{ id: string; claude?: { matcher?: string } }>;
    };
    // A resumed cloud session can be a new container (deps, stack); clear and compact cannot.
    expect(manifest.hooks.find((hook) => hook.id === 'be-session-start')?.claude?.matcher).toBe(
      'startup|resume',
    );
    // Both probes are this script again with `--probe <name>`, detached and not waited for.
    expect(sessionStart).toContain('spawnSync("pnpm", ["agent-os:check"]');
    expect(sessionStart).toContain(
      'const PROBES = { "agent-os-check": probeAgentOsCheck, "tool-pins": probeToolPins };',
    );
    expect(sessionStart.match(/startProbe\("[a-z-]+"\)/g)).toHaveLength(2);
    expect(sessionStart).toContain('detached: true,\n      stdio: "ignore",\n    }).unref();');
  });

  it('the banner tells the agent to wait for "live" before database/API work', () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: asserts the literal template in be-session-start.mjs
    expect(sessionStart).toContain('`- Stack: ${stack.line}`');
    expect(sessionStart).toContain('wait until pnpm dev:stack:status says live');
  });

  it('the bring-up launches before the Docker check, and then starts the daemon itself', () => {
    // A bring-up starts the daemon at its step 9, so the hook does not hold the session for it.
    expect(sessionStart.indexOf('const stack = await stackStatus();')).toBeGreaterThan(-1);
    expect(sessionStart.indexOf('const stack = await stackStatus();')).toBeLessThan(
      sessionStart.indexOf('const docker = dockerStatus('),
    );
    expect(sessionStart).toContain('dockerStatus({ bringUpStartsIt: stack.bringUp })');
    expect(sessionStart).toContain(
      'if (bringUpStartsIt) return "starting (bootstrap.sh starts it)";',
    );
    expect(bootstrap).toContain('ensure-docker-daemon.sh" >&2 || die');
  });

  it('the default bootstrap is the live stack; --install-only is the only other mode', () => {
    expect(bootstrap).toContain('--install-only) install_only=1 ;;');
    expect(bootstrap).not.toContain('--live)');
    expect(bootstrap).toContain(`[ "\${install_only}" = 1 ] && live=0`);
    expect(bootstrap).toContain('pnpm db:seed:full');
  });

  it('the API and the worker are started in their own sessions and left running', () => {
    expect(bootstrap).toContain('start_detached api pnpm dev');
    expect(bootstrap).toContain('start_detached worker pnpm dev:worker');
    expect(bootstrap).toContain('setsid nohup "$@"');
    // The worker is health-checked on its own port with the same script as the API.
    expect(bootstrap).toContain(`HEALTHCHECK_URL="\${worker_url}" bash`);
    expect(bootstrap).not.toContain('KEEP_APP');
  });

  it('the API and the worker start before the seed, and "live" still waits for all three', () => {
    const apiStart = bootstrap.indexOf('start_detached api pnpm dev');
    const workerStart = bootstrap.indexOf('start_detached worker pnpm dev:worker');
    const seed = bootstrap.indexOf('pnpm db:seed:full >&2');
    expect(apiStart).toBeGreaterThan(bootstrap.indexOf('pnpm db:migrate >&2'));
    expect(apiStart).toBeLessThan(seed);
    expect(workerStart).toBeLessThan(seed);
    expect(seed).toBeLessThan(bootstrap.indexOf(`if ! bash "\${AGENT_DIR}/healthcheck.sh"; then`));
    expect(seed).toBeLessThan(bootstrap.indexOf('record_status "live'));
  });

  it('a live run after an install with the same inputs skips the installs', () => {
    expect(bootstrap).toContain('install_stamp_file="node_modules/.agent-install-stamp"');
    expect(bootstrap).toContain(`install_stamp > "\${install_stamp_file}"`);
    expect(bootstrap).toContain(
      `if [ "\${reset_database}" = 0 ] && [ "\${installs_cached}" = 0 ]; then`,
    );
    expect(bootstrap).not.toContain('AGENT_REINSTALL');
  });

  it('one bring-up at a time, and each step is recorded as it runs', () => {
    expect(bootstrap).toContain(`mkdir "\${STACK_DIR}/lock"`);
    expect(bootstrap).toContain(`stack_lock_holder "\${STACK_DIR}"`);
    expect(bootstrap).toContain(`record_status "running \${*}"`);
    expect(bootstrap).toContain(`record_status "failed — \${*}"`);
  });

  it('SonarQube starts in the background once the stack is live, never beside a bring-up', () => {
    const live = bootstrap.indexOf(
      `record_status "live — API \${api_url} · worker \${worker_url}"`,
    );
    expect(live).toBeGreaterThan(-1);
    expect(bootstrap.indexOf('start_detached sonarqube-backend bash')).toBeGreaterThan(live);
    // clinozy-fe's session-start hook launches the same script at the moment this repository's
    // hook launches bootstrap.sh, which takes the lock a moment later: the first lock check
    // waits out a settle window, so it cannot miss a bring-up that is just starting.
    const starter = readFileSync('tooling/setup/agent/start-sonarqube.sh', 'utf8');
    expect(starter).toContain('settle_seconds=30');
    expect(starter).toContain(
      `while [ "\${waited}" -lt "\${settle_seconds}" ] || [ -d "\${lock_directory}" ] || ! docker info`,
    );
  });

  it('status and stop are one command each', () => {
    expect(packageScripts['dev:stack:status']).toBe('bash tooling/setup/agent/stack.sh status');
    expect(packageScripts['dev:stack:stop']).toBe('bash tooling/setup/agent/stack.sh stop');
    expect(stack).toContain('show_status');
    expect(stack).toContain('stop_stack');
  });
});

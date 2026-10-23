import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PROJECT_SLUG } from '@/shared/constants/project-identity.constants.js';

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
    expect(sessionStart).toContain('run pnpm dev:stack:wait: it returns once live');
  });

  it('the bring-up launches before the Docker check, and starts the daemon in its first second', () => {
    // A bring-up starts the daemon itself, so the hook does not hold the session for it.
    expect(sessionStart.indexOf('const stack = await stackStatus();')).toBeGreaterThan(-1);
    expect(sessionStart.indexOf('const stack = await stackStatus();')).toBeLessThan(
      sessionStart.indexOf('const docker = dockerStatus('),
    );
    expect(sessionStart).toContain('dockerStatus({ bringUpStartsIt: stack.bringUp })');
    expect(sessionStart).toContain(
      'if (bringUpStartsIt) return "starting (bootstrap.sh starts it)";',
    );
    // In the background, before step 1, so its start-up overlaps the installs; only a daemon that
    // does not answer is started, and the steps that touch Docker wait for that start first.
    const backgroundStart = bootstrap.indexOf(
      `bash "\${AGENT_DIR}/ensure-docker-daemon.sh" >"\${STACK_DIR}/docker-start.log" 2>&1 &`,
    );
    expect(backgroundStart).toBeGreaterThan(-1);
    expect(backgroundStart).toBeLessThan(bootstrap.indexOf(`step "[1/\${TOTAL}] Node runtime"`));
    expect(bootstrap).toContain(
      'if command -v docker >/dev/null 2>&1 && ! docker info >/dev/null 2>&1; then',
    );
    const postgres = bootstrap.slice(bootstrap.indexOf('start_postgres_and_redis() {'));
    expect(postgres.indexOf('await_docker_start')).toBeLessThan(postgres.indexOf('compose:up'));
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

  it('an API or worker that answers but is not ready is restarted, never joined by a second', () => {
    // One left from before Postgres or Redis restarted answered /livez with /readyz at 503; a
    // second process failed on the taken port while the health checks kept reaching the first.
    expect(bootstrap).toContain(
      'elif [ "$(http_status "$1/livez")" = 200 ]; then\n    echo unready',
    );
    const restart = bootstrap.indexOf(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: asserts the literal shell test in bootstrap.sh
      'if [ "${api_state}" = unready ] || [ "${worker_state}" = unready ]; then',
    );
    expect(restart).toBeGreaterThan(-1);
    expect(restart).toBeLessThan(bootstrap.indexOf('start_detached api pnpm dev'));
    expect(bootstrap).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: asserts the literal shell test in bootstrap.sh
      '[ "${api_state}" = down ] || die "something still answers on ${api_url}',
    );
    // stack.sh stop keeps a running bring-up's status line, so dev:stack:wait never reads "stopped".
    expect(stack).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: asserts the literal shell test in stack.sh
      'if [ -d "${STACK_DIR}" ] && ! stack_lock_holder "${STACK_DIR}" >/dev/null; then',
    );
  });

  it('"live" comes after the demo user signs in', () => {
    const signIn = bootstrap.indexOf(`node "\${AGENT_DIR}/verify-sign-in.mjs" "\${api_url}"`);
    expect(signIn).toBeGreaterThan(
      bootstrap.indexOf(
        `HEALTHCHECK_URL="\${worker_url}" bash "\${AGENT_DIR}/healthcheck.sh"; then`,
      ),
    );
    expect(signIn).toBeLessThan(bootstrap.indexOf('record_status "live'));
    // Exit 3 is a skip (the stack cannot be signed in to from a script); anything else fails it.
    // biome-ignore lint/suspicious/noTemplateCurlyInString: asserts the literal ${TOTAL} in bootstrap.sh
    expect(bootstrap).toContain('3) skip "[10/${TOTAL}] sign-in check skipped');
    expect(bootstrap).toContain('*) die "sign-in check failed');
  });

  it('each install runs only when its own inputs changed', () => {
    // One stamp over every script in tooling/setup/agent re-ran every install (pnpm install
    // alone 34 s) whenever any of them changed; each step now hashes only what it depends on.
    expect(bootstrap).toContain('readonly STAMP_DIR="node_modules/.agent-stamps"');
    expect(bootstrap).toContain(`stamp_matches dependencies "\${dependency_stamp}"`);
    expect(bootstrap).toContain(`stamp_matches docker "\${docker_stamp}"`);
    const dependencies = bootstrap.slice(
      bootstrap.indexOf('dependency_inputs() {'),
      bootstrap.indexOf('docker_inputs() {'),
    );
    expect(dependencies).toContain('pnpm-lock.yaml');
    expect(dependencies).not.toContain('AGENT_DIR');
    expect(bootstrap).not.toContain('.agent-install-stamp');
    expect(bootstrap).not.toContain('AGENT_REINSTALL');
    // The agent's own tools keep their own stamp, written only once their check passes.
    const tools = readFileSync('tooling/setup/agent/install-agent-tools.sh', 'utf8');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: asserts the literal ${STAMP_DIR} in install-agent-tools.sh
    expect(tools).toContain('readonly STAMP_FILE="${STAMP_DIR}/agent-tools"');
    expect(tools.indexOf('if pnpm tool:agent-tools --smoke --outdated; then')).toBeLessThan(
      tools.indexOf(`printf '%s\\n' "\${stamp}" > "\${STAMP_FILE}"`),
    );
  });

  it('the agent tools run after "live", in the background, never before it', () => {
    const live = bootstrap.indexOf('record_status "live');
    expect(
      bootstrap.indexOf(`start_detached agent-tools bash "\${AGENT_DIR}/install-agent-tools.sh"`),
    ).toBeGreaterThan(live);
    const beforeLive = bootstrap.slice(0, live);
    expect(beforeLive).not.toContain('install-codegraph.sh');
    expect(beforeLive).not.toContain('tool:agent-tools');
  });

  it('the Setup script leaves a database that finished its first-time setup, stopped cleanly', () => {
    const installOnly = bootstrap.slice(
      bootstrap.indexOf('# 4) The agent'),
      bootstrap.indexOf('# 4) Environment files'),
    );
    expect(installOnly).toContain('if prime_database; then');
    expect(installOnly).toContain('docker compose stop');
    expect(installOnly).toContain('exit 0');
    expect(bootstrap).toContain(
      'prime_database() {\n  start_postgres_and_redis || return 1\n  pnpm db:migrate >&2\n}',
    );
  });

  it('step 5 rebuilds a Postgres volume cut short in its setup, and only one that holds nothing', () => {
    const ensure = readFileSync('tooling/setup/agent/ensure-postgres-volume.sh', 'utf8');
    const postgres = bootstrap.slice(bootstrap.indexOf('start_postgres_and_redis() {'));
    // biome-ignore lint/suspicious/noTemplateCurlyInString: asserts the literal ${AGENT_DIR} in bootstrap.sh
    expect(postgres).toContain('bash "${AGENT_DIR}/ensure-postgres-volume.sh"');
    // Databases are counted from the directories on the volume (ids from FirstNormalObjectId),
    // so the check works on a catalog that cannot be read.
    expect(ensure).toContain('readonly FIRST_USER_OBJECT_ID=16384');
    expect(ensure).toContain("-c 'ls -1 /data/base 2>/dev/null; echo listed'");
    // The volume is removed in one place, reached only after the count came back zero.
    expect(ensure.match(/docker volume rm /g)).toHaveLength(2);
    expect(ensure).toContain(
      'log "repair by hand: docker compose rm -s -f postgres && docker volume rm',
    );
    // biome-ignore lint/suspicious/noTemplateCurlyInString: asserts the literal ${user_databases} in the script
    const zeroCheck = ensure.indexOf('if [ "${user_databases}" != 0 ]; then');
    expect(zeroCheck).toBeGreaterThan(-1);
    expect(zeroCheck).toBeLessThan(ensure.indexOf('if rebuild "first-time setup cut short'));
    // biome-ignore lint/suspicious/noTemplateCurlyInString: asserts the literal ${user_databases} in the script
    expect(ensure.indexOf('if [ -z "${user_databases}" ]; then')).toBeLessThan(zeroCheck);
    // Readiness is probed over TCP: the image's first-time setup runs a socket-only server.
    expect(readFileSync('tooling/dev/wait-for-local-postgres.sh', 'utf8')).toContain(
      'pg_isready -h 127.0.0.1 -U clinozy -d clinozy',
    );
  });

  it('one bring-up at a time, and each step is recorded as it runs, stamped with its boot', () => {
    expect(bootstrap).toContain(`mkdir "\${STACK_DIR}/lock"`);
    expect(bootstrap).toContain(`stack_lock_holder "\${STACK_DIR}"`);
    expect(bootstrap).toContain(`record_status "running \${*}"`);
    expect(bootstrap).toContain(`record_status "failed — \${*}"`);
    expect(bootstrap).toContain(`stack_status_write "\${STACK_DIR}" "$*"`);
    const lockLibrary = readFileSync('tooling/setup/agent/stack-lock.lib.sh', 'utf8');
    expect(lockLibrary).toContain('stack_boot_id > "$1/status.boot_id"');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: asserts the literal ${boot} in the library
    expect(lockLibrary).toContain('[ "${boot}" = "$(stack_boot_id)" ] || return 1');
  });

  it('SonarQube starts in the background once the stack is live, never beside a bring-up', () => {
    const live = bootstrap.indexOf(
      `record_status "live — API \${api_url} · worker \${worker_url}"`,
    );
    expect(live).toBeGreaterThan(-1);
    expect(bootstrap.indexOf('start_detached sonarqube-backend bash')).toBeGreaterThan(live);
    // clinozy-fe's bootstrap.sh launches the same script, and the two repositories' bring-ups
    // start at the same moment: the first lock check waits out a settle window, so it cannot miss
    // this repository's bring-up while it is just starting.
    const starter = readFileSync('tooling/setup/agent/start-sonarqube.sh', 'utf8');
    expect(starter).toContain('settle_seconds=30');
    expect(starter).toContain(
      `while [ "\${waited}" -lt "\${settle_seconds}" ] || [ -d "\${lock_directory}" ] || ! docker info`,
    );
  });

  it('every installer runs from bootstrap.sh, directly or through install-agent-tools.sh', () => {
    // bootstrap.sh is the one entry point, in the Setup script and in a session alike: an
    // installer that neither reaches would only ever run by hand. clinozy-fe pins the same.
    const directory = 'tooling/setup/agent';
    const reached = bootstrap + readFileSync(`${directory}/install-agent-tools.sh`, 'utf8');
    const installers = readdirSync(directory).filter((file) => /^install-.+\.sh$/.test(file));
    expect(installers).toContain('install-semgrep.sh');
    for (const installer of installers) {
      expect(reached, installer).toContain(`"\${AGENT_DIR}/${installer}"`);
    }
  });

  it("the cached install calls bootstrap.sh --install-only itself, as clinozy-fe's does", () => {
    // One entry point, at the same path in both repositories: Cursor's install runs the same line
    // as the environment's Setup script, and no wrapper stands in front of it.
    const environment = JSON.parse(
      readFileSync('agent-os/cloud-environment/environment.json', 'utf8'),
    ) as { install: string };
    expect(environment.install).toBe('bash tooling/setup/agent/bootstrap.sh --install-only');
    // The documented Setup script for a session that holds both repositories.
    const guide = readFileSync('docs/integrations/claude-code-web-environment.md', 'utf8');
    expect(guide).toContain(
      `bash /home/user/${PROJECT_SLUG}/tooling/setup/agent/bootstrap.sh --install-only\n` +
        'bash /home/user/clinozy-fe/tooling/setup/agent/bootstrap.sh --install-only\n',
    );
    expect(guide).not.toContain('cloud-environment/install.sh');
  });

  it('wait, status, verify, timeline and stop are one command each', () => {
    expect(packageScripts['dev:stack:wait']).toBe('bash tooling/setup/agent/stack.sh wait');
    expect(packageScripts['dev:stack:status']).toBe('bash tooling/setup/agent/stack.sh status');
    expect(packageScripts['dev:stack:verify']).toBe('bash tooling/setup/agent/stack.sh verify');
    expect(packageScripts['dev:stack:timeline']).toBe('bash tooling/setup/agent/stack.sh timeline');
    expect(packageScripts['dev:stack:stop']).toBe('bash tooling/setup/agent/stack.sh stop');
    expect(stack).toContain('wait) wait_for_live ;;');
    expect(stack).toContain('show_status');
    expect(stack).toContain('verify) verify_stack ;;');
    expect(stack).toContain('timeline) show_timeline ;;');
    expect(stack).toContain('stop_stack');
  });

  it('every step, outcome and launch goes to the timeline, the Setup script with the cached environment', () => {
    // The shell lines as bootstrap.sh writes them, `${…}` expansions included.
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a shell parameter expansion, not a template.
    const stepLine = 'record_status "running ${*}"; timeline "▶ $*"; }';
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a shell parameter expansion, not a template.
    const launchLine = 'timeline "  started ${name} (pid $!, log ${STACK_DIR}/${name}.log)"';
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a shell parameter expansion, not a template.
    const lockLine = 'stack_lock_write "${STACK_DIR}"';
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a shell parameter expansion, not a template.
    const timelineStart = 'stack_timeline_start "${TIMELINE_FILE}"';
    expect(bootstrap).toContain(stepLine);
    expect(bootstrap).toContain('ok()   { echo "✓ $*"; timeline "✓ $*"; }');
    expect(bootstrap).toContain('skip() { echo "• $*"; timeline "• $*"; }');
    expect(bootstrap).toContain('timeline "✗ $*"; exit 1; }');
    expect(bootstrap).toContain(launchLine);
    // The live run's timeline starts only once it holds the lock: a second run that finds the lock
    // taken exits without wiping the record of the one that holds it.
    const lockWritten = bootstrap.indexOf(lockLine);
    expect(lockWritten).toBeGreaterThan(-1);
    expect(bootstrap.indexOf(timelineStart, lockWritten)).toBeGreaterThan(lockWritten);
    // The Setup script's record sits beside the cached environment, one file per repository.
    expect(bootstrap).toContain(
      'TIMELINE_FILE="$(stack_setup_timeline_directory)/setup-timeline-$(basename "$(pwd)")"',
    );
  });
});

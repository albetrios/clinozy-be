import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sessionStart = readFileSync('agent-os/hooks/be-session-start.sh', 'utf8');
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
    expect(sessionStart).toContain(`if [ "\${CLAUDE_CODE_REMOTE:-}" = "true" ]; then`);
    expect(sessionStart).toContain(
      `setsid nohup bash tooling/setup/agent/bootstrap.sh >"\${stack_directory}/bootstrap.log"`,
    );
    expect(sessionStart).toContain('disown');
  });

  it('a web session with no pinned Node on disk installs it before the dependency install', () => {
    const installNodeCall = sessionStart.indexOf('bash tooling/setup/agent/install-node.sh >&2');
    expect(installNodeCall).toBeGreaterThan(-1);
    expect(installNodeCall).toBeLessThan(sessionStart.indexOf('pnpm install --prefer-offline'));
    // The installer elevates itself, so the hook and bootstrap.sh call it the same way.
    expect(installNode).toContain('sudo -n env NODE_INSTALL_PREFIX=');
    expect(bootstrap).not.toContain('sudo -n env NODE_INSTALL_PREFIX=');
  });

  it('the hook never launches twice, and has no switch to turn it off', () => {
    expect(sessionStart).not.toContain('AGENT_AUTO_STACK');
    // An API that already answers (a resumed session) or a bring-up holding the lock is left alone.
    expect(sessionStart).toContain('/livez');
    expect(sessionStart).toContain(`stack_lock_holder "\${stack_directory}"`);
  });

  it('session start runs on startup and resume only, with the slow probes in the background', () => {
    const manifest = JSON.parse(readFileSync('agent-os/hooks/hooks.json', 'utf8')) as {
      hooks: Array<{ id: string; claude?: { matcher?: string } }>;
    };
    // A resumed cloud session can be a new container (deps, stack); clear and compact cannot.
    expect(manifest.hooks.find((hook) => hook.id === 'be-session-start')?.claude?.matcher).toBe(
      'startup|resume',
    );
    expect(sessionStart).toContain(`pnpm agent-os:check >"\${probe_directory}/agent-os-check.log"`);
    expect(sessionStart.match(/\) <\/dev\/null >\/dev\/null 2>&1 &/g)).toHaveLength(2);
  });

  it('the banner tells the agent to wait for "live" before database/API work', () => {
    expect(sessionStart).toContain('- Stack: %s');
    expect(sessionStart).toContain('wait until pnpm dev:stack:status says live');
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

  it('status and stop are one command each', () => {
    expect(packageScripts['dev:stack:status']).toBe('bash tooling/setup/agent/stack.sh status');
    expect(packageScripts['dev:stack:stop']).toBe('bash tooling/setup/agent/stack.sh stop');
    expect(stack).toContain('show_status');
    expect(stack).toContain('stop_stack');
  });
});

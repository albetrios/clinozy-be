import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sessionStart = readFileSync('agent-os/hooks/session-start.sh', 'utf8');
const bootstrap = readFileSync('tooling/setup/agent/bootstrap.sh', 'utf8');
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

  it('the hook can be switched off per environment and never launches twice', () => {
    expect(sessionStart).toContain(`"\${AGENT_AUTO_STACK:-1}" = "0"`);
    // An API that already answers (a resumed session) or a bring-up holding the lock is left alone.
    expect(sessionStart).toContain('/livez');
    expect(sessionStart).toContain(`kill -0 "\${stack_lock_pid}"`);
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

  it('one bring-up at a time, and each step is recorded as it runs', () => {
    expect(bootstrap).toContain(`mkdir "\${STACK_DIR}/lock"`);
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

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ensureDockerDaemonScript = readFileSync(
  'tooling/setup/agent/ensure-docker-daemon.sh',
  'utf8',
);
const bootstrapScript = readFileSync('tooling/setup/agent/bootstrap.sh', 'utf8');
const stackScript = readFileSync('tooling/setup/agent/stack.sh', 'utf8');
const cloudAgentOverride = readFileSync(
  'tooling/setup/agent/docker-compose.cloud-agent.yml',
  'utf8',
);

describe('agent Docker daemon setup scripts', () => {
  it('falls back to restricted dockerd flags when cloud iptables setup is denied', () => {
    expect(ensureDockerDaemonScript).toContain('--iptables=false');
    expect(ensureDockerDaemonScript).toContain('--ip-masq=false');
    expect(ensureDockerDaemonScript).toContain('--bridge=none');
    expect(ensureDockerDaemonScript).toContain('DOCKERD_AGENT_MODE_FILE');
  });

  it('falls back to vfs storage when cloud overlay layer extraction is denied', () => {
    expect(ensureDockerDaemonScript).toContain('--storage-driver=vfs');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: asserts the literal ${VFS_DATA_ROOT} shell variable emitted in the generated dockerd script
    expect(ensureDockerDaemonScript).toContain('--data-root="${VFS_DATA_ROOT}"');
    expect(ensureDockerDaemonScript).toContain('DOCKERD_AGENT_VFS_DATA_ROOT');
    expect(ensureDockerDaemonScript).toContain('restricted-vfs');
  });

  it('uses the shared cloud-agent host-network compose override in restricted Docker mode', () => {
    expect(bootstrapScript).toContain('docker-compose.cloud-agent.yml');
    expect(bootstrapScript).toContain('DOCKERD_AGENT_MODE_FILE');
    expect(bootstrapScript).toContain('restricted*');
    // Compose v5 validates the override: `cgroupns_mode` failed it, so every restricted
    // bring-up stopped at step 9. The Compose spec key is `cgroup`.
    expect(cloudAgentOverride).toContain('cgroup: host');
    expect(cloudAgentOverride).not.toContain('cgroupns_mode');
  });

  it('never starts a second dockerd beside one that is still starting or stopping', () => {
    // A dockerd still alive has not failed: a second one stops on its pid file, and the first,
    // answering later, was recorded as the restricted fallback.
    expect(ensureDockerDaemonScript).toContain('pgrep -x dockerd');
    expect(ensureDockerDaemonScript).toContain(
      'if ! docker info >/dev/null 2>&1 && command -v dockerd >/dev/null 2>&1 && ! dockerd_running; then',
    );
    expect(ensureDockerDaemonScript).toContain(
      'if command -v dockerd >/dev/null 2>&1 && ! dockerd_running; then\n  start_restricted_dockerd',
    );
    expect(ensureDockerDaemonScript).toContain(
      'log "Docker daemon is reachable after a slow start."',
    );
    // Stopping waits for the process to exit, not for the API to stop answering.
    const stop = ensureDockerDaemonScript.slice(
      ensureDockerDaemonScript.indexOf('stop_dockerd() {'),
      ensureDockerDaemonScript.indexOf('probe_docker_layer_extract() {'),
    );
    expect(stop).toContain('dockerd_running || return 0');
    expect(stop).not.toContain('docker info');
  });

  it('waits on a service manager only when it started a dockerd', () => {
    // `service docker start` can return with no daemon behind it, and systemctl can start
    // nothing without systemd: a 30 s wait after each cost a cold start about 60 s.
    expect(ensureDockerDaemonScript).toContain('dockerd_appeared() {');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: asserts the literal shell default in ensure-docker-daemon.sh
    expect(ensureDockerDaemonScript).toContain('"${DOCKERD_APPEAR_SECONDS:-5}"');
    expect(ensureDockerDaemonScript).toContain(
      'if dockerd_appeared; then\n    wait_for_docker || true\n  else\n    log "service docker start left no dockerd running; moving on."',
    );
    expect(ensureDockerDaemonScript).toContain('[ -d /run/systemd/system ]');
    // Between the service attempts and the direct start, nothing waits on a daemon that no
    // process is starting.
    const serviceAttempts = ensureDockerDaemonScript.slice(
      ensureDockerDaemonScript.indexOf(
        'log "Docker daemon is not reachable; attempting to start it."',
      ),
      ensureDockerDaemonScript.indexOf('  start_dockerd "directly"'),
    );
    expect(serviceAttempts.match(/wait_for_docker/g)).toHaveLength(2);
    expect(serviceAttempts.match(/dockerd_appeared/g)).toHaveLength(2);
  });

  it('clears pid files left from before a pause, so a reused pid never blocks the start', () => {
    // A resumed container keeps /var/run but no processes: dockerd's and containerd's pid files
    // named pids a kernel worker and a shell held after the reboot, and dockerd refused to start.
    expect(ensureDockerDaemonScript).toContain('clear_stale_pid_file /var/run/docker.pid dockerd');
    expect(ensureDockerDaemonScript).toContain(
      'clear_stale_pid_file /var/run/docker/containerd/containerd.pid containerd',
    );
    // Stale means the pid does not run the program the file belongs to.
    expect(ensureDockerDaemonScript).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: asserts the literal shell test in ensure-docker-daemon.sh
      '[ "$(ps -p "${pid}" -o comm= 2>/dev/null)" = "$2" ]',
    );
    const start = ensureDockerDaemonScript.slice(
      ensureDockerDaemonScript.indexOf('start_dockerd() {'),
      ensureDockerDaemonScript.indexOf('stop_dockerd() {'),
    );
    expect(start.indexOf('clear_stale_pid_files')).toBeGreaterThan(-1);
    expect(start.indexOf('clear_stale_pid_files')).toBeLessThan(start.indexOf('setsid'));
    // The service script starts dockerd with the same pid file, so it is cleared before that too.
    expect(
      ensureDockerDaemonScript.indexOf('dockerd_running || clear_stale_pid_files'),
    ).toBeLessThan(ensureDockerDaemonScript.indexOf('service docker start >/dev/null'));
  });

  it('stops only the process trees the bring-up started, without Linux-only /proc', () => {
    // A /proc walk never ran on macOS (the app was left up) and, on Linux, matched every
    // `tsx watch` on the machine. `ps` exists on both; each tree hangs off the PID the
    // bring-up recorded for the API / worker (`pnpm dev:stack:stop`).
    expect(bootstrapScript).toContain(`echo $! > "\${STACK_DIR}/\${name}.pid"`);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: asserts the literal ${pid} shell variable in stack.sh
    expect(stackScript).toContain('stop_process_tree "${pid}"');
    expect(stackScript).toContain('ps -A -o pid= -o ppid=');
    expect(bootstrapScript).not.toContain('/proc/');
    expect(stackScript).not.toContain('/proc/');
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const installImages = readFileSync('tooling/setup/agent/install-docker-images.sh', 'utf8');
const sonarCompose = readFileSync('docker-compose.sonar.yml', 'utf8');
const sonarGate = readFileSync('tooling/sonar/sonar-gate.ts', 'utf8');

/**
 * Locks in a SonarQube pre-commit gate that a cloud session can always run: the Setup script
 * caches the gate's images, and the gate starts the Docker daemon itself when no hook did.
 */
describe('SonarQube gate in cloud sessions', () => {
  it('the Setup script pre-pulls the images the gate runs', () => {
    expect(installImages).toContain(
      'docker compose -f docker-compose.sonar.yml pull sonarqube scanner',
    );
    // The pulled names must stay the compose file's service names.
    expect(sonarCompose).toMatch(/^ {2}sonarqube:$/m);
    expect(sonarCompose).toMatch(/^ {2}scanner:$/m);
  });

  it('the Elasticsearch index is on tmpfs, clear of a disk that is under 10% free', () => {
    expect(sonarCompose).toContain('- /opt/sonarqube/data/es8:size=2g,uid=1000,gid=0,mode=0770');
    // The database (projects, tokens) stays on the volume.
    expect(sonarCompose).toContain('- sonarqube_data:/opt/sonarqube/data');
  });

  it('the two compose files share a project, and every path that runs them skips the orphan check', () => {
    // A shared project makes each file call the other's containers orphans, and compose's advice
    // (--remove-orphans) would delete Postgres and Redis, or SonarQube.
    const scripts = (
      JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> }
    ).scripts;
    for (const name of ['compose:up', 'compose:down', 'sonar:up', 'sonar:down', 'sonar:reset']) {
      expect(scripts[name], name).toMatch(/^(export )?COMPOSE_IGNORE_ORPHANS=true /);
    }
    expect(readFileSync('tooling/setup/agent/bootstrap.sh', 'utf8')).toContain(
      'export COMPOSE_IGNORE_ORPHANS=true',
    );
    expect(sonarGate).toContain("const COMPOSE_ENVIRONMENT = { COMPOSE_IGNORE_ORPHANS: 'true' };");
    expect(sonarGate).toContain('env: { ...process.env, ...COMPOSE_ENVIRONMENT, ...extraEnv }');
    expect(sonarGate).toContain(
      'env: { ...process.env, ...COMPOSE_ENVIRONMENT, SONAR_TOKEN: token }',
    );
    // Nothing may "fix" the warning the way compose suggests.
    for (const script of Object.values(scripts)) expect(script).not.toContain('--remove-orphans');
  });

  it('the gate starts a stopped Docker daemon before it starts SonarQube', () => {
    expect(sonarGate).toContain("'tooling/setup/agent/ensure-docker-daemon.sh'");
    const daemonStart = sonarGate.indexOf('  ensureDockerDaemon();');
    expect(daemonStart).toBeGreaterThan(-1);
    expect(daemonStart).toBeLessThan(sonarGate.indexOf("dockerCompose(['up', '-d', 'sonarqube'])"));
  });
});

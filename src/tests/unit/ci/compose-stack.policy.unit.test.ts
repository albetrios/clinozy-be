import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The local Docker stack (docker-compose*.yml). H-8: a published port binds the host's loopback
// only — published on every interface, Postgres (a fixed password), Redis (no password) and the
// SonarQube server (admin / admin until the gate changes it) answered anyone on the network. H-12:
// every pulled image is pinned by digest, which, unlike a tag, cannot be re-pointed at other bytes.
// clinozy-fe pins its own compose files the same way (tests/ci/compose-stack.policy.test.ts).

const composeFiles = readdirSync('.').filter((file) =>
  /^(?:docker-)?compose(?:\.[\w-]+)?\.ya?ml$/.test(file),
);

/** The entries of every `ports:` list in `text`, unquoted. */
function publishedPorts(text: string): string[] {
  const ports: string[] = [];
  let listIndent = -1;
  for (const line of text.split('\n')) {
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();
    if (trimmed === 'ports:') {
      listIndent = indent;
      continue;
    }
    if (listIndent < 0 || trimmed === '' || trimmed.startsWith('#')) continue;
    if (indent > listIndent && trimmed.startsWith('- ')) {
      ports.push(trimmed.slice(2).replace(/^['"]|['"]$/g, ''));
      continue;
    }
    listIndent = -1;
  }
  return ports;
}

/**
 * Every `image:` a service pulls. A service with a `build:` names the image it builds locally
 * (Toxiproxy, from tooling/chaos/toxiproxy.Dockerfile), which has no registry digest.
 */
function pulledImages(text: string): string[] {
  const services: Array<{ image?: string; builds: boolean }> = [];
  for (const line of text.split('\n')) {
    if (/^ {2}[\w-]+:\s*$/.test(line)) services.push({ builds: false });
    const service = services.at(-1);
    if (!service) continue;
    const trimmed = line.trim();
    if (/^ {4}build:/.test(line)) service.builds = true;
    if (/^ {4}image:/.test(line)) service.image = trimmed.slice('image:'.length).trim();
  }
  return services.flatMap((service) =>
    service.image !== undefined && !service.builds ? [service.image] : [],
  );
}

/** `text` without its comment lines. */
const withoutComments = (text: string) =>
  text
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');

describe('local Docker stack', () => {
  it('finds the compose files and their ports (parser sanity)', () => {
    expect(composeFiles).toEqual(
      expect.arrayContaining(['docker-compose.yml', 'docker-compose.sonar.yml']),
    );
    expect(publishedPorts(readFileSync('docker-compose.yml', 'utf8')).length).toBeGreaterThan(4);
  });

  it.each(composeFiles)('%s publishes every port on 127.0.0.1 only', (file) => {
    for (const port of publishedPorts(readFileSync(file, 'utf8'))) {
      expect(port, `${file}: ${port}`).toMatch(/^127\.0\.0\.1:/);
    }
  });

  it.each(composeFiles)('%s pins every pulled image by digest', (file) => {
    const found = pulledImages(readFileSync(file, 'utf8'));
    expect(found.length).toBeGreaterThan(0);
    for (const image of found) {
      expect(image, `${file}: ${image}`).toMatch(/^[\w./-]+:[\w.-]+@sha256:[0-9a-f]{64}$/);
    }
  });

  it('the parsers read a list item, a quoted entry, the end of the list and a local build', () => {
    expect(
      publishedPorts(
        '  db:\n    ports:\n      - \'5432:5432\'\n      - "127.0.0.1:1:1"\n    image: x\n',
      ),
    ).toEqual(['5432:5432', '127.0.0.1:1:1']);
    expect(
      pulledImages(
        'services:\n  db:\n    image: postgres:1\n  proxy:\n    build:\n      context: .\n    image: proxy:2\n',
      ),
    ).toEqual(['postgres:1']);
  });

  it('containers reach the loopback-bound servers by service name, never host.docker.internal', () => {
    for (const file of composeFiles) {
      expect(withoutComments(readFileSync(file, 'utf8')), file).not.toContain(
        'host.docker.internal',
      );
    }
    const sonar = withoutComments(readFileSync('docker-compose.sonar.yml', 'utf8'));
    expect(sonar).toContain('SONAR_HOST_URL: http://sonarqube:9000');
    const manualRun = readFileSync('docs/deployment/docker-images.md', 'utf8');
    expect(manualRun).not.toMatch(/-e \w+=\S*host\.docker\.internal/);
  });
});

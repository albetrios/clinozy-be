import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WORKFLOWS = join(process.cwd(), '.github', 'workflows');
const dockerWorkflow = readFileSync(join(WORKFLOWS, 'reusable-docker-build-trivy.yml'), 'utf8');
const postMerge = readFileSync(join(WORKFLOWS, 'post-merge-ci.yml'), 'utf8');
const releaseDeploy = readFileSync(join(WORKFLOWS, 'release-deploy.yml'), 'utf8');

/** The `- name:` blocks of a workflow's steps, by name. */
function steps(text: string): Map<string, string> {
  const blocks = text.split(/^ {6}- name: /m).slice(1);
  return new Map(blocks.map((block) => [block.slice(0, block.indexOf('\n')), block]));
}

const dockerSteps = steps(dockerWorkflow);
const stepNames = [...dockerSteps.keys()];

/**
 * Pins the API smoke in the post-merge Docker job (task 15): after the built API image boots and
 * answers /readyz, the full demo seed runs and `pnpm test:api-smoke` signs in as the seeded demo
 * account against that container — post-merge only, and the container is always stopped.
 */
describe('post-merge API smoke against the built image', () => {
  it('seeds and smokes right after the /readyz boot, then always stops the container', () => {
    const boot = stepNames.indexOf('Boot API container and verify /readyz');
    expect(boot).toBeGreaterThan(0);
    expect(stepNames.slice(boot, boot + 4)).toEqual([
      'Boot API container and verify /readyz',
      'Seed the full demo data for the API smoke',
      'API smoke against the container',
      'Stop the API container',
    ]);
    expect(dockerSteps.get('Seed the full demo data for the API smoke')).toContain(
      'run: pnpm db:seed:full',
    );
    expect(dockerSteps.get('API smoke against the container')).toContain(
      'run: pnpm test:api-smoke',
    );
    expect(dockerSteps.get('Stop the API container')).toContain('if: always()');
  });

  it('boots the container with the email fixtures the send-code probe needs', () => {
    // Without an email provider /auth/email/send-code answers 503; no worker runs, so the mail
    // only lands in the outbox (the k6 workflow's fixtures).
    const boot = dockerSteps.get('Boot API container and verify /readyz') ?? '';
    expect(boot).toContain('-e RESEND_API_KEY=re_test_contract_fixture_key');
    expect(boot).toContain('-e EMAIL_FROM_ADDRESS=noreply@example.com');
  });

  it('signs the smoke in as the account the seed creates', () => {
    const account = (step: string): string[] =>
      (dockerSteps.get(step) ?? '').match(/DEMO_(?:EMAIL|PASSWORD): .+/g) ?? [];
    const seeded = account('Seed the full demo data for the API smoke');
    expect(seeded).toHaveLength(2);
    expect(account('API smoke against the container')).toEqual(seeded);
  });

  it('runs on post-merge only, with the dependencies the checkout needs', () => {
    for (const step of [
      'Seed the full demo data for the API smoke',
      'API smoke against the container',
    ]) {
      expect(dockerSteps.get(step)).toContain('if: inputs.api_smoke');
    }
    expect(dockerSteps.get('Setup Node and pnpm')).toMatch(
      /install: \$\{\{ inputs\.api_smoke && 'true' \|\| 'false' \}\}/,
    );
    expect(postMerge).toMatch(
      /uses: \.\/\.github\/workflows\/reusable-docker-build-trivy\.yml[\s\S]*?api_smoke: true/,
    );
    expect(releaseDeploy).not.toContain('api_smoke');
  });
});

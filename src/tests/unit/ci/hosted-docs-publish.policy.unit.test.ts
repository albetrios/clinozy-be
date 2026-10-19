import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const UPLOAD_ACTION = read('.github/actions/upload-api-docs/action.yml');
const PUBLISH_WORKFLOW = read('.github/workflows/reusable-openapi-postman-publish.yml');
const DEPLOY_WORKFLOW = read('.github/workflows/reusable-railway-deploy.yml');

/**
 * Locks in the hosted docs uploads (Postman + Scalar Registry): one composite action, used by the
 * development docs workflow and by the production deploy job, best-effort and gated only on an
 * input — never on a step's own secret env, which GitHub fills only after evaluating `if:`.
 */
describe('hosted docs publish policy (Postman + Scalar Registry)', () => {
  it('gates uploads on the publish_hosted_docs input only, never a step-level secret env', () => {
    for (const text of [PUBLISH_WORKFLOW, UPLOAD_ACTION]) {
      expect(text).not.toMatch(/if:\s*inputs\.publish_hosted_docs\s*&&\s*env\./);
      expect(text).not.toContain("env.SCALAR_API_KEY != ''");
      expect(text).not.toContain("env.POSTMAN_API_KEY != ''");
    }
    const use = PUBLISH_WORKFLOW.slice(PUBLISH_WORKFLOW.indexOf('- name: Upload API docs'));
    expect(use).toContain('if: inputs.publish_hosted_docs');
    expect(use).toContain('uses: ./.github/actions/upload-api-docs');
  });

  it('runs both the Postman and Scalar Registry upload scripts as best-effort steps', () => {
    expect(UPLOAD_ACTION).toContain('run: pnpm docs:upload\n');
    const scalarStep =
      UPLOAD_ACTION.match(
        /- name: Upload OpenAPI to Scalar Registry\n([\s\S]*?)run: pnpm docs:upload:scalar/,
      )?.[1] ?? '';
    expect(scalarStep).not.toBe('');
    // best-effort: an external registry hiccup must never block the deploy.
    expect(scalarStep).toContain('continue-on-error: true');
    expect(UPLOAD_ACTION.match(/continue-on-error: true/g)).toHaveLength(2);
    // the Scalar API key comes in from the GitHub Environment secret; namespace/slug are
    // non-sensitive registry identifiers, so callers pass Variables, not Secrets.
    for (const caller of [PUBLISH_WORKFLOW, DEPLOY_WORKFLOW]) {
      expect(caller).toContain(`scalar-api-key: \${{ secrets.SCALAR_API_KEY }}`);
      expect(caller).toContain(`scalar-namespace: \${{ vars.SCALAR_NAMESPACE }}`);
      expect(caller).not.toContain('secrets.SCALAR_NAMESPACE');
    }
  });

  it('production docs go out inside the approved deploy job, after it is live', () => {
    const release = read('.github/workflows/release-deploy.yml');
    // Only the deploy names the production environment: every job that does waits for its own
    // approval, so a separate docs job meant a second approval.
    const docsJob = release.slice(
      release.indexOf('\n  docs:\n'),
      release.indexOf('\n  verify-supply-chain:\n'),
    );
    expect(docsJob).not.toMatch(/^ {4}environment:/m);
    expect(docsJob).toContain('uses: ./.github/actions/generate-api-docs');
    expect(release).toContain('api_docs_artifact: api-docs-production');
    expect(release).not.toContain('reusable-openapi-postman-publish.yml');
    const download = DEPLOY_WORKFLOW.slice(
      DEPLOY_WORKFLOW.indexOf('- name: Download the API docs'),
    );
    expect(download).toMatch(
      /^- name: Download the API docs[^\n]*\n\s+if: success\(\) && inputs\.api_docs_artifact != ''/,
    );
    expect(DEPLOY_WORKFLOW.indexOf('- name: Deploy API and worker to Railway')).toBeLessThan(
      DEPLOY_WORKFLOW.indexOf('- name: Publish the API docs (the deploy is live)'),
    );
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const deployTool = readFileSync('tooling/setup/railway/deploy-image.ts', 'utf8');
const envValidator = readFileSync('tooling/setup/github/validate-environment-runtime.ts', 'utf8');
const deployWorkflow = readFileSync('.github/workflows/reusable-railway-deploy.yml', 'utf8');

/**
 * Code body only — the file's TSDoc header documents the GraphQL call order and
 * names the Railway CLI commands it deliberately avoids, so asserting against the
 * whole file would match the prose rather than the implementation.
 */
const deployToolCode = deployTool.slice(deployTool.indexOf('import '));

describe('Railway deploy tooling (policy)', () => {
  it('pins the image before creating the deployment', () => {
    // The whole reason this tool exists instead of the Railway CLI: the service
    // must be re-pointed at the freshly built GHCR image (serviceInstanceUpdate)
    // BEFORE a deployment is created from it (serviceInstanceDeployV2). Reversing
    // them deploys the PREVIOUS image while reporting success.
    const updateAt = deployToolCode.indexOf('serviceInstanceUpdate(');
    const deployAt = deployToolCode.indexOf('serviceInstanceDeployV2(');
    expect(updateAt).toBeGreaterThan(-1);
    expect(deployAt).toBeGreaterThan(-1);
    expect(updateAt).toBeLessThan(deployAt);
  });

  it('never falls back to a Railway CLI deploy path', () => {
    // `railway redeploy` re-runs the previous deployment object (old image) and
    // `railway up` uploads runner source for Railway to build (bypasses the
    // Trivy-scanned GHCR image). Neither may creep back in.
    expect(deployToolCode).not.toContain('railway redeploy');
    expect(deployToolCode).not.toContain('railway up');
  });

  it('is repo-owned — the deploy path depends on no external repository', () => {
    // No `<stem>-infra` (the sibling infrastructure repository) anywhere on the deploy path.
    expect(deployTool).not.toMatch(/\b[a-z0-9]+-infra\b/);
    expect(deployWorkflow).not.toMatch(/\b[a-z0-9]+-infra\b/);
    expect(deployWorkflow).not.toContain('pnpm --dir');
    expect(deployWorkflow).toContain('pnpm tool:railway-deploy-image');
  });

  it('CD never uses --skip-wait, so a failed deploy cannot report green', () => {
    // The tool supports --skip-wait for manual diagnostics only: it returns exit 0
    // without polling for terminal status. If CD ever passed it, a CRASHED deploy
    // would pass the workflow.
    expect(deployTool).toContain('--skip-wait');
    expect(deployWorkflow).not.toContain('--skip-wait');
  });

  it('verifies the container boot after SUCCESS instead of trusting Railway terminal status', () => {
    // Railway flips a deployment to SUCCESS when the container STARTS — it runs no
    // HEALTHCHECK and does not wait for the process to boot. A boot-guard failure
    // (connection budget, RLS role, TLS) exits a few seconds later and restart-loops
    // behind a green deploy; production did exactly that for five worker releases
    // (2026-10-13 → 2026-10-17) while the workflow printed "fully live". The tool must
    // therefore watch the deployment's own container logs after SUCCESS, and fail on a
    // crash marker, on the status leaving SUCCESS, or on a missing ready marker.
    expect(deployToolCode).toContain('deploymentLogs(deploymentId: $deploymentId');
    expect(deployToolCode).toContain('verifyDeploymentBoot(');
    expect(deployToolCode).toContain('the container logged a crash marker');
    expect(deployToolCode).toContain('deployment status left SUCCESS');
    expect(deployToolCode).toContain('never logged');
    // Boot verification runs AFTER the terminal-status wait, never instead of it.
    const waitAt = deployToolCode.indexOf('await waitForTerminalStatus(');
    const verifyAt = deployToolCode.indexOf('await verifyDeploymentBoot(');
    expect(waitAt).toBeGreaterThan(-1);
    expect(verifyAt).toBeGreaterThan(waitAt);
  });

  it('a project token that cannot read deployments fails the gate when boot verification is on', () => {
    // Without deployment reads the tool used to warn and return 0, leaving the workflow's
    // probes as the gate — but the worker has no probe the runner can reach. A gate that
    // cannot observe the container must not pass.
    expect(deployToolCode).toContain(
      'boot verification was requested but the project token cannot read deployment status',
    );
  });

  it('CD passes the boot markers for BOTH services, matching the processes’ log lines', () => {
    // The markers are the exact pino `msg` values in src/server.ts and src/worker.ts; if a
    // process renames its ready/failure line the gate would wait the whole window and fail,
    // so the two must move together.
    const serverSource = readFileSync('src/server.ts', 'utf8');
    const workerSource = readFileSync('src/worker.ts', 'utf8');
    expect(serverSource).toContain("'Server listening'");
    expect(serverSource).toContain("'Server failed to start'");
    expect(workerSource).toContain("'Worker started'");
    expect(workerSource).toContain("'Worker failed to start'");
    expect(serverSource).toContain("'uncaughtException'");
    expect(workerSource).toContain("'uncaughtException'");

    expect(deployWorkflow).toContain('--boot-ready-marker "$boot_ready_marker"');
    expect(deployWorkflow).toContain('--boot-crash-marker "$boot_crash_marker"');
    expect(deployWorkflow).toContain('--boot-crash-marker "uncaughtException"');
    expect(deployWorkflow).toContain(
      'deploy_service_from_image "$RAILWAY_SERVICE_ID" "$API_IMAGE" "api" "Server listening" "Server failed to start"',
    );
    expect(deployWorkflow).toContain(
      'deploy_service_from_image "$RAILWAY_WORKER_SERVICE_ID" "$WORKER_IMAGE" "worker" "Worker started" "Worker failed to start"',
    );
    // The retired claim must not come back: SUCCESS does not mean the HEALTHCHECK passed.
    expect(deployWorkflow).not.toContain(
      'Railway only flips to SUCCESS once the in-pod HEALTHCHECK passes',
    );
    expect(deployWorkflow).not.toContain(
      'Railway only\n# reports SUCCESS once the container HEALTHCHECK',
    );
  });

  it('validates the GitHub Environment before deploying anything', () => {
    // A missing schema-required secret must fail the workflow, not crash-loop the
    // deployed container — so the pre-flight has to run BEFORE the deploy step.
    const validateAt = deployWorkflow.indexOf('pnpm validate:github-env-runtime');
    const deployAt = deployWorkflow.indexOf('pnpm tool:railway-deploy-image \\');
    expect(validateAt).toBeGreaterThan(-1);
    expect(deployAt).toBeGreaterThan(-1);
    expect(validateAt).toBeLessThan(deployAt);
  });

  it('the env pre-flight checks schema-required keys and exits with its verdict', () => {
    // Presence alone is not enough: an empty GitHub Environment secret reaches the
    // runner as '' and would satisfy a naive `in process.env` check while failing
    // the app's Zod validation at boot. (The verdict logic itself is covered by
    // src/tests/unit/tooling/validate-environment-runtime.unit.test.ts.)
    expect(envValidator).toContain('envSchemaRequiredKeys');
    expect(envValidator).toContain(".trim() === ''");
    // The CLI must propagate the validation result as the exit code — a deploy job
    // only fails when this process does.
    expect(envValidator).toContain('process.exit(runEnvironmentValidation(');
  });

  it('prepares the database with the reference seed so a fresh environment can provision orgs', () => {
    // Migrations create the schema but never insert the `tenancy.permissions` reference
    // rows that owner-role provisioning FK-references. Without the seed, a fresh
    // environment provisions NO personal/team organization — every provision rolls back on the
    // missing permission FK and the read-path self-heal swallows it to
    // `personal_organization_id: null`. `pnpm db:seed` is the one database step: it migrates,
    // then seeds (the order `src/tests/unit/scripts/db-prepare.unit.test.ts` pins).
    expect(deployWorkflow).toMatch(/run: pnpm db:seed$/m);
    expect(deployWorkflow).not.toMatch(/run: pnpm db:migrate$/m);
  });

  it('declares no dead target_branch input (single-trunk keeps one branch control)', () => {
    // `target_branch` was declared in both trigger blocks and passed as `main` by every
    // caller but never consumed — on manual dispatch it rendered a redundant single-option
    // `[main]` dropdown beside GitHub's native branch selector, which is the one branch
    // control on a single-trunk repo.
    expect(deployWorkflow).not.toContain('target_branch');
  });

  it('selects the environment explicitly (single trunk: environment, never branch)', () => {
    // The explicit github_environment input takes precedence over any branch mapping —
    // callers (post-merge-ci → development, release-deploy → production) choose the
    // environment directly; it is never derived from the branch on a single trunk.
    expect(deployWorkflow).toContain('github_environment:');
    expect(deployWorkflow).toContain('GITHUB_ENVIRONMENT_INPUT');
    // Both environments form the validated allow-list, and no dev-branch case survives.
    expect(deployWorkflow).toContain('development|production');
    expect(deployWorkflow).not.toContain('dev) echo "environment=development"');
  });
});

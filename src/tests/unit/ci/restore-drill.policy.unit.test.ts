import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

describe('restore drill automation policy', () => {
  it('does not ship a manual RTO record workflow or legacy URL fallback', () => {
    expect(existsSync(join(ROOT, '.github/workflows/manual-dr-rto-record.yml'))).toBe(false);

    const workflow = readFileSync(
      join(ROOT, '.github/workflows/scheduled-monthly-restore-rto.yml'),
      'utf8',
    );
    expect(workflow).not.toContain('DATABASE_URL_FOR_MONTHLY_RESTORE_DRILL');
    expect(workflow).not.toContain('recorded_rto_minutes');
  });

  it('uses monthly drill Neon secrets and the GitHub Environment to find its Neon project', () => {
    const workflow = readFileSync(
      join(ROOT, '.github/workflows/scheduled-monthly-restore-rto.yml'),
      'utf8',
    );
    const script = readFileSync(join(ROOT, 'tooling/ci/restore-drill-neon.sh'), 'utf8');

    expect(workflow).toContain('MONTHLY_DATABASE_RESTORE_DRILL_NEON_API_KEY');
    expect(workflow).not.toContain('MONTHLY_DATABASE_RESTORE_DRILL_NEON_PROJECT_ID');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression in the workflow YAML — not a TS template.
    expect(workflow).toContain('environment: ${{ needs.resolve-environment.outputs.environment }}');
    expect(workflow).toContain('tooling/ci/restore-drill-neon.sh create');
    expect(workflow).toContain('tooling/ci/restore-drill-neon.sh delete');

    expect(script).toContain('MONTHLY_DATABASE_RESTORE_DRILL_NEON_API_KEY');
    expect(script).not.toContain('MONTHLY_DATABASE_RESTORE_DRILL_NEON_PROJECT_ID');
    expect(script).toContain('RESTORE_DRILL_NEON_PROJECT_NAME');
    expect(script).toContain('project-identity.env');
    expect(script).toContain('PROJECT_SLUG');
    expect(script).toContain('RESTORE_DRILL_ENVIRONMENT');
    expect(script).not.toContain('RESTORE_DRILL_PARENT_BRANCH_NAME');
    expect(script).not.toContain('NEON_PARENT_BRANCH_ID');
    expect(script).not.toContain('DATABASE_URL_FOR_MONTHLY');
  });

  it("derives every Neon name from the environment — never Neon's defaults", () => {
    // One Neon project per environment (the infrastructure repository's rule): project
    // <slug>-<environment>, branch <environment>, database <slug_with_underscores>_<environment>,
    // and the roles clinozy-infra provisions — <slug_with_underscores>_migrator / _app / _maintenance.
    // Neon's `main` / `neondb` / `neondb_owner` and the project owner exist nowhere.
    const script = readFileSync(join(ROOT, 'tooling/ci/restore-drill-neon.sh'), 'utf8');
    for (const derivation of [
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal shell parameter expansion — not a TS template.
      '-${RESTORE_DRILL_ENVIRONMENT}}',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal shell parameter expansion — not a TS template.
      'NEON_PARENT_BRANCH_NAME="${RESTORE_DRILL_ENVIRONMENT}"',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal shell parameter expansion — not a TS template.
      'NEON_DATABASE_NAME="${NEON_PROJECT_NAME//-/_}"',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal shell parameter expansion — not a TS template.
      'NEON_ROLE_PREFIX="${NEON_DATABASE_NAME%_"${RESTORE_DRILL_ENVIRONMENT//-/_}"}"',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal shell parameter expansion — not a TS template.
      'NEON_MIGRATION_ROLE_NAME="${NEON_ROLE_PREFIX}_migrator"',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal shell parameter expansion — not a TS template.
      'NEON_APPLICATION_ROLE_NAME="${NEON_ROLE_PREFIX}_app"',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal shell parameter expansion — not a TS template.
      'NEON_MAINTENANCE_ROLE_NAME="${NEON_ROLE_PREFIX}_maintenance"',
    ]) {
      expect(script).toContain(derivation);
    }
    expect(script).not.toMatch(/neondb/);
    // Never Neon's project owner: it is not the role production runs as, and it may not run the
    // SECURITY DEFINER auth functions (the 10-30 drills failed sign-in with 42501 as the owner).
    expect(script).not.toMatch(/NEON_OWNER_ROLE_NAME|_owner"/);
    // The identity file is not shell-safe to `source` (an unquoted display name with a space).
    expect(script).not.toMatch(/^\s*(source|\.)\s+.*project-identity\.env/m);
  });

  it('passes the GitHub Environment, never the git ref, in both drill workflows', () => {
    for (const workflowFileName of [
      'scheduled-monthly-restore-rto.yml',
      'scheduled-weekly-restore-smoke.yml',
    ]) {
      const workflow = readFileSync(join(ROOT, '.github/workflows', workflowFileName), 'utf8');
      expect(workflow, workflowFileName).toContain(
        // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression in the workflow YAML — not a TS template.
        'RESTORE_DRILL_ENVIRONMENT: ${{ needs.resolve-environment.outputs.environment }}',
      );
      expect(workflow, workflowFileName).not.toMatch(
        /RESTORE_DRILL_\w+: \$\{\{ github\.ref_name \}\}/,
      );
    }
  });

  it('advances the id sequences between migrating and the smoke, as the DR runbook does', () => {
    const runbook = readFileSync(join(ROOT, 'docs/process/dr-runbook.md'), 'utf8');
    expect(runbook).toContain('pnpm db:sequences:advance');

    for (const workflowFileName of [
      'scheduled-monthly-restore-rto.yml',
      'scheduled-weekly-restore-smoke.yml',
    ]) {
      const workflow = readFileSync(join(ROOT, '.github/workflows', workflowFileName), 'utf8');
      const migrateIndex = workflow.indexOf('run: pnpm db:migrate');
      const advanceIndex = workflow.indexOf('pnpm --silent db:sequences:advance');
      const smokeIndex = workflow.indexOf('run: pnpm db:restore:smoke');

      expect(migrateIndex, workflowFileName).toBeGreaterThan(-1);
      expect(advanceIndex, workflowFileName).toBeGreaterThan(migrateIndex);
      expect(smokeIndex, workflowFileName).toBeGreaterThan(advanceIndex);
    }
  });

  describe('runs end to end on a public repository without leaking production', () => {
    const drillWorkflowFileNames = [
      'scheduled-monthly-restore-rto.yml',
      'scheduled-weekly-restore-smoke.yml',
    ];
    const script = readFileSync(join(ROOT, 'tooling/ci/restore-drill-neon.sh'), 'utf8');

    it('installs dependencies before the branch exists, with no skip condition', () => {
      // The skip condition read an env var nothing set, so pnpm was never installed and every
      // drill died on `pnpm: command not found`. Installed before the branch, setup needs no gate.
      for (const workflowFileName of drillWorkflowFileNames) {
        const workflow = readFileSync(join(ROOT, '.github/workflows', workflowFileName), 'utf8');
        expect(workflow, workflowFileName).not.toContain('NEON_DRILL_DATABASE_URL');
        expect(workflow, workflowFileName).not.toMatch(
          /- name: (Setup Node and pnpm|Export shared CI test env)\n\s+if:/,
        );
        expect(
          workflow.indexOf('uses: ./.github/actions/setup-node-pnpm'),
          workflowFileName,
        ).toBeGreaterThan(-1);
        expect(
          workflow.indexOf('uses: ./.github/actions/setup-node-pnpm'),
          workflowFileName,
        ).toBeLessThan(workflow.indexOf('tooling/ci/restore-drill-neon.sh create'));
      }
    });

    it('hands the Neon API key only to the steps that call Neon', () => {
      for (const workflowFileName of drillWorkflowFileNames) {
        const workflow = readFileSync(join(ROOT, '.github/workflows', workflowFileName), 'utf8');
        // Job-level env (six spaces) reaches every step: the install scripts and the test code.
        expect(workflow, workflowFileName).not.toMatch(
          /^ {6}MONTHLY_DATABASE_RESTORE_DRILL_NEON_API_KEY:/m,
        );
        // Step-level env (ten spaces): the secret check, create and delete — nothing else.
        expect(
          workflow.match(/^ {10}MONTHLY_DATABASE_RESTORE_DRILL_NEON_API_KEY:/gm),
          workflowFileName,
        ).toHaveLength(3);
      }
    });

    it('logs in as the roles production uses: migrator direct, app and maintenance pooled', () => {
      for (const workflowFileName of drillWorkflowFileNames) {
        const workflow = readFileSync(join(ROOT, '.github/workflows', workflowFileName), 'utf8');
        for (const wiring of [
          // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression in the workflow YAML — not a TS template.
          'DATABASE_MIGRATION_URL: ${{ steps.neon_drill.outputs.migration_database_url }}',
          // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression in the workflow YAML — not a TS template.
          'DATABASE_URL: ${{ steps.neon_drill.outputs.application_database_url }}',
          // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression in the workflow YAML — not a TS template.
          'DATABASE_MAINTENANCE_URL: ${{ steps.neon_drill.outputs.maintenance_database_url }}',
        ]) {
          expect(workflow, workflowFileName).toContain(wiring);
        }
        expect(workflow, workflowFileName).not.toMatch(
          /outputs\.(database_url|pooled_database_url|direct_database_url)/,
        );
      }
      expect(script).toContain(
        'neon_connection_uri "$project_id" "$branch_id" false "$NEON_MIGRATION_ROLE_NAME"',
      );
      expect(script).toContain(
        'neon_connection_uri "$project_id" "$branch_id" true "$NEON_APPLICATION_ROLE_NAME"',
      );
      expect(script).toContain(
        'neon_connection_uri "$project_id" "$branch_id" true "$NEON_MAINTENANCE_ROLE_NAME"',
      );
    });

    it('shows only the count of advanced sequences — their values are production row counts', () => {
      for (const workflowFileName of drillWorkflowFileNames) {
        const workflow = readFileSync(join(ROOT, '.github/workflows', workflowFileName), 'utf8');
        expect(workflow, workflowFileName).toContain(
          'pnpm --silent db:sequences:advance | tail -n 1',
        );
        expect(workflow, workflowFileName).not.toContain('run: pnpm db:sequences:advance');
      }
    });

    it('smokes the copy without a test suite — their setup truncates every table', () => {
      // The drills once ran the auth integration suite here: its cleanup TRUNCATEs every table,
      // and only a missing table privilege on the copy stopped it.
      for (const workflowFileName of drillWorkflowFileNames) {
        const workflow = readFileSync(join(ROOT, '.github/workflows', workflowFileName), 'utf8');
        expect(workflow, workflowFileName).toContain('run: pnpm db:restore:smoke');
        expect(workflow, workflowFileName).not.toMatch(/pnpm (test|vitest)\b|vitest run/);
        // send-code returns the sign-in code only under TEST_MODE, on the smoke step alone.
        expect(workflow.match(/TEST_MODE: 'true'/g), workflowFileName).toHaveLength(1);
      }
    });

    it('masks the drill branch URLs and endpoint, and records the branch before anything can fail', () => {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal shell parameter expansion — not a TS template.
      expect(script).toContain('echo "::add-mask::${database_url}"');
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal shell parameter expansion — not a TS template.
      expect(script).toContain('echo "::add-mask::${password}"');
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal shell parameter expansion — not a TS template.
      expect(script).toContain('echo "::add-mask::${endpoint_id}"');
      // The delete step finds the branch by this output; written last, a failure in between left
      // a copy of production up until its expiry.
      expect(script.indexOf('echo "branch_id=')).toBeGreaterThan(-1);
      expect(script.indexOf('echo "branch_id=')).toBeLessThan(
        script.lastIndexOf('wait_for_neon_operations'),
      );
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal shell parameter expansion — not a TS template.
      expect(script).toContain('BRANCH_TTL_HOURS="${BRANCH_TTL_HOURS:-1}"');
    });
  });
});

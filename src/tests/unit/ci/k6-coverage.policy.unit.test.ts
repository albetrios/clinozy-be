import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  computeCoverage,
  loadNightlyScenarioFiles,
  loadRoutes,
  loadScenarioFiles,
} from '@tooling/ci/check-load-coverage.mjs';

const workflowPath = join(process.cwd(), '.github/workflows/scheduled-k6-load-slo.yml');
const configPath = join(process.cwd(), 'src/tests/load/k6/helpers/config.js');
const coverageBudget = JSON.parse(
  readFileSync(join(process.cwd(), 'tooling/ci/load-coverage-budget.json'), 'utf8'),
) as { nightlyCoveredRoutes: number };

function escapeRegularExpression(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The `{name:<tag>}` tags a scenario's per-request thresholds filter on. */
function thresholdTags(content: string): string[] {
  return [...new Set([...content.matchAll(/\w+\{name:([^}]+)\}/g)].map((match) => match[1] ?? ''))];
}

/**
 * Whether a scenario's requests send `tag`: a literal `name: '<tag>'`, a template `name: \`…\``
 * that can produce it, or a variable-driven `tags: { name }` (a generic caller such as
 * api-stress's `opts(name)`) fed the literal. The k6 helpers send no tags, so one file is enough.
 */
function emitsTag(content: string, tag: string): boolean {
  const escapedTag = escapeRegularExpression(tag);
  if (new RegExp(String.raw`name:\s*(['"])${escapedTag}\1`).test(content)) return true;
  for (const match of content.matchAll(/name:\s*`([^`]*)`/g)) {
    const pattern = (match[1] ?? '')
      .split(/\$\{[^}]*\}/)
      .map(escapeRegularExpression)
      .join('.+');
    if (new RegExp(`^${pattern}$`).test(tag)) return true;
  }
  const variableDriven = /tags:\s*\{\s*name\s*\}/.test(content);
  return variableDriven && new RegExp(String.raw`(['"])${escapedTag}\1`).test(content);
}

const gatedScenarios = [
  'health-stress.js',
  'api-stress.js',
  'login-smoke.js',
  'permission-cached.js',
  'stripe-webhook-ingest.js',
  'idempotency-storm.js',
];

describe('k6 coverage policy (#67)', () => {
  it('runs gated scenarios with SLO thresholds in nightly workflow', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const gateSection = workflow.slice(
      workflow.indexOf('Gate — health'),
      workflow.indexOf('k6 auth-onboarding'),
    );

    for (const scenario of gatedScenarios) {
      expect(gateSection).toContain(scenario);
    }
    expect(gateSection).toContain('id: gate');
    expect(workflow).toContain('Enforce gate success (SLO)');
  });

  it('defines smoke thresholds without minimum req/s for low-VU scenarios', () => {
    const config = readFileSync(configPath, 'utf8');
    expect(config).toContain('SMOKE_THRESHOLDS');
    expect(config).not.toMatch(/SMOKE_THRESHOLDS[\s\S]*http_reqs/);
  });

  it('marks expected non-2xx responses in coverage scenarios', () => {
    const stripe = readFileSync(
      join(process.cwd(), 'src/tests/load/k6/scenarios/stripe-webhook-ingest.js'),
      'utf8',
    );
    const idempotency = readFileSync(
      join(process.cwd(), 'src/tests/load/k6/scenarios/idempotency-storm.js'),
      'utf8',
    );

    expect(stripe).toContain('expectedStatuses(400)');
    expect(idempotency).toContain('expectedStatuses(200, 409, 422)');
  });

  it('binds every per-request threshold to a tag a request actually sends', () => {
    // A threshold on a tag no request carries has no samples: k6 reports p(95)=0s and the
    // threshold passes whatever the route does (permission-cached and user-journey shipped three).
    const unbound = loadScenarioFiles().flatMap(({ name, content }) =>
      thresholdTags(content)
        .filter((tag) => !emitsTag(content, tag))
        .map((tag) => `${name}: {name:${tag}}`),
    );

    expect(unbound).toEqual([]);
  });

  it('recognizes each way a scenario sends a tag, and nothing else', () => {
    expect(
      emitsTag("http.get(url, { tags: { name: 'list-organizations' } });", 'list-organizations'),
    ).toBe(true);
    expect(emitsTag(`http.get(url, { tags: { name: \`step-\${index}\` } });`, 'step-3')).toBe(true);
    expect(
      emitsTag(
        "const opts = (name) => ({ tags: { name } }); http.get(url, opts('users-me'));",
        'users-me',
      ),
    ).toBe(true);
    expect(emitsTag("http.get(url, { tags: { name: 'list-orgs' } });", 'list-organizations')).toBe(
      false,
    );
    // A literal elsewhere in the file does not count without a variable-driven tag.
    expect(emitsTag("checkOk(response, 'list-organizations');", 'list-organizations')).toBe(false);
  });

  it('never load-tests fewer routes nightly than the recorded budget (a ratchet)', () => {
    const { covered, required } = computeCoverage({
      routes: loadRoutes(),
      scenarios: loadNightlyScenarioFiles(),
    });

    expect(
      covered.length,
      `The nightly now load-tests ${covered.length} of ${required.length} routes, below the budget of ` +
        `${coverageBudget.nightlyCoveredRoutes} — restore the scenario, or see 'pnpm load:coverage --nightly'.`,
    ).toBeGreaterThanOrEqual(coverageBudget.nightlyCoveredRoutes);
  });
});

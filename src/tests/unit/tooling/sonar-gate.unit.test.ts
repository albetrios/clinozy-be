import { describe, expect, it } from 'vitest';
import { PROJECT_SLUG } from '@/shared/constants/project-identity.constants.js';
import { formatFindings } from '@tooling/sonar/sonar-gate.js';

// The gate's failure report names every finding: an issue AND a security hotspot each with its
// rule, file and line. It used to print only the hotspot count, so a push stopped on "1 security
// hotspot(s) to review" with nothing to say which one. clinozy-fe pins its own in
// tooling/sonar/sonar-gate.test.mjs.

const dashboard = `http://localhost:9000/dashboard?id=${PROJECT_SLUG}`;

describe('sonar gate report', () => {
  it('lists each hotspot with its rule, file and line', () => {
    const report = formatFindings({
      issues: [],
      hotspots: [
        {
          ruleKey: 'typescript:S5852',
          component: `${PROJECT_SLUG}:src/shared/utils/parse.ts`,
          line: 42,
          message: 'Make sure the regex used here cannot lead to denial of service.',
          vulnerabilityProbability: 'MEDIUM',
        },
        {
          ruleKey: 'typescript:S4790',
          component: `${PROJECT_SLUG}:src/shared/utils/hash.ts`,
          message: 'Make sure this weak hash algorithm is not used in a sensitive context.',
        },
      ],
      dashboard,
    });
    expect(report).toContain('0 issue(s) and 2 security hotspot(s) to review');
    expect(report).toMatch(/MEDIUM\s+typescript:S5852\s+src\/shared\/utils\/parse\.ts:42/);
    expect(report).toContain('denial of service');
    // No line from SonarQube: the file alone.
    expect(report).toMatch(/typescript:S4790\s+src\/shared\/utils\/hash\.ts\n/);
    expect(report).toContain(`Full report: ${dashboard}`);
  });

  it('lists issues as before', () => {
    const report = formatFindings({
      issues: [
        {
          rule: 'typescript:S1854',
          severity: 'MAJOR',
          component: `${PROJECT_SLUG}:src/app.ts`,
          line: 7,
          message: 'Remove this useless assignment.',
        },
      ],
      hotspots: [],
      dashboard,
    });
    expect(report).toContain('found 1 issue(s) — fix them before pushing');
    expect(report).toMatch(/MAJOR\s+typescript:S1854\s+src\/app\.ts:7/);
    expect(report).not.toContain('Security hotspots to review');
  });

  it('counts what it does not list', () => {
    const hotspots = Array.from({ length: 53 }, (_, index) => ({
      ruleKey: 'typescript:S2245',
      component: `${PROJECT_SLUG}:src/file-${String(index)}.ts`,
      line: 1,
      message: 'pseudorandom',
    }));
    const report = formatFindings({ issues: [], hotspots, dashboard });
    expect(report).toContain('… and 3 more hotspot(s).');
  });
});

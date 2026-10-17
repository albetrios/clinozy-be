import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { selectTests } from '@tooling/vitest/test-selection.util.js';

const APP = 'src/domains/app';
const LEADS = `${APP}/sub-domains/leads`;
const PATIENTS = `${APP}/sub-domains/patients`;
const STOCK = `${APP}/sub-domains/stock`;

/** A small repository: three app sub-domains (patients imports leads), wiring, and one test per rule. */
const FIXTURE: Record<string, string> = {
  'package.json': '{}',
  'docs/reference/commands.md': '# Commands',
  'agent-os/hooks/guard.sh': '#!/usr/bin/env bash',
  'src/app.ts': "import { appRoutes } from '@/domains/app/app.routes.js';\nexport { appRoutes };",
  [`${APP}/app.routes.ts`]: [
    `import { leads } from '@/domains/app/sub-domains/leads/leads.controller.js';`,
    `import { patients } from '@/domains/app/sub-domains/patients/patients.controller.js';`,
    `import { stock } from '@/domains/app/sub-domains/stock/stock.controller.js';`,
    'export const appRoutes = [leads, patients, stock];',
  ].join('\n'),
  [`${LEADS}/leads.service.ts`]: 'export const leadsService = {};',
  [`${LEADS}/leads.controller.ts`]:
    "import { leadsService } from './leads.service.js';\nexport const leads = leadsService;",
  [`${PATIENTS}/patients.service.ts`]:
    "import { leadsService } from '@/domains/app/sub-domains/leads/leads.service.js';\nexport const patientsService = leadsService;",
  [`${PATIENTS}/patients.controller.ts`]:
    "import { patientsService } from './patients.service.js';\nexport const patients = patientsService;",
  [`${STOCK}/stock.service.ts`]: 'export const stockService = {};',
  [`${STOCK}/stock.dto.ts`]: 'export const stockBody = {};',
  [`${STOCK}/stock.controller.ts`]:
    "import { stockService } from './stock.service.js';\nexport const stock = stockService;",
  [`${LEADS}/__tests__/unit/leads.service.unit.test.ts`]:
    "import { leadsService } from '@/domains/app/sub-domains/leads/leads.service.js';",
  [`${LEADS}/__tests__/integration/leads.integration.test.ts`]:
    "import { appRoutes } from '@/app.js';",
  [`${PATIENTS}/__tests__/integration/patients.integration.test.ts`]:
    "import { appRoutes } from '@/app.js';",
  [`${STOCK}/__tests__/integration/stock.integration.test.ts`]:
    "import { appRoutes } from '@/app.js';",
  [`${APP}/__tests__/e2e/flow-enquiry.e2e.test.ts`]:
    "import { appRoutes } from '@/app.js';\nconst path = '/api/v1/app/leads';",
  [`${APP}/__tests__/e2e/flow-stock.e2e.test.ts`]:
    "import { appRoutes } from '@/app.js';\nconst path = '/api/v1/app/stock';",
  'src/tests/unit/routes-wiring.unit.test.ts':
    "import { appRoutes } from '@/domains/app/app.routes.js';",
  'src/tests/unit/hooks-policy.unit.test.ts':
    "import { join } from 'node:path';\nconst hooks = join(process.cwd(), 'agent-os', 'hooks');",
  'src/tests/unit/docs-policy.unit.test.ts':
    "import { stockService } from '@/domains/app/sub-domains/stock/stock.service.js';\nconst doc = 'docs/reference/commands.md';",
  'src/tests/unit/dto-glob.unit.test.ts':
    "import { stockService } from '@/domains/app/sub-domains/stock/stock.service.js';\nconst dtos = 'src/domains/**/*.dto.ts';",
  'src/tests/security/tenant.security.test.ts': "import { appRoutes } from '@/app.js';",
  'src/tests/global/layers.global.test.ts': "const roots = ['src'];",
};

let repositoryRoot = '';

beforeAll(() => {
  repositoryRoot = mkdtempSync(join(tmpdir(), 'test-selection-'));
  for (const [path, content] of Object.entries(FIXTURE)) {
    mkdirSync(dirname(join(repositoryRoot, path)), { recursive: true });
    writeFileSync(join(repositoryRoot, path), content);
  }
});

afterAll(() => {
  rmSync(repositoryRoot, { recursive: true, force: true });
});

function select(...changedFiles: string[]) {
  return selectTests({ changedFiles, repositoryRoot });
}

function selected(...changedFiles: string[]): string[] {
  return Object.values(select(...changedFiles).projects)
    .flat()
    .sort();
}

/**
 * Locks in the selection rules of `pnpm test:select`: an app sub-domain change picks its own
 * tests, the sub-domains whose code imports it, the app tests that name it and the always-run
 * set — and nothing else; documents pick only the tests that name them; the escalation list, an
 * unknown path, a deleted file nothing imports and any error run everything.
 */
describe('selectTests', () => {
  it('selects an app sub-domain change small: its tests, connected areas, named flows, always-run', () => {
    const selection = select(`${LEADS}/leads.service.ts`);
    expect(selection.mode).toBe('selected');
    expect(selection.projects).toEqual({
      e2e: [`${APP}/__tests__/e2e/flow-enquiry.e2e.test.ts`],
      global: ['src/tests/global/layers.global.test.ts'],
      integration: [
        `${LEADS}/__tests__/integration/leads.integration.test.ts`,
        `${PATIENTS}/__tests__/integration/patients.integration.test.ts`,
      ],
      security: ['src/tests/security/tenant.security.test.ts'],
      unit: [
        `${LEADS}/__tests__/unit/leads.service.unit.test.ts`,
        'src/tests/unit/hooks-policy.unit.test.ts',
      ],
    });
    expect(selection.why[`${PATIENTS}/__tests__/integration/patients.integration.test.ts`]).toEqual(
      [`boots the app, in area app/patients (${LEADS}/leads.service.ts)`],
    );
    expect(selection.why['src/tests/unit/hooks-policy.unit.test.ts']).toEqual([
      'always run (imports nothing from the repository)',
    ]);
  });

  it('does not follow a change through a wiring file', () => {
    expect(selected(`${LEADS}/leads.service.ts`)).not.toContain(
      'src/tests/unit/routes-wiring.unit.test.ts',
    );
    expect(selected(`${APP}/app.routes.ts`)).toContain('src/tests/unit/routes-wiring.unit.test.ts');
  });

  it('selects a document only for the tests that name it, a folder above it or a glob over it', () => {
    expect(selected('docs/reference/commands.md')).toEqual([
      'src/tests/unit/docs-policy.unit.test.ts',
    ]);
    expect(selected('agent-os/hooks/guard.sh')).toEqual([
      'src/tests/unit/hooks-policy.unit.test.ts',
    ]);
    expect(selected(`${STOCK}/stock.dto.ts`)).toContain('src/tests/unit/dto-glob.unit.test.ts');
    expect(select('docs/other.md').mode).toBe('none');
  });

  it('runs a changed test alone, without the always-run set', () => {
    expect(selected(`${LEADS}/__tests__/unit/leads.service.unit.test.ts`)).toEqual([
      `${LEADS}/__tests__/unit/leads.service.unit.test.ts`,
    ]);
  });

  it('fails closed: the escalation list, an unknown path, an untraceable deletion, any error', () => {
    expect(select('package.json')).toMatchObject({ mode: 'all' });
    expect(select('src/domains/tenancy/x.ts').reasons[0]).toContain('escalation list');
    expect(select('weird/thing.txt').reasons[0]).toContain('outside the known roots');
    expect(select(`${LEADS}/gone.ts`).reasons[0]).toContain('was deleted');
    const broken = selectTests({
      changedFiles: ['docs/reference/commands.md'],
      repositoryRoot,
      graph: {
        files: [],
        tests: ['src/missing.test.ts'],
        imports: new Map(),
        importers: new Map(),
      },
    });
    expect(broken.mode).toBe('all');
    expect(broken.reasons[0]).toContain('selector error');
  });
});

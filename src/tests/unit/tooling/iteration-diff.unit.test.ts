/**
 * Design-iteration tooling — `pnpm iteration:diff` (`tooling/iterations/iteration-diff.util.ts`).
 *
 * Pins the `schema-routes.md` parser (entities and fields, enums, routes, operations; escaped
 * pipes; `(…)` notes on entity names), the comparison of two drops (files, screens via `_index.md`,
 * PRD / schema-routes / prototype flags, every schema-routes change set), the arguments, and the
 * message when no Baseline is given.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  addTestIteration,
  createIterationRepository,
  removeIterationRepositories,
} from '@/tests/helpers/iteration-repository.helper.js';
import {
  compareSchemaRoutes,
  formatIntakeDiffSummary,
  missingBaselineMessage,
  parseDiffArguments,
  parseSchemaRoutes,
  rawIntakeDiff,
  summarizeIntakeDiff,
} from '@tooling/iterations/iteration-diff.util.js';

afterEach(() => {
  removeIterationRepositories();
});

const BASELINE_SCHEMA = `# schema-routes.md

# Route map

| Route (full path) | Screen | Kind |
| ----------------- | ------ | ---- |
| \`/patients\` | Patients | page |
| \`/sales\` | Sales | page |

# Entities

## Entity: Patient

| Field | Type | Required |
| ----- | ---- | -------- |
| id | string (uuid) | yes |
| name | string | yes |
| note | string \\| null | no |

## Entity: SaleItem (embedded in Sale.items)

| Field | Type | Required |
| ----- | ---- | -------- |
| qty | number | yes |

# Enums

## Enum: sale_status
| Machine value | UI label (verbatim) | Meaning / when set |
| ------------- | ------------------- | ------------------ |
| open | Open | |
| paid | Paid | |

# Operations

## Screen: Sales (/sales)
### Writes
| Operation | Input fields | Success result |
| --------- | ------------ | -------------- |
| createSale | items | sale |
| n/a | — | — |
`;

const CURRENT_SCHEMA = BASELINE_SCHEMA.replace(
  '| `/sales` | Sales | page |',
  '| `/sales` | Sales | page (tabs) |',
)
  .replace(
    '| `/patients` | Patients | page |',
    '| `/patients` | Patients | page |\n| `/returns` | Returns | page |',
  )
  .replace('| note | string \\| null | no |\n', '| phone | string | yes |\n')
  .replace('| name | string | yes |', '| name | string | no |')
  .replace('| paid | Paid | |', '| paid | Paid | |\n| returned | Returned | |')
  .replace(
    '## Entity: SaleItem (embedded in Sale.items)',
    '## Entity: ReturnRequest\n\n| Field | Type | Required |\n| ----- | ---- | -------- |\n| id | string (uuid) | yes |\n\n## Entity: SaleItem (embedded in Sale.items)',
  )
  .replace(
    '| createSale | items | sale |',
    '| createSale | items | sale |\n| returnSale | reason | return |',
  );

describe('parseSchemaRoutes', () => {
  it('reads entities and fields, enums, routes and operations', () => {
    const model = parseSchemaRoutes(BASELINE_SCHEMA);
    expect([...model.entities.keys()]).toEqual(['Patient', 'SaleItem']);
    expect([...(model.entities.get('Patient')?.keys() ?? [])]).toEqual(['id', 'name', 'note']);
    expect(model.entities.get('Patient')?.get('note')).toBe('string | null | no');
    expect([...(model.enums.get('sale_status')?.keys() ?? [])]).toEqual(['open', 'paid']);
    expect([...model.routes.keys()]).toEqual(['/patients', '/sales']);
    expect([...model.operations.keys()]).toEqual(['Sales › createSale']);
  });
});

describe('compareSchemaRoutes', () => {
  it('lists entities, fields, enums, routes and operations added, removed and changed', () => {
    const changes = compareSchemaRoutes({
      before: parseSchemaRoutes(BASELINE_SCHEMA),
      after: parseSchemaRoutes(CURRENT_SCHEMA),
    });
    expect(changes.entities).toEqual({
      added: ['ReturnRequest'],
      removed: [],
      changed: ['Patient'],
    });
    expect(changes.fields).toEqual({
      added: ['Patient.phone'],
      removed: ['Patient.note'],
      changed: ['Patient.name'],
    });
    expect(changes.enums).toEqual({ added: [], removed: [], changed: ['sale_status'] });
    expect(changes.routes).toEqual({ added: ['/returns'], removed: [], changed: ['/sales'] });
    expect(changes.operations).toEqual({ added: ['Sales › returnSale'], removed: [], changed: [] });
  });
});

describe('summarizeIntakeDiff', () => {
  function repository(): string {
    const repositoryRoot = createIterationRepository();
    addTestIteration({
      repositoryRoot,
      name: 'launch-2026-09-30-jxmr',
      fields: { status: 'done' },
      intake: {
        'PRD.md': '# PRD\n',
        'schema-routes.md': BASELINE_SCHEMA,
        '_index.md':
          '| Screen | Slug |\n| --- | --- |\n| Sales | `sales` |\n| Patients | `patients` |\n',
        'sales.md': '# Sales\n',
        'patients.md': '# Patients\n',
        'prototype.html': '<html></html>',
      },
    });
    addTestIteration({
      repositoryRoot,
      name: 'feat-returns-2026-10-06-kqzx',
      fields: { type: 'feat', opened: '2026-10-06', baseline: 'launch-2026-09-30-jxmr' },
      intake: {
        'PRD.md': '# PRD\n',
        'schema-routes.md': CURRENT_SCHEMA,
        '_index.md':
          '| Screen | Slug |\n| --- | --- |\n| Sales | `sales` |\n| Patients | `patients` |\n| Returns | `returns` |\n',
        'sales.md': '# Sales (tabs)\n',
        'patients.md': '# Patients\n',
        'returns.md': '# Returns\n',
        'prototype.html': '<html></html>',
      },
    });
    return repositoryRoot;
  }

  it('summarizes files, screens, the three flags and the schema-routes changes', () => {
    const repositoryRoot = repository();
    const summary = summarizeIntakeDiff({
      repositoryRoot,
      baseline: 'launch-2026-09-30-jxmr',
      current: 'feat-returns-2026-10-06-kqzx',
    });
    expect(summary.files).toEqual({
      added: ['returns.md'],
      removed: [],
      changed: ['_index.md', 'sales.md', 'schema-routes.md'],
    });
    expect(summary.screens).toEqual({ added: ['returns'], removed: [], changed: ['sales'] });
    expect(summary.prdChanged).toBe(false);
    expect(summary.schemaRoutesChanged).toBe(true);
    expect(summary.prototypeChanged).toBe(false);
    expect(summary.schemaRoutes.entities.added).toEqual(['ReturnRequest']);
    const text = formatIntakeDiffSummary(summary);
    expect(text).toContain('+ added   (1): ReturnRequest');
    expect(text).toContain('PRD.md: unchanged · schema-routes.md: changed · prototype: unchanged');
    expect(
      rawIntakeDiff({
        repositoryRoot,
        baseline: 'launch-2026-09-30-jxmr',
        current: 'feat-returns-2026-10-06-kqzx',
      }),
    ).toContain('+| `/returns` | Returns | page |');
  });

  it('requires intake-files/ on both sides — the comparison covers intake-files/ only', () => {
    const repositoryRoot = repository();
    addTestIteration({
      repositoryRoot,
      name: 'feat-empty-2026-10-07-eeee',
      fields: { type: 'feat', opened: '2026-10-07' },
    });
    expect(() =>
      summarizeIntakeDiff({
        repositoryRoot,
        baseline: 'feat-empty-2026-10-07-eeee',
        current: 'feat-returns-2026-10-06-kqzx',
      }),
    ).toThrow(/feat-empty-2026-10-07-eeee has no intake-files\//);
    expect(() =>
      summarizeIntakeDiff({
        repositoryRoot,
        baseline: 'launch-2026-09-30-jxmr',
        current: 'feat-empty-2026-10-07-eeee',
      }),
    ).toThrow(/feat-empty-2026-10-07-eeee has no intake-files\//);
  });

  it('explains the recorded and suggested Baseline when none is given', () => {
    const repositoryRoot = repository();
    const message = missingBaselineMessage({
      repositoryRoot,
      current: 'feat-returns-2026-10-06-kqzx',
    });
    expect(message).toContain(
      'Recorded in feat-returns-2026-10-06-kqzx/README.md: launch-2026-09-30-jxmr',
    );
    expect(message).toContain(
      'Suggested (latest done/frozen in this repository): launch-2026-09-30-jxmr',
    );
    expect(message).toContain(
      'pnpm iteration:diff launch-2026-09-30-jxmr feat-returns-2026-10-06-kqzx',
    );
  });
});

describe('parseDiffArguments', () => {
  it('takes [<baseline>] <current> and --json', () => {
    expect(parseDiffArguments(['a', 'b', '--json'])).toEqual({
      baseline: 'a',
      current: 'b',
      json: true,
      help: false,
    });
    expect(parseDiffArguments(['b'])).toEqual({
      baseline: undefined,
      current: 'b',
      json: false,
      help: false,
    });
    expect(() => parseDiffArguments(['a', 'b', 'c'])).toThrow(/Too many/);
    expect(() => parseDiffArguments(['a', '--stat'])).toThrow(/Unknown option/);
  });
});

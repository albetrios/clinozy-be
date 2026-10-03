import { describe, expect, it } from 'vitest';
import {
  applyMigrationSql,
  emptySchema,
  findTable,
  parseColumnDef,
  type SchemaSnapshot,
} from '@tooling/db-viewer/lib/sql-migrations.mjs';
import { diffSchemas } from '@tooling/db-viewer/lib/diff.mjs';
import {
  normalizeDefault,
  normalizeOnDelete,
  tableKey,
} from '@tooling/db-viewer/lib/normalize.mjs';
import { hasSchemaFiles } from '@tooling/db-viewer/lib/project.mjs';
import { parseSchema } from '@tooling/db-viewer/lib/parser.mjs';
import {
  buildPlanSchema,
  discoverIterationPlans,
  parseErDiagrams,
  tableNameFor,
} from '@tooling/db-viewer/lib/plan.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('db-viewer normalize', () => {
  it('treats null and no action onDelete as equivalent', () => {
    expect(normalizeOnDelete(null)).toBeNull();
    expect(normalizeOnDelete('no action')).toBeNull();
    expect(normalizeOnDelete('CASCADE')).toBe('cascade');
  });

  it('normalizes quoted / JSON-ish defaults', () => {
    expect(normalizeDefault("'{}'")).toBe('{}');
    expect(normalizeDefault('{}')).toBe('{}');
    expect(normalizeDefault('\'["en"]\'')).toBe('["en"]');
  });

  it('keys tables by schema.name', () => {
    expect(tableKey({ schema: 'audit', name: 'outbox' })).toBe('audit.outbox');
    expect(tableKey({ name: 'users' })).toBe('public.users');
  });
});

describe('db-viewer SQL constraints', () => {
  it('applies named CONSTRAINT PRIMARY KEY / UNIQUE', () => {
    const sql = `
      CREATE TABLE "tenancy"."role_permissions" (
        "role_id" integer NOT NULL,
        "permission_code" text NOT NULL,
        CONSTRAINT "pk_role_permissions" PRIMARY KEY("role_id","permission_code")
      );
      CREATE TABLE "auth"."sessions" (
        "id" integer PRIMARY KEY,
        "public_id" uuid NOT NULL,
        CONSTRAINT "sessions_public_id_unique" UNIQUE("public_id")
      );
    `;
    const { schema } = applyMigrationSql(emptySchema(), sql);
    const rp = findTable(schema, 'tenancy.role_permissions');
    expect(rp).toBeTruthy();
    expect(
      rp!.columns
        .filter((c) => c.pk)
        .map((c) => c.name)
        .sort(),
    ).toEqual(['permission_code', 'role_id']);
    const sess = findTable(schema, 'auth.sessions');
    expect(sess!.columns.find((c) => c.name === 'public_id')?.unique).toBe(true);
  });

  it('does not drop columns named unique_*/check*/constraint_*', () => {
    expect(parseColumnDef('unique_code text')).toMatchObject({ name: 'unique_code', type: 'text' });
    expect(parseColumnDef('checksum text')).toMatchObject({ name: 'checksum', type: 'text' });
    expect(parseColumnDef('constraint_kind text')).toMatchObject({
      name: 'constraint_kind',
      type: 'text',
    });
  });

  it('parses quoted type names like "inet"', () => {
    const col = parseColumnDef('"ip_address" "inet" NOT NULL');
    expect(col).toMatchObject({ name: 'ip_address', type: 'inet', notNull: true });
  });

  it('applies multi-action ADD COLUMN', () => {
    const sql = `
      CREATE TABLE public.t (id int);
      ALTER TABLE public.t ADD COLUMN a int, ADD COLUMN b text;
    `;
    const { schema } = applyMigrationSql(emptySchema(), sql);
    const t = findTable(schema, 'public.t');
    expect(t!.columns.map((c) => c.name).sort()).toEqual(['a', 'b', 'id']);
  });

  it('does not cross-wire schema-qualified tables with the same bare name', () => {
    const sql = `
      CREATE TABLE audit.outbox (id bigint);
      CREATE TABLE notify.outbox (id bigint, payload text);
      ALTER TABLE notify.outbox ADD COLUMN oops text;
      ALTER TABLE notify.outbox DROP COLUMN id;
    `;
    const { schema } = applyMigrationSql(emptySchema(), sql);
    const audit = findTable(schema, 'audit.outbox');
    const notify = findTable(schema, 'notify.outbox');
    expect(audit!.columns.map((c) => c.name)).toEqual(['id']);
    expect(notify!.columns.map((c) => c.name).sort()).toEqual(['oops', 'payload']);
  });

  it('applies FK DDL inside DO $$ blocks', () => {
    const sql = `
      CREATE TABLE tenancy.api_keys (id bigint PRIMARY KEY);
      CREATE TABLE audit.logs (id bigint PRIMARY KEY, actor_api_key_id bigint);
      DO $$ BEGIN
        ALTER TABLE audit.logs
          ADD CONSTRAINT logs_actor_api_key_id_fk
          FOREIGN KEY (actor_api_key_id) REFERENCES tenancy.api_keys(id) ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `;
    const { schema } = applyMigrationSql(emptySchema(), sql);
    const logs = findTable(schema, 'audit.logs');
    const col = logs!.columns.find((c) => c.name === 'actor_api_key_id');
    expect(col?.references).toMatchObject({
      table: 'api_keys',
      column: 'id',
      onDelete: 'set null',
    });
  });

  it('does not treat DEFAULT string contents as NOT NULL', () => {
    const col = parseColumnDef(`a text DEFAULT 'x NOT NULL y'`);
    expect(col?.notNull).toBe(false);
  });

  it('keeps PARTITION BY out of the column-def block', () => {
    const { schema, skipped } = applyMigrationSql(
      emptySchema(),
      `CREATE TABLE public.events (id bigint PRIMARY KEY, occurred_at timestamptz NOT NULL) PARTITION BY RANGE (occurred_at);`,
    );
    expect(skipped).toBe(0);
    const t = findTable(schema, 'public.events');
    expect(t!.columns.map((c) => c.name).sort()).toEqual(['id', 'occurred_at']);
  });
});

describe('db-viewer drizzle parser', () => {
  it('does not treat // inside a TS regex literal as a comment', () => {
    // Single line on purpose: pre-fix, the `//` inside the regex stripped the rest of
    // the line, silently dropping the second table.
    const source = `export const users = pgTable('users', { id: text('id').primaryKey() }); const collapse = (v) => v.replace(/\\/\\//g, '/'); export const posts = pgTable('posts', { id: text('id').primaryKey() });`;
    const schema = parseSchema(source);
    expect(schema.tables.map((t) => t.name).sort()).toEqual(['posts', 'users']);
  });
});

describe('db-viewer diffSchemas', () => {
  it('does not report false positives for onDelete null vs no action', () => {
    const a = {
      dialect: 'postgres',
      enums: [],
      tables: [
        {
          var: 'organizations',
          name: 'organizations',
          schema: 'tenancy',
          columns: [
            {
              key: 'created_by_user_id',
              name: 'created_by_user_id',
              type: 'bigint',
              pk: false,
              notNull: false,
              unique: false,
              default: null,
              references: { table: 'users', column: 'id', onDelete: 'no action' },
            },
          ],
          indexes: [],
        },
      ],
      relations: [],
    } satisfies SchemaSnapshot;
    const organization = a.tables[0]!;
    const col = organization.columns[0]!;
    const b = {
      ...a,
      tables: [
        {
          ...organization,
          columns: [
            {
              ...col,
              references: { table: 'users', column: 'id', onDelete: null },
            },
          ],
        },
      ],
    };
    const diff = diffSchemas(a, b);
    expect(diff.counts.columnsModified).toBe(0);
  });

  it('keys diff maps by schema.name (no cross-schema collision)', () => {
    const left = {
      dialect: 'postgres',
      enums: [],
      tables: [
        {
          var: 'outbox',
          name: 'outbox',
          schema: 'audit',
          columns: [
            {
              key: 'id',
              name: 'id',
              type: 'bigint',
              pk: true,
              notNull: true,
              unique: false,
              default: null,
              references: null,
            },
          ],
          indexes: [],
        },
        {
          var: 'outbox',
          name: 'outbox',
          schema: 'notify',
          columns: [
            {
              key: 'id',
              name: 'id',
              type: 'bigint',
              pk: true,
              notNull: true,
              unique: false,
              default: null,
              references: null,
            },
            {
              key: 'payload',
              name: 'payload',
              type: 'text',
              pk: false,
              notNull: false,
              unique: false,
              default: null,
              references: null,
            },
          ],
          indexes: [],
        },
      ],
      relations: [],
    } satisfies SchemaSnapshot;
    const diff = diffSchemas(left, left);
    expect(diff.counts.columnsAdded).toBe(0);
    expect(diff.counts.columnsRemoved).toBe(0);
    expect(diff.counts.columnsModified).toBe(0);
  });
});

describe('db-viewer skip counter', () => {
  it('counts ALTER on a missing table as skipped (not silently applied)', () => {
    const { schema, skipped } = applyMigrationSql(
      emptySchema(),
      `ALTER TABLE public.does_not_exist ADD COLUMN oops text;`,
    );
    expect(schema.tables).toHaveLength(0);
    expect(skipped).toBeGreaterThanOrEqual(1);
  });

  it('counts mixed ADD COLUMN + ALTER COLUMN as skipped when sibling is dropped', () => {
    const seed = `
      CREATE TABLE public.t (id int, b text);
    `;
    const { schema: base } = applyMigrationSql(emptySchema(), seed);
    const { schema, skipped } = applyMigrationSql(
      base,
      `ALTER TABLE public.t ADD COLUMN a int, ALTER COLUMN b SET NOT NULL;`,
    );
    // Whole statement fails closed so we don't pretend partial apply succeeded.
    expect(skipped).toBeGreaterThanOrEqual(1);
    expect(schema.tables[0]?.columns.find((c) => c.name === 'a')).toBeUndefined();
  });

  it('counts genuinely unhandled structural DDL as skipped', () => {
    const { skipped } = applyMigrationSql(emptySchema(), `ALTER TABLE public.t OWNER TO app_user;`);
    expect(skipped).toBeGreaterThanOrEqual(1);
  });

  it('applies SET DATA TYPE (drizzle-kit form) and counts unknown ALTER COLUMN as skipped', () => {
    const { schema: base } = applyMigrationSql(
      emptySchema(),
      `CREATE TABLE public.t (a varchar(32));`,
    );
    const { schema, skipped } = applyMigrationSql(
      base,
      `ALTER TABLE public.t ALTER COLUMN a SET DATA TYPE text;`,
    );
    expect(skipped).toBe(0);
    expect(schema.tables[0]?.columns.find((c) => c.name === 'a')?.type).toBe('text');

    const { skipped: skippedUnknown } = applyMigrationSql(
      schema,
      `ALTER TABLE public.t ALTER COLUMN a SET STATISTICS 100;`,
    );
    expect(skippedUnknown).toBeGreaterThanOrEqual(1);
  });

  it('applies every action in a multi ALTER COLUMN statement', () => {
    const { schema: base } = applyMigrationSql(
      emptySchema(),
      `CREATE TABLE public.t (a text, b text);`,
    );
    const { schema, skipped } = applyMigrationSql(
      base,
      `ALTER TABLE public.t ALTER COLUMN a SET NOT NULL, ALTER COLUMN b SET NOT NULL;`,
    );
    expect(skipped).toBe(0);
    const cols = schema.tables[0]?.columns ?? [];
    expect(cols.find((c) => c.name === 'a')?.notNull).toBe(true);
    expect(cols.find((c) => c.name === 'b')?.notNull).toBe(true);
  });
});

describe('db-viewer project detect', () => {
  it('finds schema files in this repo src/ despite file count >> 400', () => {
    const src = path.resolve(process.cwd(), 'src');
    expect(hasSchemaFiles(src)).toBe(true);
  });
});

describe('db-viewer plan mode', () => {
  const planMarkdown = [
    '# DB changes',
    '',
    '```mermaid',
    'erDiagram',
    '  organization["organization · CHANGED"]',
    '  patient["patient · NEW"]',
    '  organization ||--o{ patient : "has"',
    '```',
    '',
    '```mermaid',
    'erDiagram',
    '  organization["organization · CHANGED"] {',
    '    id id PK',
    '    enum specialties "ADDED"',
    '    text name "CHANGED: trimmed, 1–120 chars"',
    '    boolean legacy_flag "REMOVED"',
    '  }',
    '  patient["patient · NEW"] {',
    '    id id PK',
    '    id organization_id FK',
    '    text first_name',
    '  }',
    '  user["user · EXISTING"] {',
    '    id id PK',
    '  }',
    '  ghost["ghost · REMOVED"]',
    '  user }o--o{ patient : "ADDED: cares for"',
    '  this line is not mermaid',
    '```',
  ].join('\n');

  const column = (
    name: string,
    extra: Partial<SchemaSnapshot['tables'][number]['columns'][number]> = {},
  ) => ({
    key: name,
    name,
    type: 'text',
    pk: false,
    notNull: false,
    unique: false,
    default: null,
    references: null,
    ...extra,
  });

  const live = {
    dialect: 'postgres',
    enums: [],
    tables: [
      {
        var: 'organizations',
        name: 'organizations',
        schema: 'tenancy',
        columns: [
          column('id', { type: 'bigint', pk: true, notNull: true }),
          column('name'),
          column('legacy_flag', { type: 'boolean' }),
        ],
        indexes: [],
      },
      {
        var: 'users',
        name: 'users',
        schema: 'auth',
        columns: [column('id', { type: 'bigint', pk: true, notNull: true })],
        indexes: [],
      },
    ],
    relations: [],
  } satisfies SchemaSnapshot;

  it('merges every erDiagram block: markers, fields, comments and cardinality', () => {
    const plan = parseErDiagrams(planMarkdown);
    const byName = new Map(plan.entities.map((e) => [e.name, e]));
    expect(byName.get('organization')?.status).toBe('CHANGED');
    expect(byName.get('patient')?.status).toBe('NEW');
    expect(byName.get('ghost')?.status).toBe('REMOVED');
    const organization = byName.get('organization')!;
    expect(organization.fields.map((f) => [f.name, f.change])).toEqual([
      ['id', null],
      ['specialties', 'added'],
      ['name', 'changed'],
      ['legacy_flag', 'removed'],
    ]);
    expect(organization.fields.find((f) => f.name === 'name')?.note).toBe('trimmed, 1–120 chars');
    expect(byName.get('patient')?.fields.find((f) => f.name === 'organization_id')?.fk).toBe(true);

    // `organization ||--o{ patient` — patient is the many side, so it is drawn from patient
    const has = plan.relations.find((r) => r.label === 'has')!;
    expect([has.fromEntity, has.toEntity]).toEqual(['patient', 'organization']);
    expect(has.card).toEqual({
      fromKind: 'many',
      fromOptional: true,
      toKind: 'one',
      toOptional: false,
    });
    const caresFor = plan.relations.find((r) => r.label.startsWith('ADDED'))!;
    expect(caresFor.planStatus).toBe('added');
    expect(caresFor.card.fromKind).toBe('many');
    expect(caresFor.card.toKind).toBe('many');

    expect(plan.warnings.some((w) => w.includes('this line is not mermaid'))).toBe(true);
  });

  it('keeps a relationship repeated across diagrams once', () => {
    const block = ['```mermaid', 'erDiagram', '  organization ||--o{ branch : "has"', '```'].join(
      '\n',
    );
    const plan = parseErDiagrams(`${block}\n\n${block}`);
    expect(plan.relations).toHaveLength(1);
  });

  it('builds Latest + plan, and the diff shows exactly the planned changes', () => {
    const { schema, summary, warnings } = buildPlanSchema(live, parseErDiagrams(planMarkdown));
    // ghost is marked REMOVED but has no live table: nothing is removed, and a note says so
    expect(summary).toMatchObject({ new: 1, changed: 1, existing: 1, removed: 0 });
    expect(warnings).toContain('ghost: marked REMOVED, but no single live table matches');

    // no domain chosen yet: drawn under `app`, named the way the repository names tables
    const patient = schema.tables.find((t) => t.name === 'patients')!;
    expect(patient).toMatchObject({ schema: 'app', planned: true, planStatus: 'NEW' });
    expect(patient.columns.find((c) => c.name === 'organization_id')?.references?.table).toBe(
      'organizations',
    );
    const relation = schema.relations.find(
      (r) => r.from === 'patients' && r.to === 'organizations',
    )!;
    expect(relation).toMatchObject({ fromKey: 'organization_id', toColumn: 'id', planned: true });

    const diff = diffSchemas(live, schema);
    const statusOf = (name: string) => diff.tables.find((t) => t.name === name)?.status;
    expect(statusOf('patients')).toBe('added');
    expect(statusOf('organizations')).toBe('modified');
    expect(statusOf('users')).toBe('unchanged');
    const organizations = diff.tables.find((t) => t.name === 'organizations')!;
    const columnStatus = Object.fromEntries(organizations.columns.map((c) => [c.name, c.status]));
    expect(columnStatus).toEqual({
      id: 'unchanged',
      name: 'modified',
      legacy_flag: 'removed',
      specialties: 'added',
    });
    expect(organizations.columns.find((c) => c.name === 'name')?.changes).toEqual([
      'planned: trimmed, 1–120 chars',
    ]);
    expect(diff.tables.find((t) => t.name === 'users')).toMatchObject({ planStatus: 'EXISTING' });
  });

  it('draws a planned table under the domain and name its label gives', () => {
    const markdown = [
      '```mermaid',
      'erDiagram',
      '  patient["patient · NEW · clinical.patients"] {',
      '    id id PK',
      '  }',
      '  visit["visit · NEW"]',
      '```',
    ].join('\n');
    const { schema } = buildPlanSchema(live, parseErDiagrams(markdown));
    expect(schema.tables.find((t) => t.name === 'patients')).toMatchObject({ schema: 'clinical' });
    expect(schema.tables.find((t) => t.name === 'visits')).toMatchObject({ schema: 'app' });
  });

  it('resolves a reference field through its → entity comment', () => {
    const markdown = [
      '```mermaid',
      'erDiagram',
      '  appointment["appointment · NEW"] {',
      '    id id PK',
      '    id doctor_id FK "→ user"',
      '    id branch_id FK "ADDED → branch"',
      '  }',
      '  branch["branch · NEW"]',
      '  user["user · EXISTING"]',
      '```',
    ].join('\n');
    const plan = parseErDiagrams(markdown);
    const fields = plan.entities.find((e) => e.name === 'appointment')!.fields;
    expect(fields.find((f) => f.name === 'branch_id')).toMatchObject({
      change: 'added',
      referenceTo: 'branch',
    });
    const { schema } = buildPlanSchema(live, plan);
    const appointments = schema.tables.find((t) => t.name === 'appointments')!;
    const reference = (name: string) =>
      appointments.columns.find((c) => c.name === name)?.references?.table;
    expect(reference('doctor_id')).toBe('users');
    expect(reference('branch_id')).toBe('branches');
  });

  it('names tables the way the repository does — plural snake_case', () => {
    const names = ['branch', 'category', 'day_close', 'check_in', 'status', 'medicine', 'day'];
    expect(names.map(tableNameFor)).toEqual([
      'branches',
      'categories',
      'day_closes',
      'check_ins',
      'statuses',
      'medicines',
      'days',
    ]);
  });

  it('marks a live table instead of drawing a NEW entity twice', () => {
    const markdown = ['```mermaid', 'erDiagram', '  user["user · NEW"]', '```'].join('\n');
    const { schema, summary, warnings } = buildPlanSchema(live, parseErDiagrams(markdown));
    expect(schema.tables.filter((t) => t.name === 'user' || t.name === 'users')).toHaveLength(1);
    expect(schema.tables.find((t) => t.name === 'users')).toMatchObject({ planStatus: 'NEW' });
    expect(summary.matched).toBe(1);
    expect(warnings).toContain('user: NEW in the plan, and users already exists');
  });

  it('draws an ADDED relationship even where a live one joins the same tables', () => {
    const withRelation = {
      ...live,
      relations: [
        {
          from: 'organizations',
          fromColumn: 'owner_id',
          fromKey: 'owner_id',
          to: 'users',
          toColumn: 'id',
        },
      ],
    } satisfies SchemaSnapshot;
    const markdown = [
      '```mermaid',
      'erDiagram',
      '  organization["organization · EXISTING"]',
      '  user["user · EXISTING"]',
      '  user ||--o{ organization : "owns"',
      '  organization }o--o{ user : "ADDED: is run by"',
      '```',
    ].join('\n');
    const { schema } = buildPlanSchema(withRelation, parseErDiagrams(markdown));
    const between = schema.relations.filter((r) => r.from === 'organizations' && r.to === 'users');
    // the built "owns" is not drawn twice; the planned "is run by" is added
    expect(between.map((r) => r.label ?? 'built')).toEqual(['built', 'ADDED: is run by']);
  });

  it('discovers plans in every iteration that is not frozen', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'db-viewer-plans-'));
    try {
      const iteration = (name: string, status: string, withPlan: boolean) => {
        const folder = path.join(root, name);
        fs.mkdirSync(path.join(folder, 'plans'), { recursive: true });
        fs.writeFileSync(
          path.join(folder, 'README.md'),
          `# ${name}\n\n| Field | Value |\n| --- | --- |\n| Opened | 2026-10-0${name.length % 9} |\n| Status | ${status} |\n`,
        );
        if (withPlan) fs.writeFileSync(path.join(folder, 'plans', 'db-changes.md'), planMarkdown);
      };
      iteration('launch-2026-10-01-abcd', 'planning', true);
      iteration('feat-done-thing-2026-10-02-efgh', 'frozen', true);
      iteration('feat-no-plan-2026-10-03-ijkl', 'planning', false);
      const plans = discoverIterationPlans(root);
      expect(plans.map((p) => [p.name, p.status])).toEqual([
        ['launch-2026-10-01-abcd', 'planning'],
      ]);
      expect(plans[0]?.file).toBe(
        path.join(root, 'launch-2026-10-01-abcd', 'plans', 'db-changes.md'),
      );
      expect(discoverIterationPlans(path.join(root, 'missing'))).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

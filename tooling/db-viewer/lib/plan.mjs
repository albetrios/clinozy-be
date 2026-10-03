// Plan mode: an iteration's planned data model, drawn as a future version after Latest.
//
// Source: iterations/<iteration>/plans/db-changes.md — the one file per iteration that holds its
// Mermaid `erDiagram` blocks (overview + per-feature entities), written on the go while planning
// (agent-os/skills/be-iteration-planning). Entity labels carry the change marker and, once the user
// has chosen them, the table's domain and name (`name["name · NEW|CHANGED|EXISTING|REMOVED"]` or
// `name["name · NEW · clinical.patients"]`); fields use logical types, and field comments say what
// changes ("ADDED", "CHANGED: …", "REMOVED").

import fs from 'node:fs';
import path from 'node:path';
import { cloneSchema } from './sql-migrations.mjs';

/** Where the plan lives inside an iteration folder. */
const PLAN_FILE = path.join('plans', 'db-changes.md');

/** The domain (Postgres schema) a planned table is drawn under until the plan names one. */
const DEFAULT_PLAN_SCHEMA = 'app';

/** `clinical.patients` or `patients` — the optional third label segment. */
const TABLE_TARGET = /^(?:([a-z_][a-z0-9_]*)\.)?([a-z_][a-z0-9_]*)$/;

const STATUSES = new Set(['NEW', 'CHANGED', 'EXISTING', 'REMOVED']);

const ENTITY_LINE = /^([A-Za-z_][\w-]*)\s*(?:\[\s*"([^"]*)"\s*\])?\s*(\{)?\s*(\})?$/;
const FIELD_LINE =
  /^([\w()[\]-]+)\s+([\w-]+)(?:\s+((?:PK|FK|UK)(?:\s*,\s*(?:PK|FK|UK))*))?(?:\s+"([^"]*)")?$/;
const RELATION_LINE =
  /^([A-Za-z_][\w-]*)\s+(\|\||\|o|\}\||\}o)(--|\.\.)(\|\||o\||\|\{|o\{)\s+([A-Za-z_][\w-]*)\s*:\s*(?:"([^"]*)"|(.*?))\s*$/;

/** Every fenced ```mermaid block whose diagram is an `erDiagram`. */
function erDiagramBlocks(markdown) {
  const blocks = [];
  const fence = /```mermaid[^\n]*\n([\s\S]*?)```/g;
  for (const match of markdown.matchAll(fence)) {
    const lines = match[1].split('\n');
    const first = lines.findIndex((line) => line.trim() !== '');
    if (first === -1 || lines[first].trim() !== 'erDiagram') continue;
    blocks.push(lines.slice(first + 1));
  }
  return blocks;
}

/**
 * `"patient · NEW"` → `{ status: 'NEW', target: null }`;
 * `"patient · NEW · clinical.patients"` → `{ status: 'NEW', target: { schema: 'clinical', table: 'patients' } }`.
 */
function parseLabel(label) {
  const segments = (label || '').split('·').map((part) => part.trim());
  const statusIndex = segments.findIndex((part) => STATUSES.has(part.toUpperCase()));
  if (statusIndex === -1) return { status: null, target: null };
  const target = TABLE_TARGET.exec(segments[statusIndex + 1] || '');
  return {
    status: segments[statusIndex].toUpperCase(),
    target: target ? { schema: target[1] || null, table: target[2] } : null,
  };
}

/** The repository's table naming: plural snake_case (`branch` → `branches`, `category` → `categories`). */
function tableNameFor(entityName) {
  const name = entityName.toLowerCase();
  if (/[^aeiou]y$/.test(name)) return `${name.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/.test(name)) return `${name}es`;
  return `${name}s`;
}

/** A reference's target in a field comment: `"→ user"`, `"ADDED → branch"`. */
const REFERENCE_TARGET = /→\s*([a-z_][a-z0-9_]*)/i;

/**
 * `"CHANGED: adds returned"` → `{ change: 'changed', note: 'adds returned', referenceTo: null }`;
 * `"→ user"` (a reference field's target entity) → `{ change: null, note: null, referenceTo: 'user' }`.
 */
function parseFieldComment(comment) {
  if (!comment) return { change: null, note: null, referenceTo: null };
  const referenceTo = REFERENCE_TARGET.exec(comment)?.[1] ?? null;
  const rest = comment.replace(REFERENCE_TARGET, '').trim();
  const [head, ...tail] = rest.split(':');
  const marker = head.trim().toUpperCase();
  const note = tail.join(':').trim() || null;
  if (marker === 'ADDED') return { change: 'added', note, referenceTo };
  if (marker === 'REMOVED') return { change: 'removed', note, referenceTo };
  if (marker === 'CHANGED') return { change: 'changed', note: note || 'changed', referenceTo };
  return { change: null, note: rest || null, referenceTo };
}

function ensureEntity(entities, name) {
  if (!entities.has(name)) entities.set(name, { name, status: null, target: null, fields: [] });
  return entities.get(name);
}

function mergeField(entity, field) {
  const existing = entity.fields.find((f) => f.name === field.name);
  if (!existing) {
    entity.fields.push(field);
    return;
  }
  existing.pk ||= field.pk;
  existing.fk ||= field.fk;
  existing.unique ||= field.unique;
  existing.change ||= field.change;
  existing.note ||= field.note;
  existing.referenceTo ||= field.referenceTo;
}

/** Mermaid cardinality tokens → which side is "many" and which is optional. */
function relationFromTokens(left, leftToken, rightToken, right, label) {
  const leftMany = leftToken.includes('}');
  const rightMany = rightToken.includes('{');
  const leftOptional = leftToken.includes('o');
  const rightOptional = rightToken.includes('o');
  const text = (label || '').trim();
  const marker = text.split(':')[0].trim().toUpperCase();
  const planStatus = marker === 'ADDED' ? 'added' : marker === 'REMOVED' ? 'removed' : null;
  // The canvas draws `from` (the "many" side, the one holding the reference) → `to`. That is the
  // left entity exactly when its token is "many" — many-to-one and many-to-many alike; a
  // one-to-many or one-to-one relation is drawn from the right.
  const fromIsLeft = leftMany;
  return {
    fromEntity: fromIsLeft ? left : right,
    toEntity: fromIsLeft ? right : left,
    card: {
      fromKind: (fromIsLeft ? leftMany : rightMany) ? 'many' : 'one',
      fromOptional: fromIsLeft ? leftOptional : rightOptional,
      toKind: (fromIsLeft ? rightMany : leftMany) ? 'many' : 'one',
      toOptional: fromIsLeft ? rightOptional : leftOptional,
    },
    label: text,
    planStatus,
  };
}

/** Inside an entity's `{ … }` body: one field line, or the closing brace. */
function readFieldLine(state, line) {
  if (line === '}') {
    state.open = null;
    return;
  }
  const field = FIELD_LINE.exec(line);
  if (!field) {
    state.warnings.push(`${state.open.name}: unreadable field line "${line}"`);
    return;
  }
  const keys = (field[3] || '').split(',').map((k) => k.trim());
  mergeField(state.open, {
    type: field[1],
    name: field[2],
    pk: keys.includes('PK'),
    fk: keys.includes('FK'),
    unique: keys.includes('UK'),
    ...parseFieldComment(field[4]),
  });
}

/** Outside a body: a relationship, an entity declaration (which may open a body), or noise. */
function readDiagramLine(state, line) {
  const relation = RELATION_LINE.exec(line);
  if (relation) {
    const [, left, leftToken, , rightToken, right, quoted, bare] = relation;
    ensureEntity(state.entities, left);
    ensureEntity(state.entities, right);
    const parsed = relationFromTokens(left, leftToken, rightToken, right, quoted ?? bare);
    // the overview and a feature diagram often repeat the same relationship — keep it once
    const key = `${parsed.fromEntity}|${parsed.toEntity}|${parsed.label}`;
    if (state.relationKeys.has(key)) return;
    state.relationKeys.add(key);
    state.relations.push(parsed);
    return;
  }
  const entityLine = ENTITY_LINE.exec(line);
  if (!entityLine) {
    state.warnings.push(`unreadable diagram line "${line}"`);
    return;
  }
  const entity = ensureEntity(state.entities, entityLine[1]);
  const { status, target } = parseLabel(entityLine[2]);
  entity.target ||= target;
  if (status && entity.status && status !== entity.status) {
    state.warnings.push(
      `${entity.name}: marked ${entity.status} and ${status} — kept ${entity.status}`,
    );
  }
  entity.status ||= status;
  if (entityLine[3] && !entityLine[4]) state.open = entity;
}

/**
 * Parse every `erDiagram` block in a markdown document into one merged plan: an entity that
 * appears in several blocks (the overview and a feature diagram) keeps its first change marker
 * and the union of its fields.
 *
 * @param {string} markdown
 */
function parseErDiagrams(markdown) {
  const state = {
    entities: new Map(),
    relations: [],
    relationKeys: new Set(),
    warnings: [],
    open: null,
  };
  for (const lines of erDiagramBlocks(markdown || '')) {
    state.open = null;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('%%')) continue;
      if (state.open) readFieldLine(state, line);
      else readDiagramLine(state, line);
    }
  }
  return {
    entities: [...state.entities.values()],
    relations: state.relations,
    warnings: state.warnings,
  };
}

/** Singular / plural spellings a live table might use for a planned entity. */
function nameCandidates(entityName) {
  const name = entityName.toLowerCase();
  const out = new Set([name, `${name}s`, `${name}es`]);
  if (name.endsWith('y')) out.add(`${name.slice(0, -1)}ies`);
  if (name.endsWith('s')) out.add(name.slice(0, -1));
  return out;
}

/**
 * The one live table a planned entity names, or null when none (or more than one) matches: the
 * label's explicit `domain.table` when it has one, else the entity name, singular or plural.
 */
function matchLiveTable(schema, entityName, target = null) {
  const live = schema.tables.filter((t) => !t.planned);
  const hits = target
    ? live.filter((t) => t.name === target.table && (!target.schema || t.schema === target.schema))
    : live.filter((t) => nameCandidates(entityName).has(String(t.name).toLowerCase()));
  return hits.length === 1 ? hits[0] : null;
}

/** Where a planned table is drawn: the label's `domain.table`, else `app` + the plural name. */
function plannedTarget(entity) {
  return {
    tableName: entity.target?.table || tableNameFor(entity.name),
    tableSchema: entity.target?.schema || DEFAULT_PLAN_SCHEMA,
  };
}

function planColumn(field, references) {
  return {
    key: field.name,
    name: field.name,
    type: field.type,
    pk: field.pk,
    notNull: field.pk,
    unique: field.unique,
    default: null,
    references: field.fk ? references || { table: '?', column: 'id', onDelete: null } : null,
    planned: true,
    ...(field.change === 'changed' ? { planNote: field.note } : {}),
  };
}

/** The table a reference field points at: its `→ entity` comment, else `<entity>_id` by name. */
function referencedTable(field, resolved) {
  if (!field.fk) return null;
  const entity = field.referenceTo || (field.name.endsWith('_id') ? field.name.slice(0, -3) : null);
  const target = entity ? resolved.get(entity) : null;
  return target ? { table: target, column: 'id', onDelete: null } : null;
}

/** Apply a CHANGED entity's field markers to its matched live table, in place. */
function applyFieldChanges(table, entity, resolved) {
  for (const field of entity.fields) {
    const index = table.columns.findIndex((c) => c.name === field.name);
    if (field.change === 'removed') {
      if (index !== -1) table.columns.splice(index, 1);
    } else if (field.change === 'added' && index === -1) {
      table.columns.push(planColumn(field, referencedTable(field, resolved)));
    } else if (field.change === 'changed') {
      if (index === -1) table.columns.push(planColumn(field, referencedTable(field, resolved)));
      else table.columns[index] = { ...table.columns[index], planNote: field.note };
    }
  }
}

function anchorColumn(table, entityName, toTable) {
  const wanted = new Set([`${entityName}_id`, `${toTable}_id`]);
  const byName = table.columns.find((c) => wanted.has(c.name));
  if (byName) return byName.key;
  const byRef = table.columns.find((c) => c.references?.table === toTable);
  return byRef ? byRef.key : null;
}

function targetColumn(table) {
  const id = table.columns.find((c) => c.name === 'id');
  if (id) return id.name;
  const pk = table.columns.find((c) => c.pk);
  return pk ? pk.name : null;
}

/**
 * Latest + one iteration's plan → the schema the plan describes, ready for `diffSchemas(latest, …)`.
 *
 * - NEW: a planned table — under the label's `domain.table`, else under `app` with the plural
 *   snake_case name the repository uses — unless a live table already matches (built during
 *   kickoff, or provisional while planning), which is then marked rather than duplicated.
 * - CHANGED: the matched live table gains ADDED fields, loses REMOVED ones, and CHANGED fields
 *   carry a `planNote` (the diff reports them as modified).
 * - EXISTING: context only; the matched live table is marked, nothing changes.
 * - REMOVED: the matched live table is dropped.
 *
 * @param {import('./sql-migrations.mjs').SchemaSnapshot} base
 * @param {ReturnType<typeof parseErDiagrams>} plan
 */
function buildPlanSchema(base, plan) {
  const build = {
    schema: cloneSchema(base),
    warnings: [...plan.warnings],
    summary: { new: 0, changed: 0, existing: 0, removed: 0, matched: 0 },
    resolved: new Map(), // entity name → table name on the canvas
    pending: [], // entities drawn as planned tables
  };
  for (const entity of plan.entities) resolveEntity(build, entity);
  // Changes to live tables first, then new tables — FK fields resolve against both.
  for (const entity of plan.entities) {
    if (entity.status !== 'CHANGED') continue;
    const table = build.schema.tables.find((t) => t.name === build.resolved.get(entity.name));
    if (table && !table.planned) applyFieldChanges(table, entity, build.resolved);
  }
  for (const entity of build.pending)
    build.schema.tables.push(plannedTable(entity, build.resolved));
  for (const relation of plan.relations) applyRelation(build, relation);
  return { schema: build.schema, summary: build.summary, warnings: build.warnings };
}

/** Decide where one entity lands: a live table (marked, changed or dropped) or a planned table. */
function resolveEntity(build, entity) {
  const { schema, summary, warnings, resolved } = build;
  const status = entity.status || 'NEW';
  const live = matchLiveTable(schema, entity.name, entity.target);
  if (status === 'NEW') {
    summary.new++;
    if (!live) {
      addPending(build, entity);
      return;
    }
    summary.matched++;
    live.planStatus = 'NEW';
    resolved.set(entity.name, live.name);
    warnings.push(`${entity.name}: NEW in the plan, and ${live.name} already exists`);
    return;
  }
  if (!live) {
    warnings.push(`${entity.name}: marked ${status}, but no single live table matches`);
    if (status !== 'CHANGED') return;
    summary.changed++;
    addPending(build, { ...entity, unmatched: true });
    return;
  }
  resolved.set(entity.name, live.name);
  if (status === 'REMOVED') {
    summary.removed++;
    schema.tables = schema.tables.filter((t) => t !== live);
    schema.relations = schema.relations.filter((r) => r.from !== live.name && r.to !== live.name);
    return;
  }
  live.planStatus = status;
  if (status === 'EXISTING') summary.existing++;
  else summary.changed++;
}

/** Queue an entity as a planned table; the canvas keys tables by bare name, so flag a clash. */
function addPending(build, entity) {
  const placed = { ...entity, ...plannedTarget(entity) };
  const clash = build.schema.tables.find((t) => t.name === placed.tableName);
  if (clash) {
    build.warnings.push(
      `${entity.name}: planned as ${placed.tableSchema}.${placed.tableName}, which shares its name with ${clash.schema}.${clash.name}`,
    );
  }
  build.resolved.set(entity.name, placed.tableName);
  build.pending.push(placed);
}

function plannedTable(entity, resolved) {
  return {
    var: entity.tableName,
    name: entity.tableName,
    schema: entity.tableSchema,
    columns: entity.fields
      .filter((f) => f.change !== 'removed')
      .map((f) => planColumn(f, referencedTable(f, resolved))),
    indexes: [],
    planned: true,
    planStatus: entity.status || 'NEW',
    ...(entity.unmatched ? { planUnmatched: true } : {}),
  };
}

/** Draw a planned relationship, or drop the live one a `REMOVED:` label names. */
function applyRelation(build, relation) {
  const { schema, resolved } = build;
  const from = schema.tables.find((t) => t.name === resolved.get(relation.fromEntity));
  const to = schema.tables.find((t) => t.name === resolved.get(relation.toEntity));
  if (!(from && to)) return;
  const sameEnds = (r) => r.from === from.name && r.to === to.name;
  if (relation.planStatus === 'removed') {
    schema.relations = schema.relations.filter((r) => !sameEnds(r));
    return;
  }
  // An unmarked relationship that is already built is not drawn twice; an `ADDED:` one always is.
  if (!relation.planStatus && schema.relations.some((r) => sameEnds(r) && !r.planned)) return;
  const fromKey = anchorColumn(from, relation.toEntity, to.name);
  schema.relations.push({
    from: from.name,
    fromColumn: fromKey,
    fromKey,
    to: to.name,
    toColumn: targetColumn(to),
    onDelete: null,
    card: relation.card,
    label: relation.label,
    planned: true,
    planStatus: relation.planStatus,
  });
}

/** The README's `| Field | Value |` table as a plain object. */
function readReadmeFields(readmePath) {
  const fields = {};
  let text = '';
  try {
    text = fs.readFileSync(readmePath, 'utf8');
  } catch {
    return fields;
  }
  for (const line of text.split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim());
    if (cells.length >= 4 && cells[0] === '' && cells[1] && !/^-+$/.test(cells[1])) {
      fields[cells[1]] = cells[2];
    }
  }
  return fields;
}

/**
 * Every iteration that has a plan to show: a `plans/db-changes.md`, and a Status other than
 * `frozen` (a frozen iteration is merged — its tables are in Latest). Oldest first.
 *
 * @param {string | null | undefined} iterationsDir
 */
function discoverIterationPlans(iterationsDir) {
  if (!iterationsDir) return [];
  let entries = [];
  try {
    entries = fs.readdirSync(iterationsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const plans = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const folder = path.join(iterationsDir, entry.name);
    const file = path.join(folder, PLAN_FILE);
    if (!fs.existsSync(file)) continue;
    const fields = readReadmeFields(path.join(folder, 'README.md'));
    const status = fields.Status || 'planning';
    if (status === 'frozen') continue;
    plans.push({
      name: entry.name,
      status,
      opened: fields.Opened || '',
      summary: fields.Summary || '',
      file,
    });
  }
  return plans.sort((a, b) => a.opened.localeCompare(b.opened) || a.name.localeCompare(b.name));
}

export {
  PLAN_FILE,
  DEFAULT_PLAN_SCHEMA,
  tableNameFor,
  parseErDiagrams,
  buildPlanSchema,
  discoverIterationPlans,
  matchLiveTable,
};

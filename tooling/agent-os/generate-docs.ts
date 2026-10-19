#!/usr/bin/env tsx
/**
 * agent-os doc generator — regenerates the three hand-maintained derivative docs
 * from their single sources so drift is impossible, not merely detected:
 *
 *   - the `Project skills (N)` table in agent-os/skills/be-skill-index/SKILL.md
 *       ← skill directories on disk + groups.json order + per-skill `indexNote`
 *   - agent-os/docs/agents-catalog.md
 *       ← agents/*.md frontmatter (name/description/model/wrapsSkill/useWhen)
 *         + agents/pipelines.json membership
 *   - the trigger table in agent-os/docs/skill-triggers.md, and the same rows as
 *     agent-os/hooks/skill-routing.json (read by the edit hook)
 *       ← skills/chains.json triggers (multi-skill rows) + per-skill `trigger`
 *   - the rules table in skills/be-skill-index/SKILL.md (region `rules`)
 *       ← rules/*.mdc frontmatter (alwaysApply / globs / description)
 *
 * Only the region between `<!-- GENERATED:START -->` and `<!-- GENERATED:END -->`
 * markers is rewritten; hand-written prose outside the markers survives verbatim.
 *
 * Invoked by tooling/agent-os/generate.ts (so `pnpm agent-os:generate` /
 * `:generate:check` cover these docs alongside the hook/mcp derivations).
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { isMain, parseCommandLine } from '@tooling/setup/common/script.js';

const repositoryRoot = process.cwd();
const agentOsDirectory = join(repositoryRoot, 'agent-os');

export const GENERATED_START = '<!-- GENERATED:START -->';
export const GENERATED_END = '<!-- GENERATED:END -->';

const readText = (absolutePath: string): string => readFileSync(absolutePath, 'utf8');
const readJson = <T>(absolutePath: string): T => JSON.parse(readText(absolutePath)) as T;

const listDirectoryNames = (absoluteDirectory: string): string[] =>
  readdirSync(absoluteDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

const listMarkdownFiles = (absoluteDirectory: string): string[] =>
  readdirSync(absoluteDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort();

/** Extract one frontmatter field, tolerating folded (`>`) / literal (`|`) scalars. */
function frontmatterField(text: string, key: string): string | undefined {
  const block = text.match(/^---\n([\s\S]*?)\n---/)?.[1];
  if (!block) return undefined;
  const lines = block.split('\n');
  const index = lines.findIndex((line) => new RegExp(`^${key}:`).test(line));
  if (index === -1) return undefined;
  const inline = (lines[index] ?? '').slice(key.length + 1).trim();
  if (inline !== '' && !['>', '|', '>-', '|-'].includes(inline)) return inline;
  const collected: string[] = [];
  for (let cursor = index + 1; cursor < lines.length; cursor++) {
    const current = lines[cursor] ?? '';
    if (/^\s+\S/.test(current)) collected.push(current.trim());
    else if (/^\s*$/.test(current)) continue;
    else break;
  }
  return collected.join(' ').trim() || undefined;
}

/** Strip a single layer of surrounding YAML quotes (e.g. `"*(inline)*"` → `*(inline)*`). */
const unquote = (value: string): string => value.replace(/^(['"])(.*)\1$/, '$2');

/** Escape a `|` so an embedded pipe does not split a Markdown table cell. */
const cell = (value: string): string => value.replace(/\|/g, '\\|');

/** A token is a file path/glob (gets backticked) vs prose (rendered plain). */
const isPathLike = (token: string): boolean => /[/*]/.test(token) || /\.[a-z]/.test(token);

/** Split on top-level commas, ignoring commas inside `{...}` brace groups. */
function splitTopLevel(pattern: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const character of pattern) {
    if (character === '{') depth++;
    else if (character === '}') depth--;
    if (character === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else current += character;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

/** Split a trigger on top-level commas and expand its `{a,b,c}` groups. */
function expandTokens(pattern: string): string[] {
  return splitTopLevel(pattern).flatMap((token) => {
    const brace = token.match(/^(.*)\{([^}]+)\}(.*)$/);
    if (!brace) return [token];
    const [, before = '', group = '', after = ''] = brace;
    return group.split(',').map((option) => `${before}${option.trim()}${after}`);
  });
}

/** Expand `{a,b,c}` groups; backtick path-like tokens, leave prose plain. */
function backtickedGlobs(pattern: string): string {
  return expandTokens(pattern)
    .map((token) => (isPathLike(token) ? `\`${token}\`` : token))
    .join(', ');
}

// ── Region rewrite helpers ──────────────────────────────────────────────────
interface DocResult {
  path: string;
  displayPath: string;
  next: string;
  changed: boolean;
}

/**
 * Replace a GENERATED region in `text` with `body`; error if absent. Without `name` it is the
 * file's unnamed region (`<!-- GENERATED:START -->`); with one, `<!-- GENERATED:START name -->`,
 * so one file can hold several.
 */
function rewriteRegion(displayPath: string, text: string, body: string, name?: string): string {
  const startMarker = name ? `<!-- GENERATED:START ${name} -->` : GENERATED_START;
  const endMarker = name ? `<!-- GENERATED:END ${name} -->` : GENERATED_END;
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start)
    throw new Error(`${displayPath}: missing ${startMarker} / ${endMarker} markers`);
  const before = text.slice(0, start + startMarker.length);
  const after = text.slice(end);
  return `${before}\n${body}\n${after}`;
}

// ── 1) be-skill-index Project-skills table ─────────────────────────────────────
function buildSkillIndexRegion(): DocResult {
  const path = join(agentOsDirectory, 'skills', 'be-skill-index', 'SKILL.md');
  const skills = listDirectoryNames(join(agentOsDirectory, 'skills'));
  const groups = readJson<{ groups: Record<string, string[]> }>(
    join(agentOsDirectory, 'skills', 'groups.json'),
  ).groups;
  // Group order from groups.json; within a group, groups.json order.
  const ordered: string[] = [];
  for (const members of Object.values(groups))
    for (const member of members)
      if (skills.includes(member) && !ordered.includes(member)) ordered.push(member);
  for (const skill of skills) if (!ordered.includes(skill)) ordered.push(skill);

  const rows = ordered.map((skill) => {
    const note =
      frontmatterField(
        readText(join(agentOsDirectory, 'skills', skill, 'SKILL.md')),
        'indexNote',
      ) ?? '';
    return `| ${skill} | \`agent-os/skills/${skill}/SKILL.md\` | ${cell(note)} |`;
  });
  const body = [
    `## Project skills (${skills.length})`,
    '',
    'Grouped by `agent-os/skills/groups.json`. Regenerated by `pnpm agent-os:generate`.',
    '',
    '| Skill | Path | Note |',
    '| ----- | ---- | ---- |',
    ...rows,
  ].join('\n');

  const text = readText(path);
  const next = rewriteRegion('be-skill-index/SKILL.md', text, body);
  return {
    path,
    displayPath: 'agent-os/skills/be-skill-index/SKILL.md',
    next,
    changed: next !== text,
  };
}

// ── 2) agents-catalog.md ────────────────────────────────────────────────────
function buildAgentsCatalog(): DocResult {
  const path = join(agentOsDirectory, 'docs', 'agents-catalog.md');
  const agentsDirectory = join(agentOsDirectory, 'agents');
  const files = listMarkdownFiles(agentsDirectory);
  const pipelines = readJson<{ pipelines: Record<string, { steps?: string[] }> }>(
    join(agentsDirectory, 'pipelines.json'),
  ).pipelines;
  const pipelineOf = (agent: string): string[] =>
    Object.entries(pipelines)
      .filter(([, definition]) => (definition.steps ?? []).includes(agent))
      .map(([name]) => name);

  const rows = files.map((file) => {
    const text = readText(join(agentsDirectory, file));
    const name = frontmatterField(text, 'name') ?? basename(file, '.md');
    const model = frontmatterField(text, 'model') ?? 'inherit';
    const rationale = unquote(frontmatterField(text, 'modelRationale') ?? '');
    const modelCell = rationale ? `\`${model}\` — ${rationale}` : `\`${model}\``;
    const wraps = unquote(frontmatterField(text, 'wrapsSkill') ?? '*(inline)*');
    const useWhen = unquote(frontmatterField(text, 'useWhen') ?? '');
    const inPipelines = pipelineOf(name);
    const pipelineCell = inPipelines.length ? inPipelines.join(', ') : '—';
    return `| **${name}** | [\`agent-os/agents/${file}\`](../agents/${file}) | ${cell(wraps)} | ${cell(modelCell)} | ${pipelineCell} | ${cell(useWhen)} |`;
  });
  const body = [
    `All ${files.length} project agents — each read-only. Generated from \`agents/*.md\` frontmatter`,
    'and `agents/pipelines.json`. See [platform-access.md](platform-access.md) for how to invoke on each platform.',
    '',
    '| Agent | File | Wraps skill | Model (routing rationale) | Pipelines | Use when |',
    '| ----- | ---- | ----------- | ------------------------- | --------- | -------- |',
    ...rows,
  ].join('\n');

  const text = readText(path);
  const next = rewriteRegion('agents-catalog.md', text, body);
  return { path, displayPath: 'agent-os/docs/agents-catalog.md', next, changed: next !== text };
}

// ── 3) the routing map: skill-triggers.md table + skill-routing.json ───────────
/** One routing row: the files that trigger it, the skills to run (in order), a note. */
export interface RoutingRoute {
  trigger: string;
  globs: string[];
  skills: string[];
  optional: string[];
  note: string;
  chain?: string;
}

/**
 * The routing map, built once: a row per chain (`chains.json`) and a row per skill whose own
 * `trigger` frontmatter is not a chain's trigger. Chains first, in file order; then the skill
 * rows sorted the way the table has always rendered them.
 */
export function routingRoutes(): RoutingRoute[] {
  const skills = listDirectoryNames(join(agentOsDirectory, 'skills'));
  const chains = readJson<{
    chains: Record<
      string,
      { trigger?: string; steps?: string[]; optional?: string[]; description?: string }
    >;
  }>(join(agentOsDirectory, 'skills', 'chains.json')).chains;
  const globsOf = (trigger: string) => expandTokens(trigger).filter(isPathLike);

  const chainRoutes: RoutingRoute[] = [];
  for (const [chain, definition] of Object.entries(chains)) {
    if (!definition.trigger) continue;
    chainRoutes.push({
      trigger: definition.trigger,
      globs: globsOf(definition.trigger),
      skills: definition.steps ?? [],
      optional: definition.optional ?? [],
      note: definition.description ?? '',
      chain,
    });
  }
  const chainTriggers = new Set(chainRoutes.map((route) => route.trigger));

  const skillRoutes: RoutingRoute[] = [];
  for (const skill of skills) {
    const text = readText(join(agentOsDirectory, 'skills', skill, 'SKILL.md'));
    const trigger = frontmatterField(text, 'trigger');
    if (!trigger || chainTriggers.has(trigger)) continue;
    skillRoutes.push({
      trigger,
      globs: globsOf(trigger),
      skills: [skill],
      optional: [],
      note: frontmatterField(text, 'triggerNote') ?? '',
    });
  }
  const rowOf = (route: RoutingRoute) =>
    `| ${backtickedGlobs(route.trigger)} | ${route.skills[0]} | ${cell(route.note)} |`;
  skillRoutes.sort((left, right) => (rowOf(left) < rowOf(right) ? -1 : 1));
  return [...chainRoutes, ...skillRoutes];
}

function buildSkillTriggers(): DocResult {
  const path = join(agentOsDirectory, 'docs', 'skill-triggers.md');
  const rows = routingRoutes().map((route) => {
    const optional = route.optional.length ? ` (+ ${route.optional.join(', ')})` : '';
    return `| ${backtickedGlobs(route.trigger)} | ${route.skills.join(' → ')}${optional} | ${cell(route.note)} |`;
  });

  const body = [
    'When you edit a file matching a pattern below, invoke the listed skill(s). Generated from',
    '`agent-os/skills/chains.json` (multi-skill rows) and per-skill `trigger` frontmatter.',
    '',
    '| File pattern | Invoke skill(s) | Notes |',
    '| ------------ | --------------- | ----- |',
    ...rows,
  ].join('\n');

  const text = readText(path);
  const next = rewriteRegion('skill-triggers.md', text, body);
  return { path, displayPath: 'agent-os/docs/skill-triggers.md', next, changed: next !== text };
}

/** The same rows for the edit hook (`agent-os/hooks/be-edit-hooks.mjs`), so it reminds from the map. */
function buildSkillRouting(): DocResult {
  const path = join(agentOsDirectory, 'hooks', 'skill-routing.json');
  const routes = routingRoutes().map(({ chain, globs, skills, optional, note }) => ({
    ...(chain ? { chain } : {}),
    globs,
    skills,
    ...(optional.length ? { optional } : {}),
    note,
  }));
  const next = `${JSON.stringify(
    {
      description:
        "GENERATED by `pnpm agent-os:generate` from agent-os/skills/chains.json and each skill's `trigger` / `triggerNote` frontmatter — the rows of agent-os/docs/skill-triggers.md. Do not edit.",
      routes,
    },
    null,
    2,
  )}\n`;
  const text = existsSync(path) ? readText(path) : '';
  return { path, displayPath: 'agent-os/hooks/skill-routing.json', next, changed: next !== text };
}

// ── 4) be-skill-index rules table ─────────────────────────────────────────────
/** Every rule file with when Cursor attaches it, from the rule's own frontmatter. */
function buildRulesTable(): DocResult {
  const path = join(agentOsDirectory, 'skills', 'be-skill-index', 'SKILL.md');
  const rulesDirectory = join(agentOsDirectory, 'rules');
  const rows = readdirSync(rulesDirectory)
    .filter((file) => file.endsWith('.mdc'))
    .sort((left, right) => left.localeCompare(right))
    .map((file) => {
      const text = readText(join(rulesDirectory, file));
      const globs = frontmatterField(text, 'globs');
      const attaches =
        frontmatterField(text, 'alwaysApply') === 'true'
          ? 'always'
          : globs
            ? backtickedGlobs(globs)
            : 'agent-requested (by its description)';
      const description = unquote(frontmatterField(text, 'description') ?? '');
      return `| \`${file}\` | ${cell(attaches)} | ${cell(description)} |`;
    });
  const body = [
    'Generated from each `agent-os/rules/*.mdc` frontmatter — `pnpm agent-os:generate`.',
    '',
    '| Rule file | Attaches | Description |',
    '| --------- | -------- | ----------- |',
    ...rows,
  ].join('\n');
  const text = readText(path);
  const next = rewriteRegion('skills/be-skill-index/SKILL.md', text, body, 'rules');
  return {
    path,
    displayPath: 'agent-os/skills/be-skill-index/SKILL.md',
    next,
    changed: next !== text,
  };
}

/** Regenerate every derived doc. In write mode, persist changes; returns drift list. */
export function generateDocs(writeMode: boolean): string[] {
  const drift: string[] = [];
  for (const build of [
    buildSkillIndexRegion,
    buildAgentsCatalog,
    buildSkillTriggers,
    buildSkillRouting,
    buildRulesTable,
  ]) {
    const result = build();
    if (!result.changed) continue;
    if (writeMode) {
      writeFileSync(result.path, result.next);
    } else {
      drift.push(
        `drift: ${result.displayPath} out of sync with its source — run \`pnpm agent-os:generate --write\``,
      );
    }
  }
  return drift;
}

if (isMain(import.meta.url)) {
  const writeMode =
    parseCommandLine({
      args: process.argv.slice(2),
      options: { write: { type: 'boolean' }, check: { type: 'boolean' } },
    }).values.write === true;
  const drift = generateDocs(writeMode);
  for (const message of drift) console.log(`  • ${message}`);
  if (!writeMode && drift.length) process.exit(1);
  console.log(writeMode ? '✓ generated docs' : '✓ docs in sync');
}

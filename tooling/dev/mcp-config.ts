/**
 * Shared helpers for scaffolding the project MCP config (`.mcp.json`) from the committed
 * templates.
 *
 * Two committed templates, two tiers (see `docs/integrations/agentic-third-party-tooling.md`):
 *   - **Default auto-start pair** — [`.mcp.default.json`](../../.mcp.default.json):
 *     `be-codegraph` + `be-headroom`, two zero-config, agent-only servers. Declared by
 *     `pnpm setup:local`, the session-start hook, and the cloud bootstrap so they are
 *     present before the first prompt.
 *   - **On-demand set** — [`.mcp.example.json`](../../.mcp.example.json): the full set
 *     (the pair + the hosted integrations, most of which need a provider token).
 *     Scaffolded by `pnpm mcp:setup`.
 *
 * The pair in `.mcp.default.json` mirrors its entries in `.mcp.example.json`; the
 * `mcp-config` global test enforces they stay identical, so there is no drift despite the
 * two files.
 *
 * Merges are non-destructive: existing entries in `.mcp.json` are preserved and only
 * missing servers are added, so real credentials already filled into `.mcp.json` are
 * never clobbered.
 *
 * NOTE (Claude Code on the web): a cloud session's live MCP set is loaded by the
 * platform from the environment's MCP settings — NOT this `.mcp.json`. These helpers
 * scaffold the file for local MCP clients; the web environment is configured in the
 * web UI. See `docs/integrations/claude-code-web-environment.md`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(HERE, '..', '..');

/** Absolute path to the gitignored, scaffolded MCP config consumed by local clients. */
export const MCP_CONFIG_PATH = resolve(REPOSITORY_ROOT, '.mcp.json');

/** Absolute path to the committed full-set MCP template (the pair + hosted integrations). */
export const MCP_TEMPLATE_PATH = resolve(REPOSITORY_ROOT, '.mcp.example.json');

/** Absolute path to the committed default-pair template (codegraph + headroom). */
export const MCP_DEFAULT_TEMPLATE_PATH = resolve(REPOSITORY_ROOT, '.mcp.default.json');

type McpServerDefinition = Record<string, unknown>;

interface McpConfig {
  mcpServers: Record<string, McpServerDefinition>;
}

/**
 * Server keys this repository used before the `be-` prefix (18 Oct 2026), by their current key.
 * clinozy-fe declares servers of the same names with other launchers, so a client that loads
 * both repositories' configs would otherwise run one repository's server for the other.
 */
const PREVIOUS_SERVER_KEYS: ReadonlyMap<string, string> = new Map([
  ['codegraph', 'be-codegraph'],
  ['context7', 'be-context7'],
  ['headroom', 'be-headroom'],
  ['semgrep', 'be-semgrep'],
  ['sonarqube', 'be-sonarqube'],
]);

/**
 * Renames the servers a `.mcp.json` scaffolded before the prefix still declares.
 *
 * @remarks
 * Each definition (and any credential filled into it) is kept. When both keys are present,
 * the current one wins and the previous one is dropped, so no server is declared twice.
 *
 * @param servers - The `mcpServers` map read from `.mcp.json`.
 * @returns The map with every previous key renamed, and the renames as `previous → current`.
 */
export function renamePreviousServerKeys(servers: Record<string, McpServerDefinition>): {
  servers: Record<string, McpServerDefinition>;
  renamed: string[];
} {
  const renamed: string[] = [];
  const next: Record<string, McpServerDefinition> = {};
  for (const [key, definition] of Object.entries(servers)) {
    const current = PREVIOUS_SERVER_KEYS.get(key);
    if (current === undefined) {
      next[key] = definition;
      continue;
    }
    if (!(current in servers)) next[current] = definition;
    renamed.push(`${key} → ${current}`);
  }
  return { servers: next, renamed };
}

/** Outcome of an {@link ensureMcpServers} / {@link ensureDefaultMcpServers} run. */
export interface EnsureResult {
  /** Servers newly written into `.mcp.json`. */
  added: string[];
  /** Servers renamed from a key used before the `be-` prefix, as `previous → current`. */
  renamed: string[];
  /** Servers already declared in `.mcp.json` (left untouched). */
  alreadyPresent: string[];
  /** Requested keys absent from the source template (ignored). */
  missingFromTemplate: string[];
  /** Whether `.mcp.json` was modified. */
  changed: boolean;
}

function readConfig(path: string): McpConfig {
  if (!existsSync(path)) return { mcpServers: {} };
  const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<McpConfig>;
  return { mcpServers: parsed.mcpServers ?? {} };
}

function readServers(path: string, label: string): Record<string, McpServerDefinition> {
  if (!existsSync(path)) throw new Error(`${label} not found at ${path}`);
  return readConfig(path).mcpServers;
}

/** Read the full server set from the committed `.mcp.example.json` template. */
export function readTemplateServers(): Record<string, McpServerDefinition> {
  return readServers(MCP_TEMPLATE_PATH, 'MCP template (.mcp.example.json)');
}

/** Read the default-pair server set from the committed `.mcp.default.json` template. */
export function readDefaultTemplateServers(): Record<string, McpServerDefinition> {
  return readServers(MCP_DEFAULT_TEMPLATE_PATH, 'MCP default template (.mcp.default.json)');
}

/** Keys of the default auto-start pair, sourced from `.mcp.default.json`. */
export function getDefaultMcpServerKeys(): string[] {
  return Object.keys(readDefaultTemplateServers());
}

function applyServers(options: {
  source: Record<string, McpServerDefinition>;
  keys: readonly string[] | 'all';
  dryRun: boolean;
}): EnsureResult {
  const { source } = options;
  const requested = options.keys === 'all' ? Object.keys(source) : [...options.keys];
  const config = readConfig(MCP_CONFIG_PATH);
  const { servers, renamed } = renamePreviousServerKeys(config.mcpServers);
  config.mcpServers = servers;

  const added: string[] = [];
  const alreadyPresent: string[] = [];
  const missingFromTemplate: string[] = [];

  for (const key of requested) {
    if (!(key in source)) {
      missingFromTemplate.push(key);
      continue;
    }
    if (key in config.mcpServers) {
      alreadyPresent.push(key);
      continue;
    }
    config.mcpServers[key] = source[key] as McpServerDefinition;
    added.push(key);
  }

  const changed = added.length > 0 || renamed.length > 0;
  if (changed && !options.dryRun) {
    writeFileSync(MCP_CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
  }
  return { added, renamed, alreadyPresent, missingFromTemplate, changed };
}

/**
 * Ensure `.mcp.json` declares the requested servers from `.mcp.example.json`, copying
 * each definition. Existing entries are never overwritten, so this is safe to re-run.
 *
 * @param options.keys - Server keys to ensure, or `'all'` for every template server.
 * @param options.dryRun - When `true`, report what would change without writing.
 */
export function ensureMcpServers(options: {
  keys: readonly string[] | 'all';
  dryRun?: boolean;
}): EnsureResult {
  return applyServers({
    source: readTemplateServers(),
    keys: options.keys,
    dryRun: options.dryRun ?? false,
  });
}

/** Ensure the default auto-start pair (`.mcp.default.json`: codegraph + headroom) is declared. */
export function ensureDefaultMcpServers(options?: { dryRun?: boolean }): EnsureResult {
  return applyServers({
    source: readDefaultTemplateServers(),
    keys: 'all',
    dryRun: options?.dryRun ?? false,
  });
}

/** List every full-set template server alongside whether it is declared / a default. */
export function listMcpServers(): { key: string; declared: boolean; isDefault: boolean }[] {
  const template = readTemplateServers();
  const declared = readConfig(MCP_CONFIG_PATH).mcpServers;
  const defaults = new Set<string>(getDefaultMcpServerKeys());
  return Object.keys(template).map((key) => ({
    key,
    declared: key in declared,
    isDefault: defaults.has(key),
  }));
}

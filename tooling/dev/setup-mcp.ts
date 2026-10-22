#!/usr/bin/env tsx
/**
 * `pnpm mcp:setup` — scaffold the project MCP config (`.mcp.json`).
 *
 * The full set of MCP servers (be-context7, the project API server, neon, sentry, railway, aws,
 * stripe, be-semgrep, be-sonarqube, redis, postman, resend, be-codegraph, be-headroom) lives in the
 * committed template `.mcp.example.json`; the default auto-start pair (be-codegraph +
 * be-headroom) lives in `.mcp.default.json`. This command copies them into a local,
 * gitignored `.mcp.json` so the agent's MCP clients can connect. Most servers need a
 * provider token (set via env / `${VAR}` placeholders); servers whose key or CLI is
 * missing simply stay disconnected.
 *
 *   pnpm mcp:setup              # all servers (on-demand hosted integrations)
 *   pnpm mcp:setup <name>...    # only the named servers (e.g. stripe sentry redis)
 *   pnpm mcp:setup:default      # only the auto-start pair (be-codegraph + be-headroom)
 *   pnpm mcp:setup --check      # report what would change; no write
 *   pnpm mcp:setup --list       # list template servers + .mcp.json status
 *
 * Merges are non-destructive — existing `.mcp.json` entries (with real keys) are kept.
 *
 * NOTE (Claude Code on the web): a single-repository cloud session reads this `.mcp.json`; a
 * session that holds both repositories runs from their parent, which gets its own file from
 * `pnpm agent-os:session-hooks`. The Composio, Descript, and Slack MCPs are intentionally not
 * part of this project. See `docs/integrations/claude-code-web-environment.md`.
 */
import { parseCommandLine } from '@tooling/setup/common/script.js';
import chalk from 'chalk';
import { muted } from '@tooling/setup/common/logger.js';
import {
  type EnsureResult,
  ensureDefaultMcpServers,
  ensureMcpServers,
  listMcpServers,
  MCP_CONFIG_PATH,
} from './mcp-config.js';

function printHelp(): void {
  process.stdout.write(
    `${chalk.bold(`pnpm mcp:setup`)} — scaffold .mcp.json from .mcp.example.json\n\n` +
      `  pnpm mcp:setup            scaffold ALL template servers (on-demand integrations)\n` +
      `  pnpm mcp:setup <name>...  scaffold only the named servers (e.g. stripe sentry)\n` +
      `  pnpm mcp:setup:default    scaffold only be-codegraph + be-headroom (auto-start pair)\n` +
      `  pnpm mcp:setup --default  same as mcp:setup:default\n` +
      `  pnpm mcp:setup --check    dry run: report what would change, no write\n` +
      `  pnpm mcp:setup --list     list template servers and .mcp.json status\n` +
      `  pnpm mcp:setup --help     show this help\n\n` +
      `Existing .mcp.json entries are never overwritten. On Claude Code web the live MCP\n` +
      `set is configured in the web UI, not this file.\n`,
  );
}

function printList(): void {
  process.stdout.write(`${chalk.bold(`MCP servers in .mcp.example.json`)}\n`);
  for (const { key, declared, isDefault } of listMcpServers()) {
    const mark = declared ? `${chalk.green(`✓ declared`)}` : `${muted(`· absent`)}`;
    const tag = isDefault ? ` ${chalk.cyan(`(default)`)}` : '';
    process.stdout.write(`  ${mark}  ${key}${tag}\n`);
  }
  process.stdout.write(`\n${muted(`default = auto-start pair (be-codegraph + be-headroom)`)}\n`);
}

function reportResult(result: EnsureResult, dryRun: boolean): void {
  if (result.missingFromTemplate.length > 0) {
    process.stdout.write(
      `${chalk.yellow(`!`)} unknown server(s) ignored: ${result.missingFromTemplate.join(', ')} — run \`pnpm mcp:setup --list\` for valid names\n`,
    );
  }
  if (result.alreadyPresent.length > 0) {
    process.stdout.write(`${muted(`○ already declared: ${result.alreadyPresent.join(', ')}`)}\n`);
  }
  if (!result.changed) {
    process.stdout.write(`${chalk.green(`✓`)} .mcp.json already up to date — nothing to do.\n`);
    return;
  }
  if (result.renamed.length > 0)
    process.stdout.write(
      `${chalk.green(`✓`)} ${dryRun ? 'would rename' : 'renamed'}: ${result.renamed.join(', ')}\n`,
    );
  if (result.added.length > 0)
    process.stdout.write(
      `${chalk.green(`✓`)} ${dryRun ? 'would add' : 'added'}: ${result.added.join(', ')}\n`,
    );
  if (!dryRun) process.stdout.write(`${muted(`wrote ${MCP_CONFIG_PATH}`)}\n`);
}

function main(): void {
  const { values, positionals: names } = parseCommandLine({
    args: process.argv.slice(2),
    options: {
      help: { type: 'boolean', short: 'h' },
      list: { type: 'boolean' },
      check: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      default: { type: 'boolean' },
    },
    maxPositionals: Number.POSITIVE_INFINITY,
  });
  if (values.help) {
    printHelp();
    return;
  }
  if (values.list) {
    printList();
    return;
  }
  const dryRun = values.check === true || values['dry-run'] === true;
  const defaultOnly = names.length === 0 && values.default === true;

  let scope = 'full set';
  if (names.length > 0) scope = `selected: ${names.join(', ')}`;
  else if (defaultOnly) scope = 'default pair (be-codegraph + be-headroom)';

  process.stdout.write(
    `${chalk.bold(`Scaffolding .mcp.json — ${scope}${dryRun ? ' (dry run)' : ''}`)}\n`,
  );
  try {
    let result: EnsureResult;
    if (names.length > 0) result = ensureMcpServers({ keys: names, dryRun });
    else if (defaultOnly) result = ensureDefaultMcpServers({ dryRun });
    else result = ensureMcpServers({ keys: 'all', dryRun });
    reportResult(result, dryRun);
  } catch (error) {
    process.stderr.write(
      `${chalk.yellow(`mcp:setup failed`)}: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  }
}

main();

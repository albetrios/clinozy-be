#!/usr/bin/env tsx
/**
 * `pnpm tool:agent-tools` — check the agent tooling against its pins in
 * `tooling/setup/agent/tool-versions.sh`.
 *
 *   pnpm tool:agent-tools              # installed vs pin, per tool
 *   pnpm tool:agent-tools --smoke      # + start each default MCP server and list its tools
 *   pnpm tool:agent-tools --outdated   # + newest release per tool, with paste-ready pin lines
 *
 * The cloud bootstrap runs `--smoke --outdated` after installing, so every install reports
 * the versions it put on the machine, whether the MCP servers really start, and which pins
 * have a newer release waiting. Nothing here installs or upgrades: a bump is a reviewed
 * one-line PR to `tool-versions.sh` (CI installs and runs the new version before it lands).
 *
 * Exit code: 1 when a tool is missing, off its pin, or fails its smoke test — 0 otherwise.
 * An unavailable newer-release lookup (offline, blocked host) never fails the run.
 */
import { parseCommandLine } from '@tooling/setup/common/script.js';
import {
  AGENT_TOOLS,
  type AgentTool,
  buildPinLines,
  compareVersions,
  findLatestVersion,
  readInstalledVersion,
  readToolVersions,
  smokeTestMcpServer,
} from './agent-tools.js';

const { values: commandLineValues } = parseCommandLine({
  args: process.argv.slice(2),
  options: { smoke: { type: 'boolean' }, outdated: { type: 'boolean' } },
});
const runSmoke = commandLineValues.smoke === true;
const runOutdated = commandLineValues.outdated === true;

function reportPin(options: { tool: AgentTool; pinned: string | undefined }): boolean {
  const { tool, pinned } = options;
  const installed = readInstalledVersion(tool);
  const name = tool.name.padEnd(10);
  if (!pinned) {
    console.log(`✗ ${name} no ${tool.versionKey} in tool-versions.sh`);
    return false;
  }
  if (!installed) {
    console.log(
      `✗ ${name} missing (pin ${pinned}) — run bash tooling/setup/agent/install-${tool.name}.sh`,
    );
    return false;
  }
  if (installed !== pinned) {
    console.log(
      `✗ ${name} ${installed} ≠ pin ${pinned} — run bash tooling/setup/agent/install-${tool.name}.sh`,
    );
    return false;
  }
  console.log(`✓ ${name} ${installed} (at pin)`);
  return true;
}

function reportOutdated(options: { tool: AgentTool; pinned: string }): void {
  const { tool, pinned } = options;
  const latest = findLatestVersion(tool);
  const name = tool.name.padEnd(10);
  if (!latest) {
    console.log(`? ${name} newest release unknown (lookup failed — offline or host blocked)`);
    return;
  }
  if (compareVersions({ left: latest, right: pinned }) <= 0) {
    console.log(`= ${name} ${pinned} is the newest release`);
    return;
  }
  console.log(`⬆ ${name} ${pinned} → ${latest} available. To bump, set in tool-versions.sh:`);
  const lines = buildPinLines({ tool, version: latest });
  if (!lines) {
    console.log('    (release checksums unreadable — bump by hand from the release page)');
    return;
  }
  for (const line of lines) console.log(`    ${line}`);
}

async function main(): Promise<void> {
  const pins = readToolVersions();
  let healthy = true;

  console.log('Agent tools — installed vs pin (tooling/setup/agent/tool-versions.sh)');
  for (const tool of AGENT_TOOLS) {
    if (!reportPin({ tool, pinned: pins[tool.versionKey] })) healthy = false;
  }

  if (runSmoke) {
    console.log('\nMCP smoke — start each .mcp.default.json server and list its tools');
    for (const tool of AGENT_TOOLS) {
      if (!tool.mcpServer) continue;
      const result = await smokeTestMcpServer(tool.mcpServer);
      console.log(`${result.passed ? '✓' : '✗'} ${tool.mcpServer.padEnd(10)} ${result.detail}`);
      if (!result.passed) healthy = false;
    }
  }

  if (runOutdated) {
    console.log('\nUpgrades — newest release vs pin (report only; bump by PR)');
    for (const tool of AGENT_TOOLS) {
      const pinned = pins[tool.versionKey];
      if (pinned) reportOutdated({ tool, pinned });
    }
  }

  process.exitCode = healthy ? 0 : 1;
}

void main();

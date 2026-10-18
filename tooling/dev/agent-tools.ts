/**
 * The agent tooling the cloud bootstrap installs, and the checks that keep it trustworthy.
 *
 * Every version lives in one file, [`tool-versions.sh`](../setup/agent/tool-versions.sh) —
 * plain `KEY=value` lines that the `install-*.sh` scripts source and CI appends to
 * `$GITHUB_ENV`. This module reads that file and answers three questions for
 * `pnpm tool:agent-tools` (see `check-agent-tools.ts`):
 *   - **Installed vs pin** — is each tool on this machine the pinned version?
 *   - **Smoke** — do the MCP servers in `.mcp.default.json` start and list their tools?
 *   - **Outdated** — is a newer release out, and what lines would bump the pin
 *     (version plus release checksums for downloaded binaries)?
 *
 * Network lookups use `curl` and `git ls-remote` (both honor the cloud agent proxy) and the
 * hosts the default Trusted allowlist already reaches: the npm registry, PyPI, and github.com
 * tags + release downloads (`api.github.com` and "latest release" pages are blocked there).
 */
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDefaultTemplateServers } from './mcp-config.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(HERE, '..', '..');

/** Absolute path to the pinned tool versions (`KEY=value` lines). */
export const TOOL_VERSIONS_PATH = resolve(REPOSITORY_ROOT, 'tooling/setup/agent/tool-versions.sh');

/** How long one network lookup or MCP handshake may take before it counts as failed. */
const LOOKUP_TIMEOUT_MILLISECONDS = 30_000;

/** Where a tool's newest release is looked up. */
export type LatestReleaseSource =
  | { kind: 'npm'; packageName: string }
  | { kind: 'pypi'; packageName: string }
  | {
      kind: 'github';
      /** `owner/name` on github.com. */
      repository: string;
      /** The release asset listing every artifact's SHA-256, by version. */
      checksumsFile: (version: string) => string;
      /** Pin key → the release artifact whose SHA-256 it holds, by version. */
      checksumAssets: Readonly<Record<string, (version: string) => string>>;
    };

/** One tool pinned in `tool-versions.sh`. */
export type AgentTool = {
  /** The command name, also the `install-<name>.sh` suffix. */
  name: string;
  /** The `tool-versions.sh` key holding the pinned version. */
  versionKey: string;
  /** Prints the installed version (the first `x.y.z` in its output is taken). */
  versionCommand: readonly string[];
  /** Where `--outdated` looks up the newest release. */
  latestRelease: LatestReleaseSource;
  /** The `.mcp.default.json` server this tool backs — smoke-tested with an MCP handshake. */
  mcpServer?: string;
};

/**
 * The pinned agent tools, one per `*_VERSION` key in `tool-versions.sh` and one
 * `tooling/setup/agent/install-<name>.sh` each.
 *
 * @remarks
 * The `agent-tool-versions` policy test keeps this list, the pin file and the installers in
 * step: a tool added to one without the others fails it.
 */
export const AGENT_TOOLS: readonly AgentTool[] = [
  {
    name: 'codegraph',
    versionKey: 'CODEGRAPH_VERSION',
    versionCommand: ['codegraph', '--version'],
    latestRelease: { kind: 'npm', packageName: '@colbymchenry/codegraph' },
    mcpServer: 'be-codegraph',
  },
  {
    name: 'headroom',
    versionKey: 'HEADROOM_VERSION',
    versionCommand: ['headroom', '--version'],
    latestRelease: { kind: 'pypi', packageName: 'headroom-ai' },
    mcpServer: 'be-headroom',
  },
  {
    name: 'semgrep',
    versionKey: 'SEMGREP_VERSION',
    versionCommand: ['semgrep', '--version'],
    latestRelease: { kind: 'pypi', packageName: 'semgrep' },
  },
  {
    name: 'gitleaks',
    versionKey: 'GITLEAKS_VERSION',
    versionCommand: ['gitleaks', 'version'],
    latestRelease: {
      kind: 'github',
      repository: 'gitleaks/gitleaks',
      checksumsFile: (version) =>
        `https://github.com/gitleaks/gitleaks/releases/download/v${version}/gitleaks_${version}_checksums.txt`,
      checksumAssets: {
        GITLEAKS_SHA256_LINUX_X64: (version) => `gitleaks_${version}_linux_x64.tar.gz`,
        GITLEAKS_SHA256_LINUX_ARM64: (version) => `gitleaks_${version}_linux_arm64.tar.gz`,
      },
    },
  },
  {
    name: 'k6',
    versionKey: 'K6_VERSION',
    versionCommand: ['k6', 'version'],
    latestRelease: {
      kind: 'github',
      repository: 'grafana/k6',
      checksumsFile: (version) =>
        `https://github.com/grafana/k6/releases/download/v${version}/k6-v${version}-checksums.txt`,
      checksumAssets: {
        K6_SHA256_LINUX_AMD64: (version) => `k6-v${version}-linux-amd64.tar.gz`,
        K6_SHA256_LINUX_ARM64: (version) => `k6-v${version}-linux-arm64.tar.gz`,
      },
    },
  },
];

const VERSION_PATTERN = /\d+\.\d+\.\d+/;

/**
 * Parses `tool-versions.sh`: every `KEY=value` line, comments and blank lines skipped.
 *
 * @remarks
 * The file is deliberately this simple (no quotes, no expansions) so bash `source` and
 * GitHub Actions' `$GITHUB_ENV` read it unchanged; a line outside that shape is ignored here
 * and rejected by the `agent-tool-versions` policy test.
 */
export function parseToolVersions(content: string): Record<string, string> {
  const versions: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const match = /^([A-Z][A-Z0-9_]*)=(\S+)$/.exec(line.trim());
    if (match?.[1] && match[2]) versions[match[1]] = match[2];
  }
  return versions;
}

/** Reads and parses the committed `tool-versions.sh`. */
export function readToolVersions(): Record<string, string> {
  return parseToolVersions(readFileSync(TOOL_VERSIONS_PATH, 'utf8'));
}

/** Orders two `x.y.z` versions: negative when `left` is older, 0 when equal, positive when newer. */
export function compareVersions(options: { left: string; right: string }): number {
  const left = options.left.split('.').map(Number);
  const right = options.right.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** The installed version of a tool (first `x.y.z` its version command prints), or undefined. */
export function readInstalledVersion(tool: AgentTool): string | undefined {
  const [command, ...commandArguments] = tool.versionCommand;
  if (!command) return undefined;
  const result = spawnSync(command, commandArguments, { encoding: 'utf8' });
  if (result.error || result.status !== 0) return undefined;
  return VERSION_PATTERN.exec(`${result.stdout}${result.stderr}`)?.[0];
}

/** Fetches a URL with curl (proxy-aware); undefined on any failure. */
function fetchText(url: string): string | undefined {
  const result = spawnSync('curl', ['-fsSL', '--max-time', '15', url], {
    encoding: 'utf8',
    timeout: LOOKUP_TIMEOUT_MILLISECONDS,
    // PyPI's JSON lists every release (semgrep's is several MB) — past the 1 MB default.
    maxBuffer: 64 * 1024 * 1024,
  });
  return result.status === 0 ? result.stdout : undefined;
}

/** The newest stable `x.y.z` tag of a github.com repository, via `git ls-remote`. */
function findLatestGitTag(repository: string): string | undefined {
  const result = spawnSync(
    'git',
    ['ls-remote', '--tags', '--refs', `https://github.com/${repository}`],
    { encoding: 'utf8', timeout: LOOKUP_TIMEOUT_MILLISECONDS },
  );
  if (result.status !== 0) return undefined;
  const versions = result.stdout
    .split('\n')
    .map((line) => /refs\/tags\/v?(\d+\.\d+\.\d+)$/.exec(line.trim())?.[1])
    .filter((version): version is string => version !== undefined);
  return versions.sort((left, right) => compareVersions({ left, right })).at(-1);
}

/**
 * The newest stable release of a tool, or undefined when the lookup fails (offline, blocked
 * host, unexpected response).
 *
 * @remarks
 * npm and PyPI report their own latest stable version; github.com tags are filtered to plain
 * `x.y.z` (pre-releases skipped) because the "latest release" API is blocked on the default
 * cloud allowlist.
 */
export function findLatestVersion(tool: AgentTool): string | undefined {
  const source = tool.latestRelease;
  try {
    if (source.kind === 'npm') {
      const body = fetchText(
        `https://registry.npmjs.org/${source.packageName.replace('/', '%2F')}/latest`,
      );
      return body ? (JSON.parse(body) as { version?: string }).version : undefined;
    }
    if (source.kind === 'pypi') {
      const body = fetchText(`https://pypi.org/pypi/${source.packageName}/json`);
      return body ? (JSON.parse(body) as { info?: { version?: string } }).info?.version : undefined;
    }
    return findLatestGitTag(source.repository);
  } catch {
    return undefined;
  }
}

/**
 * The `tool-versions.sh` lines that pin a tool to `version`: its version key, plus — for a
 * github.com binary — each `*_SHA256_*` key read from that release's checksums file.
 *
 * @remarks
 * Returns undefined when a checksum cannot be read: a bump must never land with a missing
 * or guessed hash, since the installers refuse a download that does not match it.
 */
export function buildPinLines(options: { tool: AgentTool; version: string }): string[] | undefined {
  const { tool, version } = options;
  const lines = [`${tool.versionKey}=${version}`];
  if (tool.latestRelease.kind !== 'github') return lines;
  const checksums = fetchText(tool.latestRelease.checksumsFile(version));
  if (!checksums) return undefined;
  for (const [key, assetName] of Object.entries(tool.latestRelease.checksumAssets)) {
    const asset = assetName(version);
    const hash = checksums
      .split('\n')
      .map((line) => line.trim().split(/\s+/))
      .find(([, file]) => file === asset)?.[0];
    if (!(hash && /^[0-9a-f]{64}$/.test(hash))) return undefined;
    lines.push(`${key}=${hash}`);
  }
  return lines;
}

/** Outcome of one MCP handshake. */
export type SmokeResult = { passed: boolean; detail: string };

/**
 * Starts a `.mcp.default.json` server exactly as an MCP client would (its command + args,
 * from the repository root), sends `initialize` + `tools/list`, and passes when the server
 * lists at least one tool before the timeout.
 *
 * @remarks
 * Failure modes it catches: the command is not on PATH (the ENOENT that kept `codegraph`
 * from starting in cloud sessions), the server crashes on start, or it answers without
 * tools. The child is always killed afterwards; nothing is written to disk.
 */
export function smokeTestMcpServer(serverName: string): Promise<SmokeResult> {
  const definition = readDefaultTemplateServers()[serverName] as
    | { command?: string; args?: string[] }
    | undefined;
  if (!definition?.command) {
    return Promise.resolve({ passed: false, detail: `not declared in .mcp.default.json` });
  }
  const { command, args = [] } = definition;
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, { cwd: REPOSITORY_ROOT, stdio: ['pipe', 'pipe', 'ignore'] });
    let output = '';
    let settled = false;
    const finish = (result: SmokeResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      resolvePromise(result);
    };
    const timer = setTimeout(
      () => finish({ passed: false, detail: 'no tools/list answer before the timeout' }),
      LOOKUP_TIMEOUT_MILLISECONDS,
    );
    child.on('error', (error) => finish({ passed: false, detail: error.message }));
    child.on('exit', (code) => finish({ passed: false, detail: `exited early (code ${code})` }));
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
      const lines = output.split('\n');
      // The last element is an unfinished line (or ''); keep it for the next chunk.
      output = lines.pop() ?? '';
      for (const line of lines) {
        let message: { id?: unknown; result?: { tools?: { name: string }[] } };
        try {
          message = JSON.parse(line);
        } catch {
          continue; // A log line, not JSON-RPC.
        }
        const tools = message.id === 2 ? message.result?.tools : undefined;
        if (tools && tools.length > 0) {
          finish({
            passed: true,
            detail: `${tools.length} tool(s): ${tools.map((tool) => tool.name).join(', ')}`,
          });
        }
      }
    });
    const requests = [
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'agent-tools-smoke', version: '1.0.0' },
        },
      },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    ];
    child.stdin.write(`${requests.map((request) => JSON.stringify(request)).join('\n')}\n`);
  });
}

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { SetupError } from './setup-error.js';

const environmentSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  nodeEnvironment: z.enum(['development', 'production']),
  // `protected` mirrors the GitHub branch-protection status used by deploy
  // gates (`development` and `production` are protected by default;
  // ephemeral / preview environments may set `protected: false`). Single trunk:
  // every environment deploys from `git.defaultBranch`, so there is no
  // per-environment branch.
  protected: z.boolean(),
  isDefault: z.boolean().optional(),
});

// A GitHub Environment that is not a deploy target: it receives only `keys`, read from its
// `source` environment's `.env.<source>` file, and the source environment stops receiving them.
// For a job that needs one secret without the deploy environment's approval gate or its other
// secrets — the restore drills' Neon API key. No `.env.<name>` file and no NODE_ENV value.
const scopedEnvironmentSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]*$/),
  source: z.string().min(1),
  keys: z
    .array(z.string().regex(/^[A-Z][A-Z0-9_]*$/))
    .min(1)
    .refine((keys) => new Set(keys).size === keys.length, 'keys must be unique'),
  purpose: z.string().min(1),
});

const projectArtifactsSchema = z.object({
  apiImage: z.string().min(1),
  workerImage: z.string().min(1),
  dockerLocalApiTag: z.string().min(1),
  ghcrCacheScopeApi: z.string().min(1),
  ghcrCacheScopeWorker: z.string().min(1),
});

const projectGitSchema = z.object({
  protectedBranches: z.array(z.string().min(1)).min(1).optional(),
  defaultBranch: z.string().min(1).optional(),
});

export const setupConfigSchema = z.object({
  // ─── NAMING — SINGLE SOURCE OF TRUTH ────────────────────────────────────────
  // setup.config.json is the ONE place these names are defined. Every setup script
  // MUST read them from the loaded config — never hardcode a literal:
  //   • project.name         — PROJECT NAME (slugs, image tags, JWT/TOTP issuer)
  //   • project.displayName   — human-readable PROJECT NAME (OpenAPI title, MCP, reports)
  //   • project.brandName     — the name END USERS see (email sender, passkey prompts);
  //                             defaults to displayName
  //   • environments[].name   — ENVIRONMENT NAMES (the only valid env identifiers;
  //                             alias maps like dev→development only NORMALIZE input)
  // Change a name here and re-run `pnpm tool:generate-project-identity`.
  //
  // Scope: this file configures this repository's OWN tooling only — project identity
  // (`pnpm tool:generate-project-identity`) and GitHub repo/environment sync
  // (`pnpm github:sync`). It is NOT runtime config: the app reads `.env.<environment>`
  // validated by `src/shared/config/env-schema.ts` and never loads this file.
  project: z.object({
    name: z.string().min(1),
    displayName: z.string().min(1),
    // The product name END USERS see: the email sender name and the passkey (WebAuthn)
    // prompt. Defaults to `displayName`; set it when the display name is an internal one
    // such as "Acme Backend" and users should see just "Acme".
    brandName: z.string().min(1).optional(),
    // Slugs and GitHub owners this project used BEFORE a rename. The identity gate fails on
    // any of them left in the tree, in any casing or separator (`acme-be`, `ACME_BE`,
    // `AcmeBe`) and, for a backend slug, on its old database name in Postgres settings and
    // connection strings. `pnpm init:project` appends to both lists on every rename.
    previousNames: z.array(z.string().min(1)).optional(),
    previousOwners: z.array(z.string().min(1)).optional(),
    // npm package name. Defaults to `name`; set explicitly only when the npm
    // name must differ from the project slug (e.g. a scoped `@organization/api` name).
    packageName: z.string().min(1).optional(),
    // package.json `description`. Defaults to the committed description when
    // omitted so an adopting fork is not forced to invent one immediately.
    description: z.string().min(1).optional(),
    // Paired frontend repository name, referenced by docs and comments that
    // describe the BE↔FE contract (CORS origins, invitation links, shared Sonar
    // server). Defaults to this slug with a `-be` suffix swapped for `-fe`.
    frontendName: z.string().min(1).optional(),
    artifacts: projectArtifactsSchema.optional(),
  }),
  git: projectGitSchema.optional(),
  environments: z.array(environmentSchema).min(1),
  scopedEnvironments: z.array(scopedEnvironmentSchema).optional(),
  providers: z.object({
    github: z.object({
      enabled: z.boolean(),
      repository: z.string().regex(/^[^/]+\/[^/]+$/),
      // CODEOWNERS roster. Defaults to the owner segment of `repository`, which
      // is correct for a personal repo. Set explicitly for an organization repo
      // or to seed the ≥2 owners that `github:tool:governance-mode team` needs.
      owners: z.array(z.string().min(1)).min(1).optional(),
    }),
  }),
});

const CONFIG_PATH = resolve(import.meta.dirname, '../setup.config.json');

type ParsedSetupConfig = z.infer<typeof setupConfigSchema>;

function buildDefaultArtifacts(
  projectSlug: string,
): NonNullable<ParsedSetupConfig['project']['artifacts']> {
  return {
    apiImage: `${projectSlug}-api`,
    workerImage: `${projectSlug}-worker`,
    dockerLocalApiTag: projectSlug,
    ghcrCacheScopeApi: `${projectSlug}-api`,
    ghcrCacheScopeWorker: `${projectSlug}-worker`,
  };
}

function normalizeLoadedConfig(config: ParsedSetupConfig): ParsedSetupConfig {
  const artifacts = config.project.artifacts ?? buildDefaultArtifacts(config.project.name);
  const defaultBranch = config.git?.defaultBranch ?? 'main';
  const protectedBranches = config.git?.protectedBranches ?? [defaultBranch];
  const { github } = config.providers;
  const owners = github.owners ?? [repositoryOwner(github.repository)];

  return {
    ...config,
    project: {
      ...config.project,
      artifacts,
      packageName: config.project.packageName ?? config.project.name,
    },
    git: { protectedBranches, defaultBranch },
    scopedEnvironments: config.scopedEnvironments ?? [],
    providers: { ...config.providers, github: { ...github, owners } },
  };
}

/** The `owner` segment of an `owner/repo` slug. */
export function repositoryOwner(repository: string): string {
  return repository.split('/')[0] ?? repository;
}

/** The `repo` segment of an `owner/repo` slug. */
export function repositoryName(repository: string): string {
  return repository.split('/')[1] ?? repository;
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

/** Load config if file exists and is valid. Returns null when missing or invalid (for init defaults). */
export function loadConfigIfExists(): z.infer<typeof setupConfigSchema> | null {
  if (!existsSync(CONFIG_PATH)) return null;
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    const result = setupConfigSchema.safeParse(parsed);
    if (!result.success) {
      return null;
    }

    return normalizeLoadedConfig(result.data);
  } catch {
    return null;
  }
}

export function loadConfig(): z.infer<typeof setupConfigSchema> {
  const config = loadConfigIfExists();
  if (!config) {
    throw new SetupError(`Config file not found or invalid: ${CONFIG_PATH}`, {
      hint: 'Create tooling/setup/setup.config.json (copy an existing project config and edit names/environments).',
    });
  }
  return config;
}

export function getEnvironmentNames(config: z.infer<typeof setupConfigSchema>): string[] {
  return config.environments.map((environment) => environment.name);
}

/** Every GitHub Environment the manifest declares: the deploy environments, then the scoped ones. */
export function getGithubEnvironmentNames(config: z.infer<typeof setupConfigSchema>): string[] {
  return [
    ...getEnvironmentNames(config),
    ...(config.scopedEnvironments ?? []).map((scoped) => scoped.name),
  ];
}

/** Which `.env.<source>` file a GitHub Environment is synced from, and which of its keys it gets. */
export interface EnvironmentKeyScope {
  /** The environment whose `.env.<source>` file supplies the values. */
  readonly sourceEnvironment: string;
  /** A scoped environment's keys — the only ones it receives; `null` for every other environment. */
  readonly includeKeys: readonly string[] | null;
  /** Keys a scoped environment takes from this one, which this environment therefore never gets. */
  readonly excludeKeys: readonly string[];
}

/**
 * The key scope `github:sync` applies to one GitHub Environment.
 *
 * @remarks
 * A scoped environment reads its source's file and keeps only its `keys`; a deploy environment
 * reads its own file minus every key a scoped environment takes from it, so each key reaches
 * exactly one GitHub Environment. A name the manifest does not declare reads its own file whole.
 */
export function resolveEnvironmentKeyScope(
  config: z.infer<typeof setupConfigSchema>,
  environment: string,
): EnvironmentKeyScope {
  const scopedEnvironments = config.scopedEnvironments ?? [];
  const scoped = scopedEnvironments.find((candidate) => candidate.name === environment);
  if (scoped) {
    return { sourceEnvironment: scoped.source, includeKeys: scoped.keys, excludeKeys: [] };
  }
  return {
    sourceEnvironment: environment,
    includeKeys: null,
    excludeKeys: scopedEnvironments
      .filter((candidate) => candidate.source === environment)
      .flatMap((candidate) => candidate.keys),
  };
}

/** Whether `key` is synced to the environment that `scope` describes. */
export function isKeyInEnvironmentScope(scope: EnvironmentKeyScope, key: string): boolean {
  if (scope.includeKeys !== null && !scope.includeKeys.includes(key)) return false;
  return !scope.excludeKeys.includes(key);
}

/**
 * The manifest's exact text, as committed.
 *
 * @remarks
 * `saveConfig` writes the PARSED config, with schema defaults filled in, so it cannot put a
 * manifest back unchanged. A caller that may need to undo its own write (`init:project` after a
 * failed rename) keeps this text and hands it to {@link restoreConfigText}.
 */
export function readConfigText(): string {
  return readFileSync(CONFIG_PATH, 'utf-8');
}

/** Writes back text from {@link readConfigText}, byte for byte. */
export function restoreConfigText(text: string): void {
  writeFileSync(CONFIG_PATH, text, 'utf-8');
}

/**
 * Persists the config back to `tooling/setup/setup.config.json`. This file
 * doubles as the saved "answers" for project / organization / branches /
 * environments — when the user re-runs the sync they see the
 * previously chosen values as defaults and don't have to re-enter them.
 */
export function saveConfig(config: z.infer<typeof setupConfigSchema>): void {
  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
  // `JSON.stringify` and Biome disagree on array wrapping, so an unformatted
  // manifest fails `pnpm lint` — the first gate an adopting team runs after
  // `pnpm init:project`. Best-effort: the write already succeeded, and `pnpm
  // format` fixes any residue, so a missing Biome must not fail the save.
  try {
    execFileSync('npx', ['biome', 'format', '--write', CONFIG_PATH], {
      cwd: resolve(import.meta.dirname, '../../..'),
      stdio: 'ignore',
    });
  } catch {
    // Formatting is cosmetic; leave the valid JSON in place.
  }
}

/**
 * Loads environment variables from the project root before any module reads `process.env`.
 *
 * This loader is the ONE place that reads `NODE_ENV` outside `env-schema.ts`: it runs before the
 * schema is parsed and its whole job is to load `.env.<NODE_ENV>` by name. It never branches runtime
 * behaviour on `NODE_ENV` — behaviour is driven by explicit env flags validated in the schema.
 *
 * Convention: a single file named `.env.<NODE_ENV>` per environment. The enum is
 * `local | development | production`; `NODE_ENV` defaults to `local` when unset (matching the env
 * schema default), so `.env.local` is the primary file for a stock `pnpm dev` — an unset NODE_ENV is
 * a developer's machine. The two DEPLOY targets set NODE_ENV explicitly (`development` / `production`,
 * via `pnpm github:sync`), so the local default never reaches a deployed runtime. The files are
 * gitignored — `.env.example`
 * (committed) is the canonical template; `pnpm setup:local` scaffolds a self-contained `.env.local`,
 * and `pnpm github:sync` creates missing `.env.<environment>` files (the two DEPLOY targets,
 * `development` / `production`) from `tooling/setup/setup.config.json` and pushes values.
 *
 * `.env.local` (gitignored, machine-specific) plays TWO roles, both handled by the single loader
 * below: (1) the PRIMARY file when `NODE_ENV=local`, and (2) a per-machine OVERRIDE layered on top of
 * `.env.development` / `.env.production` with `override: true` (the `!== primary` check below collapses
 * these — when `NODE_ENV=local` the override step is skipped because primary already IS `.env.local`).
 * A developer can point `DATABASE_URL` / `REDIS_URL` at their local Docker Compose stack
 * (`pnpm compose:up`) via either role. It is gitignored AND excluded from the Docker image
 * (`.dockerignore`), and production config is platform-injected (never a file) — so `.env.local`
 * is physically absent in production; the loader needs no `NODE_ENV` guard to keep it out.
 *
 * Empty values (`KEY=` in the file) are stripped from `process.env` so optional Zod
 * fields see `undefined` instead of `""` (which fails `.string().min(1).optional()`) — but only
 * when the value IN EFFECT is empty. A value the shell already set (a cloud environment's
 * Variables, a `KEY=… pnpm dev`) survives a blank placeholder in a file loaded without
 * `override`: `.env.local` is scaffolded from `.env.example`, full of `KEY=` lines, and those
 * used to delete exactly the values a cloud session supplied.
 */
import { config, type DotenvParseOutput } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = process.cwd();

const SAFE_KEY = /^[A-Z][A-Z0-9_]*$/;

/**
 * Loads one env file into `process.env`, then unsets every key the file names whose value in
 * effect is empty. Without `override` the shell wins, blank file line or not.
 *
 * @param envFilePath - absolute path of the `.env.*` file
 * @param override - whether the file's values replace ones already in `process.env`
 */
export function applyDotenvFile({
  envFilePath,
  override = false,
}: {
  envFilePath: string;
  override?: boolean | undefined;
}): void {
  const result = config({ path: envFilePath, override });
  const parsed: DotenvParseOutput = result.parsed ?? {};
  for (const key of Object.keys(parsed)) {
    if (!SAFE_KEY.test(key)) continue;
    // eslint-disable-next-line security/detect-object-injection -- key validated against /^[A-Z][A-Z0-9_]*$/ above
    if (process.env[key] === '') {
      // eslint-disable-next-line security/detect-object-injection -- key validated against /^[A-Z][A-Z0-9_]*$/ above
      delete process.env[key];
    }
  }
}

function loadEnvFiles(): void {
  // Read NODE_ENV ONLY to name the primary file (`.env.<NODE_ENV>`) — no comparison, no branch.
  const nodeEnv = process.env.NODE_ENV ?? 'local';
  const primary = resolve(projectRoot, `.env.${nodeEnv}`);
  if (existsSync(primary)) {
    applyDotenvFile({ envFilePath: primary });
  }

  // `.env.local` is a machine-local override layered on top of the primary (`override: true`). When
  // `NODE_ENV=local` it IS the primary, so the `!== primary` check skips this step (no double-load) —
  // `.env.local` then stands alone. It is gitignored AND excluded from the Docker image
  // (`.dockerignore`: `.env.*`), and production config is platform-injected (never a file) — so
  // `.env.local` is physically absent in production and this never runs there. No NODE_ENV guard needed.
  const localOverride = resolve(projectRoot, '.env.local');
  if (localOverride !== primary && existsSync(localOverride)) {
    applyDotenvFile({ envFilePath: localOverride, override: true });
  }
}

loadEnvFiles();

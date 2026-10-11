import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

const configurationDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(configurationDirectory, '..', '..');
/** The live provider specs, run only by `pnpm test:contract:live` (real sandbox calls). */
const LIVE_PROVIDER_SPECS = 'src/tests/contract/**/*.live.contract.test.ts';
const liveProviderRun = process.env.LIVE_PROVIDER_CONTRACTS === 'true';

/**
 * Contract tests require lexical mocks + nock bootstrap in setup (see
 * `contract-vitest-setup.ts`) and are run via `pnpm test:contract` only —
 * excluded from the default Vitest graph. `pnpm test:contract:live` runs the
 * `*.live.contract.test.ts` specs instead, which `pnpm test:contract` (and CI) never run.
 */
export default defineConfig({
  root: projectRoot,
  test: {
    globals: true,
    globalSetup: [resolve(projectRoot, 'src/tests/global-setup.ts')],
    setupFiles: [
      resolve(projectRoot, 'src/tests/setup.ts'),
      resolve(projectRoot, 'src/tests/contract/contract-vitest-setup.ts'),
    ],
    include: liveProviderRun ? [LIVE_PROVIDER_SPECS] : ['src/tests/contract/**/*.test.ts'],
    // Real sandbox round trips (Stripe's lifecycle is a dozen of them) outlast the 5 s default.
    // The marker is what the harness checks: live mode runs only under this config, never the main one.
    ...(liveProviderRun
      ? { testTimeout: 120_000, env: { LIVE_PROVIDER_CONTRACT_CONFIG: 'true' } }
      : {}),
    exclude: liveProviderRun
      ? configDefaults.exclude
      : [...configDefaults.exclude, LIVE_PROVIDER_SPECS],
    /** Preload nock in fork workers so `http`/`https` are patched before Stripe loads (see nock ESM docs). */
    execArgv: ['--import=nock'],
    server: {
      deps: {
        external: ['stripe', 'resend', '@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'],
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(projectRoot, 'src'),
      '@tooling': resolve(projectRoot, 'tooling'),
    },
  },
});

import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

// One stable, gitignored directory: Playwright re-loads this config in every worker, so a
// per-load temp directory split artifacts and results.json across folders.
const outputDirectory =
  process.env.BROWSER_TEST_REPORT_DIR ?? join(process.cwd(), 'browser-test-report');

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  outputDir: join(outputDirectory, 'artifacts'),
  reporter: [['list'], ['json', { outputFile: join(outputDirectory, 'results.json') }]],
  use: {
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});

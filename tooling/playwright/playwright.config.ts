import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

const outputDirectory =
  process.env.BROWSER_TEST_REPORT_DIR ?? mkdtempSync(join(tmpdir(), 'backend-browser-evidence-'));

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

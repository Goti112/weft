import { defineConfig, devices } from '@playwright/test';
export default defineConfig({ testDir: './tests', fullyParallel: false, workers: 1, timeout: 60_000,
  expect: { timeout: 20_000 }, retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { ...devices['Desktop Chrome'], baseURL: process.env.WEFT_BASE_URL ?? 'http://localhost:8080', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});

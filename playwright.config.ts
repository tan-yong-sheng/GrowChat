import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e/frontend',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: 'list',
  use: {
    baseURL:
      process.env.TEST_URL || process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:8787',
    trace: 'on-first-retry',
    screenshot: 'on',
    video: 'on-first-retry',
  },
  projects: [
    {
      name: 'setup',
      testMatch: [/auth\.setup\.spec\.ts/],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-guest',
      use: { ...devices['Desktop Chrome'] },
      testMatch: [
        /auth\.spec\.ts/,
        /bootstrap\.spec\.ts/,
        /auth-workflows\.spec\.ts/,
        /accessibility\.spec\.ts/,
      ],
    },
    {
      name: 'chromium-auth',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/fixtures/auth-state.json',
      },
      testMatch: [/chat\.spec\.ts/, /admin-settings\.spec\.ts/, /visual-regression\.spec\.ts/],
    },
  ],
});

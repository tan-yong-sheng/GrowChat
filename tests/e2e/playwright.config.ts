import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e/frontend',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.TEST_URL || 'http://localhost:8787',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium-guest',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-auth',
      use: {
        ...devices['Desktop Chrome'],
        storageState: './tests/e2e/fixtures/auth-state.json',
      },
    },
  ],
});

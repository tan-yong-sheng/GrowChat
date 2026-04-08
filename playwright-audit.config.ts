import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e/frontend',
  fullyParallel: false,
  forbidOnly: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:8787',
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium-auth',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/fixtures/auth-state.json',
      },
    },
  ],
  webServer: undefined,
});

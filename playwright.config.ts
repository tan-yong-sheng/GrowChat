import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e/frontend',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://127.0.0.1:3007',
    trace: 'on-first-retry',
    screenshot: 'on',
    video: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium-guest',
      use: { ...devices['Desktop Chrome'] },
      testMatch: [/auth\.spec\.ts/, /bootstrap\.spec\.ts/],
    },
    {
      name: 'chromium-auth',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/fixtures/auth-state.json',
      },
      testMatch: [/chat\.spec\.ts/, /realtime\.spec\.ts/, /ui-logic\.spec\.ts/, /visual\.spec\.ts/, /models-settings\.spec\.ts/, /admin-settings\.spec\.ts/, /admin-users\.spec\.ts/, /admin-policies\.spec\.ts/],
    },
    {
      name: 'mobile-auth',
      use: {
        ...devices['Pixel 5'],
        storageState: 'tests/e2e/fixtures/auth-state.json',
      },
      testMatch: [/ui-logic\.spec\.ts/, /visual\.spec\.ts/],
    },
    {
      name: 'debug',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:8787' },
      testMatch: [/debug.*\.spec\.ts/],
    },
  ],
  webServer: {
    command: 'python3 -m http.server 3007 --bind 127.0.0.1 --directory public',
    url: 'http://127.0.0.1:3007',
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 120000,
  },
});

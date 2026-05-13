import { defineConfig, devices } from '@playwright/test';
import { resolveTestUrl } from './tests/shared/test-env.js';

const env = (globalThis as any).process?.env ?? {};
const baseURL = resolveTestUrl();
const authStorageStatePath = '.playwright/auth-state.json';

export default defineConfig({
  globalSetup: './tests/shared/playwright-global-setup.js',
  testDir: './tests/e2e/frontend',
  fullyParallel: true,
  forbidOnly: !!env.CI,
  retries: env.CI ? 2 : 0,
  workers: env.CI ? 1 : 2,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'on',
    video: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium-guest',
      use: { ...devices['Desktop Chrome'] },
      testMatch: [/auth\.spec\.ts/],
    },
    {
      name: 'chromium-auth',
      use: {
        ...devices['Desktop Chrome'],
        storageState: authStorageStatePath,
      },
      testMatch: [/chat\.spec\.ts/, /admin-settings\.spec\.ts/],
    },
    {
      name: 'chromium-visual',
      use: { ...devices['Desktop Chrome'] },
      testMatch: [/button-responsive\.spec\.ts/],
    },
  ],
  webServer: {
    command: 'python3 -m http.server 3007 --bind 127.0.0.1 --directory public',
    url: 'http://127.0.0.1:3007',
    reuseExistingServer: !env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 120000,
  },
});

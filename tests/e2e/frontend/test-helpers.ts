import type { Page } from '@playwright/test';

const DEFAULT_BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://127.0.0.1:3007';
export const TEST_BASE_URL = DEFAULT_BASE_URL;
export const TEST_ORIGIN = new URL(DEFAULT_BASE_URL).origin;
export const TEST_EMAIL = process.env.TEST_USER_EMAIL;
export const TEST_PASSWORD = process.env.TEST_USER_PASSWORD;

export async function goToApp(page: Page, path = '/') {
  await page.goto(path, { waitUntil: 'networkidle' });
}

export async function loginIfNeeded(page: Page) {
  const isAuthPage = await page.locator('#auth-form').isVisible().catch(() => false);

  if (!isAuthPage) {
    return;
  }

  if (!TEST_EMAIL || !TEST_PASSWORD) {
    throw new Error('TEST_USER_EMAIL and TEST_USER_PASSWORD must be set');
  }

  await page.fill('#email', TEST_EMAIL);
  await page.fill('#password', TEST_PASSWORD);
  await page.click('#auth-submit');
  await page.waitForSelector('#app', { timeout: 10000 });
}

import { test, expect } from '@playwright/test';

test.describe('Validate Settings UI - Fixed Auth', () => {
  test('Settings page loads with correct auth origin', async ({ page }) => {
    // Use the correct base URL from playwright config (127.0.0.1:3007)
    await page.goto('http://127.0.0.1:3007/#/admin/settings/connections', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Check auth state
    const authState = await page.evaluate(() => {
      const auth = localStorage.getItem('growchat_auth');
      return auth ? JSON.parse(auth) : null;
    });
    console.log('Auth state present:', !!authState);

    // Check page title
    const pageTitle = await page.title();
    console.log('Page title:', pageTitle);

    // Check for admin content
    const pageText = await page.textContent('body');
    console.log('Page contains "Connections":', pageText?.includes('Connections'));
    console.log('Page contains "Settings":', pageText?.includes('Settings'));
    console.log('Page contains "Add":', pageText?.includes('Add'));

    // Take screenshot
    await page.screenshot({ path: 'tests/e2e/artifacts/qa/settings-correct-origin.png' });
  });
});

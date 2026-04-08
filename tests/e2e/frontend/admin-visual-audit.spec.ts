import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:8787';

test.describe('Admin Visual Consistency Audit', () => {
  test.beforeEach(async ({ page }) => {
    // Auth state is already loaded from fixture, just navigate to admin
    await page.goto(`${BASE_URL}/admin/users/overview`);
    await page.waitForLoadState('networkidle');
  });

  test('Admin Users Overview - Desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(`${BASE_URL}/admin/users/overview`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/audit-01-users-overview-1024.png', fullPage: true });
  });

  test('Admin Users Overview - Tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(`${BASE_URL}/admin/users/overview`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/audit-01-users-overview-768.png', fullPage: true });
  });

  test('Admin Users Overview - Mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${BASE_URL}/admin/users/overview`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/audit-01-users-overview-375.png', fullPage: true });
  });

  test('Admin Users Roles - Desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(`${BASE_URL}/admin/users/roles`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/audit-02-users-roles-1024.png', fullPage: true });
  });

  test('Admin Users Roles - Tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(`${BASE_URL}/admin/users/roles`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/audit-02-users-roles-768.png', fullPage: true });
  });

  test('Admin Users Roles - Mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${BASE_URL}/admin/users/roles`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/audit-02-users-roles-375.png', fullPage: true });
  });

  test('Admin Settings Models - Desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(`${BASE_URL}/admin/settings/models`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/audit-03-settings-models-1024.png', fullPage: true });
  });

  test('Admin Settings Models - Tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(`${BASE_URL}/admin/settings/models`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/audit-03-settings-models-768.png', fullPage: true });
  });

  test('Admin Settings Models - Mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${BASE_URL}/admin/settings/models`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/audit-03-settings-models-375.png', fullPage: true });
  });

  test('Admin Settings Connections - Desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(`${BASE_URL}/admin/settings/connections`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/audit-04-settings-connections-1024.png', fullPage: true });
  });

  test('Admin Settings Connections - Tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(`${BASE_URL}/admin/settings/connections`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/audit-04-settings-connections-768.png', fullPage: true });
  });

  test('Admin Settings Connections - Mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${BASE_URL}/admin/settings/connections`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/audit-04-settings-connections-375.png', fullPage: true });
  });

  test('Admin System General - Desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto(`${BASE_URL}/admin/system/general`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/audit-05-system-general-1024.png', fullPage: true });
  });

  test('Admin System General - Tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(`${BASE_URL}/admin/system/general`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/audit-05-system-general-768.png', fullPage: true });
  });

  test('Admin System General - Mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${BASE_URL}/admin/system/general`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/audit-05-system-general-375.png', fullPage: true });
  });

  test('Collect UI Element Analysis', async ({ page }) => {
    const pages = [
      '/admin/users/overview',
      '/admin/users/roles',
      '/admin/settings/models',
      '/admin/settings/connections',
      '/admin/system/general',
    ];

    const analysis = {};

    for (const pageUrl of pages) {
      await page.goto(`${BASE_URL}${pageUrl}`);
      await page.waitForLoadState('networkidle');

      const pageAnalysis = await page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        const inputs = document.querySelectorAll('input, textarea, select');
        const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        const icons = document.querySelectorAll('svg');
        const tables = document.querySelectorAll('table');
        const modals = document.querySelectorAll('[role="dialog"], .modal, .drawer');

        const buttonClasses = Array.from(buttons).map(b => b.className).slice(0, 3);
        const inputClasses = Array.from(inputs).map(i => i.className).slice(0, 3);
        const headingStyles = Array.from(headings).map(h => ({
          tag: h.tagName,
          class: h.className,
          fontSize: window.getComputedStyle(h).fontSize,
        })).slice(0, 3);

        return {
          buttonCount: buttons.length,
          buttonClasses,
          inputCount: inputs.length,
          inputClasses,
          headingCount: headings.length,
          headingStyles,
          iconCount: icons.length,
          tableCount: tables.length,
          modalCount: modals.length,
        };
      });

      analysis[pageUrl] = pageAnalysis;
    }

    console.log('UI Element Analysis:', JSON.stringify(analysis, null, 2));
  });
});

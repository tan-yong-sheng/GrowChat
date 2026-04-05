import { expect, test } from '@playwright/test';
import { renderAdminRoute, setupAdminPage } from './admin-test-helpers';

test.describe('Admin system security tab', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminPage(page);
  });

  test('renders both general and security tabs in system subnav', async ({ page }) => {
    await renderAdminRoute(page, '/admin/system/general');

    // Wait for the system tabs container to be visible
    await expect(page.locator('#system-tabs-container')).toBeVisible({ timeout: 15000 });

    // Check that both tabs are present
    const generalTab = page.locator('a[href="/admin/system/general"]');
    const securityTab = page.locator('a[href="/admin/system/security"]');

    await expect(generalTab).toBeVisible();
    await expect(securityTab).toBeVisible();

    // Verify tab labels
    await expect(generalTab).toContainText('General');
    await expect(securityTab).toContainText('Security');
  });

  test('navigates to security tab when clicked', async ({ page }) => {
    await renderAdminRoute(page, '/admin/system/general');

    await expect(page.locator('#system-tabs-container')).toBeVisible({ timeout: 15000 });

    const securityTab = page.locator('a[href="/admin/system/security"]');
    await securityTab.click();

    // Verify URL changed to security tab
    await expect(page).toHaveURL(/\/admin\/system\/security/);
  });

  test('navigates back to general tab when clicked', async ({ page }) => {
    await renderAdminRoute(page, '/admin/system/security');

    await expect(page.locator('#system-tabs-container')).toBeVisible({ timeout: 15000 });

    const generalTab = page.locator('a[href="/admin/system/general"]');
    await generalTab.click();

    // Verify URL changed back to general tab
    await expect(page).toHaveURL(/\/admin\/system\/general/);
  });
});

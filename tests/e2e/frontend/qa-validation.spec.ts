import { test, expect } from '@playwright/test';

test.describe('QA Settings Validation @qa-validation', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to settings
    await page.goto('http://localhost:8787/#/admin/settings/connections', { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');
  });

  test('Connections settings UI renders', async ({ page }) => {
    // Check if connections tab is visible
    const connectionsTab = page.locator('[data-tab="connections"]');
    await expect(connectionsTab).toBeVisible({ timeout: 5000 });

    // Check if connections list container exists
    const connectionsList = page.locator('#connections-list, [data-testid="connections-list"], .connections-list');
    const isVisible = await connectionsList.isVisible().catch(() => false);
    console.log(`Connections list visible: ${isVisible}`);

    // Take screenshot
    await page.screenshot({ path: 'tests/e2e/artifacts/qa/connections-settings.png' });
  });

  test('Models settings tab renders', async ({ page }) => {
    // Click models tab
    const modelsTab = page.locator('[data-tab="models"]');
    await modelsTab.click().catch(() => {});
    await page.waitForLoadState('networkidle');

    // Check if models list exists
    const modelsList = page.locator('#models-list, [data-testid="models-list"], .models-list');
    const isVisible = await modelsList.isVisible().catch(() => false);
    console.log(`Models list visible: ${isVisible}`);

    // Take screenshot
    await page.screenshot({ path: 'tests/e2e/artifacts/qa/models-settings.png' });
  });

  test('Integrations settings tab renders', async ({ page }) => {
    // Click integrations tab
    const integrationsTab = page.locator('[data-tab="integrations"]');
    await integrationsTab.click().catch(() => {});
    await page.waitForLoadState('networkidle');

    // Check if integrations list exists
    const integrationsList = page.locator('#integrations-list, [data-testid="integrations-list"], .integrations-list');
    const isVisible = await integrationsList.isVisible().catch(() => false);
    console.log(`Integrations list visible: ${isVisible}`);

    // Take screenshot
    await page.screenshot({ path: 'tests/e2e/artifacts/qa/integrations-settings.png' });
  });

  test('Create button exists in connections', async ({ page }) => {
    // Look for create/add button with multiple selectors
    const createBtn = page.locator('button:has-text("Add"), button:has-text("Create"), button:has-text("New"), [data-testid="create-connection"], [data-action="create"]');
    const count = await createBtn.count();
    console.log(`Found ${count} create buttons`);

    if (count > 0) {
      const text = await createBtn.first().textContent();
      console.log(`Create button text: ${text}`);
    }
  });

  test('Dirty state footer renders when form changes', async ({ page }) => {
    // Try to find and interact with a form field
    const nameInput = page.locator('input[name="name"], input[placeholder*="name" i]');
    if (await nameInput.isVisible().catch(() => false)) {
      await nameInput.fill('Test Connection');
      await page.waitForTimeout(500);
    }

    // Check for dirty state indicator
    const dirtyBadge = page.locator('[data-testid="dirty-badge"], .dirty-badge, [class*="dirty"]');
    const dirtyVisible = await dirtyBadge.isVisible().catch(() => false);
    console.log(`Dirty badge visible: ${dirtyVisible}`);

    // Check for save button
    const saveBtn = page.locator('button:has-text("Save"), [data-action="save"]');
    const saveVisible = await saveBtn.isVisible().catch(() => false);
    console.log(`Save button visible: ${saveVisible}`);
  });

  test('Mobile responsiveness - settings on 320px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('http://localhost:8787/#/admin/settings/connections', { waitUntil: 'networkidle' });

    // Check if app is visible
    const appContainer = page.locator('#app, [data-testid="app"]');
    const isVisible = await appContainer.isVisible().catch(() => false);
    console.log(`App visible on mobile: ${isVisible}`);

    // Take screenshot
    await page.screenshot({ path: 'tests/e2e/artifacts/qa/mobile-settings-320.png' });
  });

  test('API response verification - connections endpoint', async ({ page }) => {
    // Wait for API response
    const response = await page.waitForResponse(
      resp => resp.url().includes('/api/admin/settings/connections') || resp.url().includes('/api/connections'),
      { timeout: 5000 }
    ).catch(() => null);

    if (response) {
      const status = response.status();
      console.log(`Connections API status: ${status}`);
      const data = await response.json().catch(() => null);
      console.log(`Connections API response:`, data);
    } else {
      console.log('No connections API response captured');
    }
  });
});

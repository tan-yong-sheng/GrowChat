import { test, expect, Page } from '@playwright/test';

/**
 * Sequential Visual QA Testing for GrowChat Settings
 *
 * This test runs sequentially through each settings tab,
 * capturing screenshots at each step for visual analysis.
 * Screenshots are analyzed with AI Vision to identify rendering issues.
 */

test.describe('Settings Module - Sequential Visual QA', () => {
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto('http://127.0.0.1:3007', { waitUntil: 'networkidle' });
    await page.waitForSelector('#app', { timeout: 5000 }).catch(() => {});
  });

  test.afterEach(async () => {
    await page.close();
  });

  test('Sequential: Connections Settings - Full Flow', async () => {
    console.log('\n=== CONNECTIONS SETTINGS TEST ===\n');

    // Step 1: Navigate to connections
    console.log('Step 1: Navigating to connections settings...');
    await page.goto('http://127.0.0.1:3007/#/admin/settings/connections', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    let screenshot = await page.screenshot({ path: 'tests/e2e/artifacts/qa/01-connections-page-load.png', fullPage: true });
    console.log('✓ Screenshot: 01-connections-page-load.png');

    // Step 2: Check for connections list
    console.log('\nStep 2: Looking for connections list...');
    const connectionsList = page.locator('[data-testid="connections-list"], [data-connections-scroll], .connections-container, [role="list"]');
    const listVisible = await connectionsList.isVisible().catch(() => false);
    console.log(`Connections list visible: ${listVisible}`);

    screenshot = await page.screenshot({ path: 'tests/e2e/artifacts/qa/02-connections-list-check.png', fullPage: true });
    console.log('✓ Screenshot: 02-connections-list-check.png');

    // Step 3: Look for create button
    console.log('\nStep 3: Looking for create connection button...');
    const createButtons = page.locator('button');
    const buttonCount = await createButtons.count();
    console.log(`Total buttons found: ${buttonCount}`);

    // Log button texts
    for (let i = 0; i < Math.min(5, buttonCount); i++) {
      const text = await createButtons.nth(i).textContent();
      console.log(`  Button ${i}: "${text}"`);
    }

    screenshot = await page.screenshot({ path: 'tests/e2e/artifacts/qa/03-connections-buttons.png', fullPage: true });
    console.log('✓ Screenshot: 03-connections-buttons.png');

    // Step 4: Check for form elements
    console.log('\nStep 4: Looking for form elements...');
    const inputs = page.locator('input');
    const inputCount = await inputs.count();
    console.log(`Input fields found: ${inputCount}`);

    const textareas = page.locator('textarea');
    const textareaCount = await textareas.count();
    console.log(`Textarea fields found: ${textareaCount}`);

    screenshot = await page.screenshot({ path: 'tests/e2e/artifacts/qa/04-connections-form-elements.png', fullPage: true });
    console.log('✓ Screenshot: 04-connections-form-elements.png');

    // Step 5: Check page structure
    console.log('\nStep 5: Analyzing page structure...');
    const pageContent = await page.content();
    const hasSettingsTab = pageContent.includes('settings-tab') || pageContent.includes('connections');
    console.log(`Page contains settings/connections references: ${hasSettingsTab}`);

    const hasModal = pageContent.includes('modal') || pageContent.includes('dialog');
    console.log(`Page contains modal/dialog references: ${hasModal}`);
  });

  test('Sequential: Models Settings - Full Flow', async () => {
    console.log('\n=== MODELS SETTINGS TEST ===\n');

    // Step 1: Navigate to models
    console.log('Step 1: Navigating to models settings...');
    await page.goto('http://127.0.0.1:3007/#/admin/settings/models', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    let screenshot = await page.screenshot({ path: 'tests/e2e/artifacts/qa/05-models-page-load.png', fullPage: true });
    console.log('✓ Screenshot: 05-models-page-load.png');

    // Step 2: Check for models list
    console.log('\nStep 2: Looking for models list...');
    const modelsList = page.locator('[data-testid="models-list"], [data-models-scroll], .models-container, [role="list"]');
    const listVisible = await modelsList.isVisible().catch(() => false);
    console.log(`Models list visible: ${listVisible}`);

    screenshot = await page.screenshot({ path: 'tests/e2e/artifacts/qa/06-models-list-check.png', fullPage: true });
    console.log('✓ Screenshot: 06-models-list-check.png');

    // Step 3: Look for toggle buttons
    console.log('\nStep 3: Looking for model toggle buttons...');
    const toggles = page.locator('button[role="switch"], [data-testid*="toggle"]');
    const toggleCount = await toggles.count();
    console.log(`Toggle buttons found: ${toggleCount}`);

    if (toggleCount > 0) {
      const firstToggle = toggles.first();
      const ariaPressed = await firstToggle.getAttribute('aria-pressed');
      console.log(`First toggle aria-pressed: ${ariaPressed}`);
    }

    screenshot = await page.screenshot({ path: 'tests/e2e/artifacts/qa/07-models-toggles.png', fullPage: true });
    console.log('✓ Screenshot: 07-models-toggles.png');

    // Step 4: Check for legacy staged indicators
    console.log('\nStep 4: Checking legacy staged indicators...');
    const legacyBadge = page.locator('[data-testid="models-dirty"], #models-dirty, .dirty-badge');
    const legacyVisible = await legacyBadge.isVisible().catch(() => false);
    console.log(`Legacy staged indicator visible: ${legacyVisible}`);

    screenshot = await page.screenshot({ path: 'tests/e2e/artifacts/qa/08-models-state-indicator.png', fullPage: true });
    console.log('✓ Screenshot: 08-models-state-indicator.png');

    // Step 5: Look for save button
    console.log('\nStep 5: Looking for save action controls...');
    const saveBtn = page.locator('#save-models-top, button:has-text("Save")');
    const saveBtnVisible = await saveBtn.isVisible().catch(() => false);
    console.log(`Save button visible: ${saveBtnVisible}`);

    if (saveBtnVisible) {
      const isDisabled = await saveBtn.first().isDisabled();
      console.log(`Save button disabled: ${isDisabled}`);
    }

    screenshot = await page.screenshot({ path: 'tests/e2e/artifacts/qa/09-models-save-button.png', fullPage: true });
    console.log('✓ Screenshot: 09-models-save-button.png');
  });

  test('Sequential: Integrations Settings - Full Flow', async () => {
    console.log('\n=== INTEGRATIONS SETTINGS TEST ===\n');

    // Step 1: Navigate to integrations
    console.log('Step 1: Navigating to integrations settings...');
    await page.goto('http://127.0.0.1:3007/#/admin/settings/integrations', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    let screenshot = await page.screenshot({ path: 'tests/e2e/artifacts/qa/10-integrations-page-load.png', fullPage: true });
    console.log('✓ Screenshot: 10-integrations-page-load.png');

    // Step 2: Check for servers list
    console.log('\nStep 2: Looking for tool servers list...');
    const serversList = page.locator('[data-testid="servers-list"], [data-integrations-scroll], .integrations-container, [role="list"]');
    const listVisible = await serversList.isVisible().catch(() => false);
    console.log(`Servers list visible: ${listVisible}`);

    screenshot = await page.screenshot({ path: 'tests/e2e/artifacts/qa/11-integrations-list-check.png', fullPage: true });
    console.log('✓ Screenshot: 11-integrations-list-check.png');

    // Step 3: Look for server toggles
    console.log('\nStep 3: Looking for server toggle buttons...');
    const toggles = page.locator('button[role="switch"]');
    const toggleCount = await toggles.count();
    console.log(`Toggle buttons found: ${toggleCount}`);

    screenshot = await page.screenshot({ path: 'tests/e2e/artifacts/qa/12-integrations-toggles.png', fullPage: true });
    console.log('✓ Screenshot: 12-integrations-toggles.png');

    // Step 4: Look for create button
    console.log('\nStep 4: Looking for create server button...');
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    console.log(`Total buttons found: ${buttonCount}`);

    for (let i = 0; i < Math.min(5, buttonCount); i++) {
      const text = await buttons.nth(i).textContent();
      if (text && text.toLowerCase().includes('add') || text.toLowerCase().includes('new')) {
        console.log(`  Found button: "${text}"`);
      }
    }

    screenshot = await page.screenshot({ path: 'tests/e2e/artifacts/qa/13-integrations-buttons.png', fullPage: true });
    console.log('✓ Screenshot: 13-integrations-buttons.png');

    // Step 5: Look for dirty badge
    console.log('\nStep 5: Looking for dirty state indicator...');
    const dirtyBadge = page.locator('[data-testid="integrations-dirty"], #integrations-dirty, .dirty-badge');
    const badgeVisible = await dirtyBadge.isVisible().catch(() => false);
    console.log(`Dirty badge visible: ${badgeVisible}`);

    screenshot = await page.screenshot({ path: 'tests/e2e/artifacts/qa/14-integrations-dirty-badge.png', fullPage: true });
    console.log('✓ Screenshot: 14-integrations-dirty-badge.png');
  });

  test('Sequential: Mobile Responsiveness - Connections', async () => {
    console.log('\n=== MOBILE RESPONSIVENESS TEST ===\n');

    // Test on mobile viewport
    console.log('Step 1: Setting mobile viewport (375x667)...');
    await page.setViewportSize({ width: 375, height: 667 });

    console.log('Step 2: Navigating to connections on mobile...');
    await page.goto('http://127.0.0.1:3007/#/admin/settings/connections', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    let screenshot = await page.screenshot({ path: 'tests/e2e/artifacts/qa/15-mobile-connections-375.png', fullPage: true });
    console.log('✓ Screenshot: 15-mobile-connections-375.png');

    // Test on small mobile viewport
    console.log('\nStep 3: Setting small mobile viewport (320x568)...');
    await page.setViewportSize({ width: 320, height: 568 });

    console.log('Step 4: Navigating to models on small mobile...');
    await page.goto('http://127.0.0.1:3007/#/admin/settings/models', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    screenshot = await page.screenshot({ path: 'tests/e2e/artifacts/qa/16-mobile-models-320.png', fullPage: true });
    console.log('✓ Screenshot: 16-mobile-models-320.png');

    // Test on tablet viewport
    console.log('\nStep 5: Setting tablet viewport (768x1024)...');
    await page.setViewportSize({ width: 768, height: 1024 });

    console.log('Step 6: Navigating to integrations on tablet...');
    await page.goto('http://127.0.0.1:3007/#/admin/settings/integrations', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    screenshot = await page.screenshot({ path: 'tests/e2e/artifacts/qa/17-tablet-integrations-768.png', fullPage: true });
    console.log('✓ Screenshot: 17-tablet-integrations-768.png');
  });
});

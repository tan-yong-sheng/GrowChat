import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:8787';
const TEST_EMAIL = 'tys203831@gmail.com';
const TEST_PASSWORD = '&Test1234';

test.describe('Admin Settings & My Settings - Saving Issues', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto(`${BASE_URL}/auth.html`);
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Sign in")');
    await page.waitForURL(`${BASE_URL}/`);
  });

  test('01: My Settings - Integrations tab save flow', async ({ page }) => {
    // Open My Settings
    await page.click('[data-profile-menu-trigger]');
    await page.waitForTimeout(300);
    await page.click('text=Settings');
    await page.waitForSelector('[data-settings-modal-body]');

    // Navigate to Integrations tab
    await page.click('button:has-text("Integrations")');
    await page.waitForTimeout(500);

    // Take screenshot
    await page.screenshot({ path: '.playwright-cli/01-my-settings-integrations.png' });

    // Find and toggle a server
    const serverToggle = await page.$('.server-toggle');
    if (serverToggle) {
      await serverToggle.click();
      await page.waitForTimeout(300);

      // Check Save button state
      const saveBtn = await page.$('#save-integrations');
      const isSaveEnabled = saveBtn && !(await saveBtn.isDisabled());
      console.log('Save button enabled:', isSaveEnabled);

      if (isSaveEnabled) {
        // Click Save and monitor
        await saveBtn.click();

        // Monitor for stuck state
        let savingCount = 0;
        for (let i = 0; i < 10; i++) {
          await page.waitForTimeout(500);
          const btnText = await saveBtn.textContent();
          if (btnText?.includes('Saving...')) {
            savingCount++;
          }
          console.log(`[${i * 500}ms] Button text: "${btnText}"`);
        }

        if (savingCount > 5) {
          console.error('❌ ISSUE: Save button stuck at "Saving..."');
          await page.screenshot({ path: '.playwright-cli/02-my-settings-saving-stuck.png' });
        } else {
          console.log('✅ Save completed successfully');
        }
      }
    }
  });

  test('02: Admin Settings - Integrations tab save flow', async ({ page }) => {
    // Navigate to admin settings
    await page.goto(`${BASE_URL}/admin/settings/integrations`);
    await page.waitForSelector('[data-settings-tab="integrations"]', { timeout: 5000 });

    // Take screenshot
    await page.screenshot({ path: '.playwright-cli/03-admin-integrations.png' });

    // Find and toggle a server
    const serverToggles = await page.$$('.server-toggle');
    console.log('Found server toggles:', serverToggles.length);

    if (serverToggles.length > 0) {
      await serverToggles[0].click();
      await page.waitForTimeout(300);

      // Check Save button
      const saveBtn = await page.$('#save-integrations');
      const isSaveEnabled = saveBtn && !(await saveBtn.isDisabled());
      console.log('Admin Save button enabled:', isSaveEnabled);

      if (isSaveEnabled) {
        await saveBtn.click();

        // Monitor for stuck state
        let savingCount = 0;
        for (let i = 0; i < 10; i++) {
          await page.waitForTimeout(500);
          const btnText = await saveBtn.textContent();
          if (btnText?.includes('Saving...')) {
            savingCount++;
          }
          console.log(`[Admin ${i * 500}ms] Button text: "${btnText}"`);
        }

        if (savingCount > 5) {
          console.error('❌ ISSUE: Admin Save button stuck at "Saving..."');
          await page.screenshot({ path: '.playwright-cli/04-admin-saving-stuck.png' });
        } else {
          console.log('✅ Admin Save completed successfully');
        }
      }
    }
  });

  test('03: Check console for escapeSelector error', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Open My Settings
    await page.click('[data-profile-menu-trigger]');
    await page.waitForTimeout(300);
    await page.click('text=Settings');
    await page.waitForSelector('[data-settings-modal-body]');

    // Wait for any errors
    await page.waitForTimeout(2000);

    const escapeSelectorError = errors.find(e => e.includes('escapeSelector'));
    if (escapeSelectorError) {
      console.error('❌ FOUND: escapeSelector error:', escapeSelectorError);
    } else {
      console.log('✅ No escapeSelector errors found');
    }
  });
});

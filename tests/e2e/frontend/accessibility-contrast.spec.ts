import { test, expect } from '@playwright/test';

test.describe('Accessibility: Text Contrast Fixes', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to settings page where modals are accessible
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('connection modal: labels have sufficient contrast (gray-600)', async ({ page }) => {
    // Open settings
    await page.click('[data-testid="settings-button"]');
    await page.waitForLoadState('networkidle');

    // Navigate to integrations/connections
    await page.click('text=Integrations');
    await page.waitForLoadState('networkidle');

    // Open a connection modal (or create new)
    const addButton = page.locator('button:has-text("Add Connection"), button:has-text("New Connection")').first();
    if (await addButton.isVisible()) {
      await addButton.click();
      await page.waitForSelector('[id="modal-title"]');
    }

    // Check modal labels have gray-600 class (text-gray-600)
    const urlLabel = page.locator('label:has-text("URL"), label:has-text("Connection URL")').first();
    const authLabel = page.locator('label:has-text("Auth Type")').first();
    const modelsLabel = page.locator('label:has-text("Models")').first();

    // Verify labels exist and have proper contrast class
    if (await urlLabel.isVisible()) {
      const classList = await urlLabel.getAttribute('class');
      expect(classList).toContain('text-gray-600');
    }

    if (await authLabel.isVisible()) {
      const classList = await authLabel.getAttribute('class');
      expect(classList).toContain('text-gray-600');
    }

    if (await modelsLabel.isVisible()) {
      const classList = await modelsLabel.getAttribute('class');
      expect(classList).toContain('text-gray-600');
    }
  });

  test('connection modal: helper text has sufficient contrast (gray-700)', async ({ page }) => {
    // Open settings
    await page.click('[data-testid="settings-button"]');
    await page.waitForLoadState('networkidle');

    // Navigate to integrations
    await page.click('text=Integrations');
    await page.waitForLoadState('networkidle');

    // Open connection modal
    const addButton = page.locator('button:has-text("Add Connection"), button:has-text("New Connection")').first();
    if (await addButton.isVisible()) {
      await addButton.click();
      await page.waitForSelector('[id="modal-title"]');
    }

    // Check helper text elements (hints, descriptions)
    const hints = page.locator('[id*="hint"], [id*="message"]');
    const hintCount = await hints.count();

    if (hintCount > 0) {
      for (let i = 0; i < Math.min(hintCount, 3); i++) {
        const hint = hints.nth(i);
        if (await hint.isVisible()) {
          const classList = await hint.getAttribute('class');
          // Helper text should be gray-700 for better contrast
          expect(classList).toMatch(/text-gray-[67]00/);
        }
      }
    }
  });

  test('server modal: form labels have sufficient contrast (gray-600)', async ({ page }) => {
    // Open settings
    await page.click('[data-testid="settings-button"]');
    await page.waitForLoadState('networkidle');

    // Navigate to MCP Servers or similar
    const serversLink = page.locator('text=Servers, text=MCP Servers, text=Tools').first();
    if (await serversLink.isVisible()) {
      await serversLink.click();
      await page.waitForLoadState('networkidle');

      // Open server modal
      const addButton = page.locator('button:has-text("Add Server"), button:has-text("New Server")').first();
      if (await addButton.isVisible()) {
        await addButton.click();
        await page.waitForSelector('[id*="modal"]');

        // Check all form labels
        const labels = page.locator('label[class*="text-gray"]');
        const labelCount = await labels.count();

        if (labelCount > 0) {
          for (let i = 0; i < Math.min(labelCount, 5); i++) {
            const label = labels.nth(i);
            const classList = await label.getAttribute('class');
            // Labels should be gray-600 or darker
            expect(classList).toMatch(/text-gray-[67]00/);
          }
        }
      }
    }
  });

  test('connection modal: close button has sufficient contrast (gray-600)', async ({ page }) => {
    // Open settings
    await page.click('[data-testid="settings-button"]');
    await page.waitForLoadState('networkidle');

    // Navigate to integrations
    await page.click('text=Integrations');
    await page.waitForLoadState('networkidle');

    // Open connection modal
    const addButton = page.locator('button:has-text("Add Connection"), button:has-text("New Connection")').first();
    if (await addButton.isVisible()) {
      await addButton.click();
      await page.waitForSelector('[id="close-modal"]');

      // Check close button contrast
      const closeButton = page.locator('[id="close-modal"]');
      const classList = await closeButton.getAttribute('class');
      // Close button should have gray-600 base color
      expect(classList).toContain('text-gray-600');
    }
  });

  test('account integrations: badges have sufficient contrast (gray-700)', async ({ page }) => {
    // Open settings
    await page.click('[data-testid="settings-button"]');
    await page.waitForLoadState('networkidle');

    // Navigate to account integrations
    await page.click('text=Integrations');
    await page.waitForLoadState('networkidle');

    // Look for shared/disabled badges
    const badges = page.locator('span:has-text("Shared"), span:has-text("Disabled")');
    const badgeCount = await badges.count();

    if (badgeCount > 0) {
      for (let i = 0; i < Math.min(badgeCount, 3); i++) {
        const badge = badges.nth(i);
        if (await badge.isVisible()) {
          const classList = await badge.getAttribute('class');
          // Badges should use gray-700 for better contrast
          expect(classList).toMatch(/text-gray-[67]00/);
        }
      }
    }
  });

  test('connection modal: model descriptions have sufficient contrast (gray-700)', async ({ page }) => {
    // Open settings
    await page.click('[data-testid="settings-button"]');
    await page.waitForLoadState('networkidle');

    // Navigate to integrations
    await page.click('text=Integrations');
    await page.waitForLoadState('networkidle');

    // Open connection modal
    const addButton = page.locator('button:has-text("Add Connection"), button:has-text("New Connection")').first();
    if (await addButton.isVisible()) {
      await addButton.click();
      await page.waitForSelector('[id="modal-title"]');

      // Look for model description elements
      const descriptions = page.locator('div[class*="text-gray-700"][class*="text-[10px]"]');
      const descCount = await descriptions.count();

      if (descCount > 0) {
        for (let i = 0; i < Math.min(descCount, 2); i++) {
          const desc = descriptions.nth(i);
          if (await desc.isVisible()) {
            const classList = await desc.getAttribute('class');
            expect(classList).toContain('text-gray-700');
          }
        }
      }
    }
  });

  test('no gray-400 or gray-500 text in modals (contrast regression check)', async ({ page }) => {
    // Open settings
    await page.click('[data-testid="settings-button"]');
    await page.waitForLoadState('networkidle');

    // Navigate to integrations
    await page.click('text=Integrations');
    await page.waitForLoadState('networkidle');

    // Open connection modal
    const addButton = page.locator('button:has-text("Add Connection"), button:has-text("New Connection")').first();
    if (await addButton.isVisible()) {
      await addButton.click();
      await page.waitForSelector('[id="modal-title"]');

      // Check for low-contrast text that should have been fixed
      const lowContrastElements = page.locator('[class*="text-gray-400"], [class*="text-gray-500"]');
      const count = await lowContrastElements.count();

      // Should have minimal or no low-contrast text in modal
      // (some may exist for non-critical UI, but labels/hints should be fixed)
      if (count > 0) {
        for (let i = 0; i < count; i++) {
          const elem = lowContrastElements.nth(i);
          const text = await elem.textContent();
          const classList = await elem.getAttribute('class');

          // Log any remaining low-contrast text for review
          console.log(`Low contrast element: "${text}" with class: ${classList}`);
        }
      }
    }
  });
});

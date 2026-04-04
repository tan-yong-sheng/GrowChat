import { test, expect } from '@playwright/test';
import { goToApp, loginIfNeeded } from './test-helpers';

test.describe('Search Modal Hover State', () => {
  test('should display clear hover state on search results', async ({ page }, testInfo) => {
    await goToApp(page);
    await loginIfNeeded(page);

    await page.waitForSelector('#modal-root', { timeout: 10000 });
    await page.keyboard.press('Control+K');
    await page.waitForSelector('#modal-root:not(.hidden)', { timeout: 5000 });

    const searchInput = page.locator('#modal-search-input');
    await searchInput.fill('test');
    await page.waitForSelector('[data-search-chat]', { timeout: 5000 });

    const firstResult = page.locator('[data-search-chat]').first();
    await page.screenshot({ path: testInfo.outputPath('search-modal-before-hover.png') });
    await firstResult.hover();
    await page.waitForTimeout(100);
    await page.screenshot({ path: testInfo.outputPath('search-modal-hover.png') });

    const hoverStyle = await firstResult.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(100);
    const normalStyle = await firstResult.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    await page.screenshot({ path: testInfo.outputPath('search-modal-after-hover.png') });

    expect(hoverStyle).not.toBe('rgba(0, 0, 0, 0)');
    expect(hoverStyle).not.toBe('transparent');
    expect(hoverStyle).not.toBe(normalStyle);
    expect(normalStyle).toBeTruthy();
  });
});

import { test, expect } from '@playwright/test';
import { goToApp, loginIfNeeded } from './test-helpers';

test.describe('Search Modal Selected State Verification', () => {
  test('should display clear selected state with blue background and left border', async ({ page }, testInfo) => {
    await goToApp(page);
    await loginIfNeeded(page);
    await page.waitForSelector('#modal-root', { timeout: 10000 });
    await page.keyboard.press('Control+K');
    await page.waitForSelector('#modal-root:not(.hidden)', { timeout: 10000 });

    const searchInput = page.locator('#modal-search-input');
    await searchInput.fill('test');
    await page.waitForSelector('.search-item', { timeout: 10000 });

    await page.keyboard.press('ArrowDown');

    const firstItem = page.locator('.search-item').first();
    await expect(firstItem).toHaveClass(/bg-blue-50/);
    await expect(firstItem).toHaveClass(/border-l-2/);
    await expect(firstItem).toHaveClass(/border-l-blue-500/);
    await expect(firstItem).toHaveAttribute('aria-selected', 'true');

    const computedStyle = await firstItem.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        backgroundColor: style.backgroundColor,
        borderLeft: style.borderLeft,
        borderLeftColor: style.borderLeftColor,
      };
    });

    expect(computedStyle.backgroundColor).toBeTruthy();
    expect(computedStyle.borderLeft).toBeTruthy();
    expect(computedStyle.borderLeftColor).toBeTruthy();

    await page.screenshot({ path: testInfo.outputPath('search-modal-selected-state.png') });

    await page.keyboard.press('ArrowDown');
    await expect(firstItem).not.toHaveClass(/bg-blue-50/);

    const secondItem = page.locator('.search-item').nth(1);
    await expect(secondItem).toHaveClass(/bg-blue-50/);

    await page.keyboard.press('ArrowUp');
    await expect(firstItem).toHaveClass(/bg-blue-50/);

    await page.screenshot({ path: testInfo.outputPath('search-modal-selected-state-final.png') });
  });

  test('should show selected state on hover', async ({ page }) => {
    await goToApp(page);
    await loginIfNeeded(page);
    await page.waitForSelector('#modal-root', { timeout: 10000 });
    await page.keyboard.press('Control+K');
    await page.waitForSelector('#modal-root:not(.hidden)', { timeout: 10000 });

    const searchInput = page.locator('#modal-search-input');
    await searchInput.fill('test');
    await page.waitForSelector('.search-item', { timeout: 10000 });

    const firstItem = page.locator('.search-item').first();
    await firstItem.hover();

    await expect(firstItem).toHaveClass(/bg-blue-50/);
    await expect(firstItem).toHaveClass(/border-l-2/);
  });
});

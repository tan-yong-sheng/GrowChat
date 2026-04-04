import { test, expect } from '@playwright/test';
import { goToApp, loginIfNeeded } from './test-helpers';

test.describe('Search Modal Item Spacing Verification', () => {
  test.setTimeout(120000);

  test('should have adequate vertical spacing between search result items', async ({ page }, testInfo) => {
    await goToApp(page);
    await loginIfNeeded(page);
    await page.waitForSelector('#modal-root', { timeout: 10000 });
    await page.keyboard.press('Control+K');
    await page.waitForSelector('#modal-search-input', { timeout: 10000 });

    const searchInput = page.locator('#modal-search-input');
    await searchInput.fill('test');
    await page.waitForSelector('.search-item', { timeout: 10000 });

    await page.screenshot({ path: testInfo.outputPath('search-modal-spacing.png') });

    const searchItems = page.locator('.search-item');
    const resultItems = await searchItems.all();
    expect(resultItems.length).toBeGreaterThanOrEqual(2);

    const firstItemBox = await resultItems[0].boundingBox();
    const secondItemBox = await resultItems[1].boundingBox();
    if (!firstItemBox || !secondItemBox) {
      throw new Error('Could not measure search item bounding boxes');
    }

    const verticalSpacing = secondItemBox.y - (firstItemBox.y + firstItemBox.height);
    expect(verticalSpacing).toBeGreaterThanOrEqual(0);

    const firstItemPadding = await resultItems[0].evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        paddingTop: styles.paddingTop,
        paddingBottom: styles.paddingBottom,
      };
    });

    const paddingTopValue = parseInt(firstItemPadding.paddingTop);
    const paddingBottomValue = parseInt(firstItemPadding.paddingBottom);
    expect(paddingTopValue + paddingBottomValue).toBeGreaterThanOrEqual(8);

    const firstResult = searchItems.first();
    await firstResult.hover();

    await page.screenshot({ path: testInfo.outputPath('search-modal-spacing-hover.png') });

    const hoverStyle = await firstResult.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    expect(hoverStyle).toBeTruthy();

    await page.mouse.move(0, 0);
    await page.waitForTimeout(100);
    await page.waitForSelector('#modal-search-input', { state: 'visible' });

    await page.screenshot({ path: testInfo.outputPath('search-modal-spacing-final.png') });
  });

  test('should display search results with comfortable touch target size', async ({ page }) => {
    await goToApp(page);
    await loginIfNeeded(page);
    await page.waitForSelector('#modal-root', { timeout: 10000 });
    await page.keyboard.press('Control+K');
    await page.waitForSelector('#modal-search-input', { timeout: 10000 });

    const searchInput = page.locator('#modal-search-input');
    await searchInput.fill('chat');
    await page.waitForSelector('.search-item', { timeout: 10000 });

    const searchItems = page.locator('.search-item');
    const resultItems = await searchItems.all();

    for (let i = 0; i < Math.min(resultItems.length, 3); i++) {
      const itemBox = await resultItems[i].boundingBox();
      if (itemBox) {
        expect(itemBox.height).toBeGreaterThanOrEqual(44);
      }
    }
  });
});

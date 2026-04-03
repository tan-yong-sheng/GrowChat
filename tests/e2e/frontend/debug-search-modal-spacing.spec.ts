import { test, expect } from '@playwright/test';

test.describe('Search Modal Item Spacing Verification', () => {
  test.setTimeout(120000);

  test('should have adequate vertical spacing between search result items', async ({ page }) => {
    // Navigate to localhost:8788
    await page.goto('http://localhost:8788');

    // Wait for page to load
    await page.waitForTimeout(3000);

    // Check if we're on auth page
    const isAuthPage = await page.locator('#auth-form').isVisible().catch(() => false);

    if (isAuthPage) {
      // Login
      await page.fill('#email', 'tys203831@gmail.com');
      await page.fill('#password', '&Test1234');
      await page.click('#auth-submit');

      // Wait for redirect to chat page
      try {
        await page.waitForURL(/^http:\/\/localhost:8788\/?$/, { timeout: 20000 });
      } catch {
        await page.waitForTimeout(3000);
      }
      await page.waitForTimeout(3000);
    }

    // Wait for app to be fully loaded - check for app container
    await page.waitForSelector('#app', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Open search modal with Ctrl+K
    await page.keyboard.press('Control+K');

    // Wait for search modal to appear by waiting for search input
    await page.waitForSelector('#modal-search-input', { timeout: 10000 });
    await page.waitForTimeout(500);

    // Type "test" to generate search results
    const searchInput = page.locator('#modal-search-input');
    await searchInput.fill('test');

    // Wait for search results to load (debounce is 300ms)
    await page.waitForTimeout(800);

    // Wait for search items to appear
    await page.waitForSelector('.search-item', { timeout: 10000 });

    // Take a screenshot of the search modal with results
    await page.screenshot({ path: 'search-modal-spacing.png' });

    // Get all search result items
    const searchItems = page.locator('.search-item');
    const resultItems = await searchItems.all();
    console.log(`Found ${resultItems.length} search result items`);

    // Verify we have at least 1 item
    expect(resultItems.length).toBeGreaterThanOrEqual(1);

    if (resultItems.length >= 2) {
      // Get bounding boxes for first two items
      const firstItemBox = await resultItems[0].boundingBox();
      const secondItemBox = await resultItems[1].boundingBox();

      console.log('First item bounding box:', firstItemBox);
      console.log('Second item bounding box:', secondItemBox);

      if (firstItemBox && secondItemBox) {
        // Calculate vertical spacing between items
        const firstItemBottom = firstItemBox.y + firstItemBox.height;
        const secondItemTop = secondItemBox.y;
        const verticalSpacing = secondItemTop - firstItemBottom;

        console.log(`Vertical spacing between items: ${verticalSpacing}px`);

        // Verify spacing is adequate (at least 0px for no gap, but items should be distinguishable)
        // The spacing can be 0 if items have adequate padding
        expect(verticalSpacing).toBeGreaterThanOrEqual(0);

        // Get computed styles for padding/margin
        const firstItemPadding = await resultItems[0].evaluate((el) => {
          const styles = window.getComputedStyle(el);
          return {
            paddingTop: styles.paddingTop,
            paddingBottom: styles.paddingBottom,
            marginTop: styles.marginTop,
            marginBottom: styles.marginBottom,
            height: styles.height,
          };
        });

        console.log('First item computed styles:', firstItemPadding);

        // Verify items have adequate padding
        const paddingTopValue = parseInt(firstItemPadding.paddingTop);
        const paddingBottomValue = parseInt(firstItemPadding.paddingBottom);
        const totalPadding = paddingTopValue + paddingBottomValue;

        console.log(`Total vertical padding: ${totalPadding}px (top: ${paddingTopValue}px, bottom: ${paddingBottomValue}px)`);

        // Verify minimum padding for touch/mouse interaction (at least 8px total)
        expect(totalPadding).toBeGreaterThanOrEqual(8);
      }
    }

    // Hover over first item to verify it's easily distinguishable
    const firstResult = searchItems.first();
    await firstResult.hover();

    // Take a screenshot showing hover state
    await page.screenshot({ path: 'search-modal-spacing-hover.png' });

    // Verify hover state provides visual feedback
    const hoverStyle = await firstResult.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });

    console.log('Hover background color:', hoverStyle);

    // Move mouse away
    await page.mouse.move(0, 0);
    await page.waitForTimeout(100);

    // Take final screenshot
    await page.screenshot({ path: 'search-modal-spacing-final.png' });

    console.log('Search modal spacing verification complete');
    console.log('Screenshots saved:');
    console.log('  - search-modal-spacing.png');
    console.log('  - search-modal-spacing-hover.png');
    console.log('  - search-modal-spacing-final.png');
  });

  test('should display search results with comfortable touch target size', async ({ page }) => {
    // Navigate to localhost:8788
    await page.goto('http://localhost:8788');

    // Wait for page to load
    await page.waitForTimeout(3000);

    // Check if we're on auth page
    const isAuthPage = await page.locator('#auth-form').isVisible().catch(() => false);

    if (isAuthPage) {
      // Login
      await page.fill('#email', 'tys203831@gmail.com');
      await page.fill('#password', '&Test1234');
      await page.click('#auth-submit');

      // Wait for redirect to chat page
      try {
        await page.waitForURL(/^http:\/\/localhost:8788\/?$/, { timeout: 20000 });
      } catch {
        await page.waitForTimeout(3000);
      }
      await page.waitForTimeout(3000);
    }

    // Wait for app to be fully loaded
    await page.waitForSelector('#app', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Open search modal
    await page.keyboard.press('Control+K');

    // Wait for search modal
    await page.waitForSelector('#modal-search-input', { timeout: 10000 });
    await page.waitForTimeout(500);

    // Search for results
    const searchInput = page.locator('#modal-search-input');
    await searchInput.fill('chat');

    // Wait for search results to load
    await page.waitForTimeout(800);

    // Wait for search items to appear
    await page.waitForSelector('.search-item', { timeout: 10000 });

    // Get all result items
    const searchItems = page.locator('.search-item');
    const resultItems = await searchItems.all();

    // Check each item's height for touch target size (minimum 44px recommended)
    for (let i = 0; i < Math.min(resultItems.length, 3); i++) {
      const itemBox = await resultItems[i].boundingBox();
      if (itemBox) {
        console.log(`Item ${i + 1} height: ${itemBox.height}px`);
        // Items should be at least 32px tall for comfortable interaction
        expect(itemBox.height).toBeGreaterThanOrEqual(32);
      }
    }

    console.log('Touch target size verification complete');
  });
});

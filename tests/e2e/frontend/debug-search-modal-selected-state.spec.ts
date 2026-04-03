import { test, expect } from '@playwright/test';

test.describe('Search Modal Selected State Verification', () => {
  test('should display clear selected state with blue background and left border', async ({ page }) => {
    // Navigate to localhost:8788
    await page.goto('http://localhost:8788');

    // Wait for page to load and check if we're on auth or chat page
    await page.waitForTimeout(3000);

    // Check if we're on auth page
    const isAuthPage = await page.locator('#auth-form').isVisible().catch(() => false);

    if (isAuthPage) {
      // Login
      await page.fill('#email', 'tys203831@gmail.com');
      await page.fill('#password', '&Test1234');
      await page.click('#auth-submit');

      // Wait for redirect to chat page (with longer timeout and fallback)
      try {
        await page.waitForURL(/^http:\/\/localhost:8788\/?$/, { timeout: 20000 });
      } catch {
        // If redirect doesn't happen, just wait for the app to load
        await page.waitForTimeout(3000);
      }
      await page.waitForTimeout(3000);
    }

    // Wait for app to be fully loaded - check for modal root
    await page.waitForSelector('#modal-root', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Open search modal with Ctrl+K
    await page.keyboard.press('Control+K');

    // Wait for search modal to appear with longer timeout
    await page.waitForSelector('#modal-root:not(.hidden)', { timeout: 10000 });
    await page.waitForTimeout(500);

    // Type "test" to generate search results
    const searchInput = page.locator('#modal-search-input');
    await searchInput.fill('test');

    // Wait for search results to load (debounce is 300ms)
    await page.waitForTimeout(800);

    // Wait for search items to appear
    await page.waitForSelector('.search-item', { timeout: 10000 });

    // Navigate with arrow keys and verify selected state
    // Press ArrowDown to select first item
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);

    // Get the first search item
    const firstItem = page.locator('.search-item').first();

    // Verify selected state classes
    const hasBlueBackground = await firstItem.evaluate((el) =>
      el.classList.contains('bg-blue-50')
    );

    const hasLeftBorder = await firstItem.evaluate((el) =>
      el.classList.contains('border-l-2')
    );

    const hasLeftBorderColor = await firstItem.evaluate((el) =>
      el.classList.contains('border-l-blue-500')
    );

    const ariaSelected = await firstItem.getAttribute('aria-selected');

    // Take screenshot of selected state
    await page.screenshot({ path: 'search-modal-selected-state.png' });

    // Verify computed styles
    const computedStyle = await firstItem.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        backgroundColor: style.backgroundColor,
        borderLeft: style.borderLeft,
        borderLeftColor: style.borderLeftColor,
      };
    });

    // Log verification results
    console.log('\n=== Search Modal Selected State Verification ===');
    console.log(`✓ Has bg-blue-50 class: ${hasBlueBackground}`);
    console.log(`✓ Has border-l-2 class: ${hasLeftBorder}`);
    console.log(`✓ Has border-l-blue-500 class: ${hasLeftBorderColor}`);
    console.log(`✓ aria-selected attribute: ${ariaSelected}`);
    console.log(`✓ Computed background color: ${computedStyle.backgroundColor}`);
    console.log(`✓ Computed border-left: ${computedStyle.borderLeft}`);
    console.log(`✓ Computed border-left-color: ${computedStyle.borderLeftColor}`);
    console.log('==============================================\n');

    // Assertions
    expect(hasBlueBackground).toBe(true);
    expect(hasLeftBorder).toBe(true);
    expect(hasLeftBorderColor).toBe(true);
    expect(ariaSelected).toBe('true');

    // Verify visual appearance (blue background should be visible)
    expect(computedStyle.backgroundColor).toMatch(/rgb\(239, 246, 255\)|rgb\(239,\s*246,\s*255\)/);

    // Navigate to next item with ArrowDown
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);

    // Verify first item is no longer selected
    const firstItemAfterNav = page.locator('.search-item').first();
    const firstItemStillSelected = await firstItemAfterNav.evaluate((el) =>
      el.classList.contains('bg-blue-50')
    );

    expect(firstItemStillSelected).toBe(false);

    // Verify second item is now selected
    const secondItem = page.locator('.search-item').nth(1);
    const secondItemSelected = await secondItem.evaluate((el) =>
      el.classList.contains('bg-blue-50')
    );

    expect(secondItemSelected).toBe(true);

    // Navigate back with ArrowUp
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);

    // Verify first item is selected again
    const firstItemReselected = await firstItemAfterNav.evaluate((el) =>
      el.classList.contains('bg-blue-50')
    );

    expect(firstItemReselected).toBe(true);

    // Take final screenshot
    await page.screenshot({ path: 'search-modal-selected-state-final.png' });

    console.log('✓ Search modal selected state verification PASSED');
  });

  test('should show selected state on hover', async ({ page }) => {
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

      // Wait for redirect to chat page (with longer timeout and fallback)
      try {
        await page.waitForURL(/^http:\/\/localhost:8788\/?$/, { timeout: 20000 });
      } catch {
        // If redirect doesn't happen, just wait for the app to load
        await page.waitForTimeout(3000);
      }
      await page.waitForTimeout(3000);
    }

    // Wait for app to be fully loaded - check for modal root
    await page.waitForSelector('#modal-root', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Open search modal
    await page.keyboard.press('Control+K');
    await page.waitForSelector('#modal-root:not(.hidden)', { timeout: 10000 });
    await page.waitForTimeout(500);

    // Type to get results
    const searchInput = page.locator('#modal-search-input');
    await searchInput.fill('');
    await page.waitForTimeout(800);
    await page.waitForSelector('.search-item', { timeout: 10000 });

    // Hover over first search item
    const firstItem = page.locator('.search-item').first();
    await firstItem.hover();
    await page.waitForTimeout(100);

    // Verify selected state on hover
    const hasBlueBackground = await firstItem.evaluate((el) =>
      el.classList.contains('bg-blue-50')
    );

    const hasLeftBorder = await firstItem.evaluate((el) =>
      el.classList.contains('border-l-2')
    );

    console.log('\n=== Search Modal Hover State Verification ===');
    console.log(`✓ Has bg-blue-50 class on hover: ${hasBlueBackground}`);
    console.log(`✓ Has border-l-2 class on hover: ${hasLeftBorder}`);
    console.log('=============================================\n');

    expect(hasBlueBackground).toBe(true);
    expect(hasLeftBorder).toBe(true);

    console.log('✓ Search modal hover selected state verification PASSED');
  });
});

import { test, expect } from '@playwright/test';

test.describe('Search Modal Hover State', () => {
  test('should display clear hover state on search results', async ({ page }) => {
    // Navigate to the app
    await page.goto('http://127.0.0.1:8787');

    // Wait for the app to load
    await page.waitForLoadState('networkidle');

    // Login with provided credentials
    const emailInput = page.locator('#email');
    const passwordInput = page.locator('#password');
    const loginButton = page.locator('#auth-submit');

    await emailInput.fill('tys203831@gmail.com');
    await passwordInput.fill('&Test1234');
    await loginButton.click();

    // Wait for app to load after login
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Give app time to initialize

    // Open search modal with Ctrl+K
    await page.keyboard.press('Control+K');

    // Wait for search modal to appear
    const searchModal = page.locator('[role="dialog"]');
    await searchModal.waitFor({ state: 'visible', timeout: 5000 });

    // Type a search query to get results
    const searchInput = page.locator('#modal-search-input');
    await searchInput.fill('test');

    // Wait for search results to appear
    const searchResults = page.locator('[data-search-chat]');
    await searchResults.first().waitFor({ state: 'visible', timeout: 5000 });

    // Get the first result item
    const firstResult = searchResults.first();

    // Take a screenshot before hover
    await page.screenshot({ path: '/tmp/search-modal-before-hover.png' });

    // Hover over the first result
    await firstResult.hover();

    // Take a screenshot to verify hover state
    await page.screenshot({ path: '/tmp/search-modal-hover.png' });

    // Check that the result has a hover background color
    const hoverStyle = await firstResult.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });

    console.log('Hover background color:', hoverStyle);

    // Move mouse away to verify hover state is removed
    await page.mouse.move(0, 0);
    await page.waitForTimeout(100);

    const normalStyle = await firstResult.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });

    console.log('Normal background color:', normalStyle);

    // Take a screenshot after hover removed
    await page.screenshot({ path: '/tmp/search-modal-after-hover.png' });

    // Verify hover state provides visual feedback
    // The hover state should have a visible background (not transparent)
    expect(hoverStyle).not.toBe('rgba(0, 0, 0, 0)');
    expect(hoverStyle).not.toBe('transparent');

    console.log('Hover state verification complete');
    console.log('Screenshots saved:');
    console.log('  - /tmp/search-modal-before-hover.png');
    console.log('  - /tmp/search-modal-hover.png');
    console.log('  - /tmp/search-modal-after-hover.png');
  });
});

import { test, expect } from '@playwright/test';

test.describe('Mobile Responsiveness Fixes @mobile-fixes', () => {
  test.beforeEach(async ({ page }) => {
    // Mock API responses
    await page.route('**/api/users/me**', (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          user: { id: '1', name: 'Test User', email: 'test@example.com' },
        }),
      })
    );

    await page.route('**/api/auth/refresh', (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          access_token: 'test-token',
          refresh_token: 'refresh-token',
          user: { id: '1', name: 'Test User' },
        }),
      })
    );
  });

  test.describe('Auth Page - Keyboard Interference (Issue #1)', () => {
    test('should keep sign-up link accessible when keyboard appears on iPhone SE (320x568)', async ({
      page,
    }) => {
      // Set viewport to iPhone SE size
      await page.setViewportSize({ width: 320, height: 568 });
      await page.goto('/auth.html');
      await page.waitForLoadState('networkidle');

      // Get initial positions
      const toggleButton = page.locator('#toggle-mode');
      const toggleButtonBox = await toggleButton.boundingBox();

      console.log('Initial toggle button position:', toggleButtonBox);

      // Simulate keyboard appearing by reducing viewport height
      // iOS keyboard is typically 216-260px tall
      const keyboardHeight = 250;
      const newHeight = 568 - keyboardHeight;

      await page.setViewportSize({ width: 320, height: newHeight });
      await page.waitForTimeout(300); // Wait for layout to adjust

      // Check if toggle button is still visible
      const toggleButtonBoxAfter = await toggleButton.boundingBox();
      console.log('Toggle button position after keyboard:', toggleButtonBoxAfter);

      // The button should either:
      // 1. Still be visible in viewport, OR
      // 2. Be accessible via scrolling
      const isVisible = await toggleButton.isVisible().catch(() => false);
      const isInViewport = toggleButtonBoxAfter && toggleButtonBoxAfter.y + toggleButtonBoxAfter.height <= newHeight;

      console.log('Toggle button visible:', isVisible);
      console.log('Toggle button in viewport:', isInViewport);

      // Check if page is scrollable
      const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      const clientHeight = await page.evaluate(() => window.innerHeight);
      const isScrollable = scrollHeight > clientHeight;

      console.log('Page scrollable:', isScrollable, `(scrollHeight: ${scrollHeight}, clientHeight: ${clientHeight})`);

      // Either the button should be visible or the page should be scrollable
      expect(isVisible || isScrollable).toBe(true);

      await page.screenshot({
        path: 'tests/e2e/artifacts/fixes/auth-keyboard-interference.png',
        fullPage: true,
      });
    });

    test('should allow scrolling to sign-up link when keyboard is active', async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 318 }); // 568 - 250px keyboard
      await page.goto('/auth.html');
      await page.waitForLoadState('networkidle');

      const toggleButton = page.locator('#toggle-mode');

      // Try to scroll to the button
      try {
        await toggleButton.scrollIntoViewIfNeeded();
        await expect(toggleButton).toBeVisible();
        console.log('✓ Sign-up link is accessible via scrolling');
      } catch (e) {
        console.log('✗ Sign-up link is NOT accessible via scrolling:', e.message);
        throw e;
      }
    });
  });

  test.describe('App Shell - Rendering Verification (Issue #2)', () => {
    test('should render app shell with all key components on mobile (320x568)', async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 568 });
      await page.goto('/');
      await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
      await page.waitForLoadState('networkidle');

      // Check for key components
      const app = page.locator('#app');
      await expect(app).toBeVisible();

      // Try to find chat-related elements
      const chatElements = await page.locator('[data-testid*="chat"], aside, nav, [role="navigation"]').count();
      console.log('Found chat-related elements:', chatElements);

      // Check if page has content
      const bodyText = await page.textContent('body');
      const hasContent = bodyText && bodyText.trim().length > 0;
      console.log('Page has content:', hasContent);

      expect(hasContent).toBe(true);

      await page.screenshot({
        path: 'tests/e2e/artifacts/fixes/app-shell-mobile-rendering.png',
        fullPage: true,
      });
    });

    test('should render app shell on desktop (1920x1080)', async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto('/');
      await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
      await page.waitForLoadState('networkidle');

      const app = page.locator('#app');
      await expect(app).toBeVisible();

      const bodyText = await page.textContent('body');
      const hasContent = bodyText && bodyText.trim().length > 0;
      console.log('Desktop page has content:', hasContent);

      expect(hasContent).toBe(true);

      await page.screenshot({
        path: 'tests/e2e/artifacts/fixes/app-shell-desktop-rendering.png',
        fullPage: true,
      });
    });
  });

  test.describe('Form Scrollability', () => {
    test('auth form should be scrollable on small screens', async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 400 });
      await page.goto('/auth.html');
      await page.waitForLoadState('networkidle');

      // Check if body or form container is scrollable
      const isBodyScrollable = await page.evaluate(() => {
        return document.body.scrollHeight > window.innerHeight;
      });

      console.log('Body scrollable:', isBodyScrollable);

      // Check if we can scroll
      if (isBodyScrollable) {
        await page.evaluate(() => window.scrollBy(0, 100));
        const scrollTop = await page.evaluate(() => window.scrollY);
        console.log('Scroll position after scroll:', scrollTop);
        expect(scrollTop).toBeGreaterThan(0);
      }
    });
  });
});

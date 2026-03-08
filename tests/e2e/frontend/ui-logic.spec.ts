import { test, expect } from '@playwright/test';

test.describe('UI Logic and Components', () => {
  // chromium-auth project provides storageState: tests/e2e/fixtures/auth-state.json

  test.beforeEach(async ({ page }) => {
    const now = Date.now();
    await page.route('**/api/users/me', (route) => route.fulfill({ status: 200, body: JSON.stringify({ user: { id: '1', name: 'Test' } }) }));
    await page.route('**/api/auth/refresh', (route) => route.fulfill({
      status: 200,
      body: JSON.stringify({ access_token: 'valid-token', refresh_token: 'refresh-token', user: { id: '1', name: 'Test' } }),
    }));
    await page.route('**/api/chats/shared', (route) => route.fulfill({ status: 200, body: JSON.stringify({ chats: [] }) }));
    await page.route('**/api/chats/c1', (route) => route.fulfill({
      status: 200,
      body: JSON.stringify({ chat: { id: 'c1', title: 'Existing Chat', model: 'gpt-4', updated_at: now, created_at: now }, messages: [] }),
    }));
    await page.route('**/api/chats*', (route) => route.fulfill({ status: 200, body: JSON.stringify({ chats: [{ id: 'c1', title: 'Existing Chat', model: 'gpt-4', updated_at: now, created_at: now }] }) }));
    await page.route('**/api/models', (route) => route.fulfill({ status: 200, body: JSON.stringify({ models: [] }) }));
    await page.route('**/api/folders', (route) => route.fulfill({ status: 200, body: JSON.stringify({ folders: [] }) }));
    await page.route('**/api/realtime/stream', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }));
  });

  test.describe('Keyboard Shortcuts', () => {
    test('mod+k opens search', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });

      const modifier = 'Control';
      
      await page.keyboard.press(`${modifier}+k`);
      await expect(page.locator('#modal-root')).toBeVisible({ timeout: 15000 });
    });

    test('escape closes search modal', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });

      await page.keyboard.press('Control+k');
      await expect(page.locator('#modal-root')).toBeVisible({ timeout: 15000 });
      
      await page.keyboard.press('Escape');
      await expect(page.locator('#modal-root')).toBeHidden();
    });

    test('shift+escape focuses message input', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });

      await page.keyboard.press('Shift+Escape');
      await expect(page.locator('#message-input, textarea').first()).toBeFocused();
    });
  });

  test.describe('Store Persistence', () => {
    test('sidebarWidth is persisted to storage', async ({ page }) => {
      test.skip(test.info().project.name === 'mobile-auth', 'Desktop-only sidebar width behavior');
      await page.goto('/');
      await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
      
      await page.evaluate(() => {
        localStorage.setItem('sidebarWidth', '400');
      });
      await page.reload();
      await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
      
      const width = await page.evaluate(() => {
        return document.querySelector('aside, #sidebar')?.getBoundingClientRect().width;
      });
      expect(width).toBeGreaterThanOrEqual(390);
    });
  });

  test.describe('Search Modal Behavior', () => {
    test('open/close modal behavior', async ({ page }) => {
      test.skip(test.info().project.name === 'mobile-auth', 'Desktop sidebar search button can be off-canvas on mobile');
      await page.goto('/');
      await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });

      const searchBtn = page.locator('#open-search, button:has-text("Search"), [title*="Search"]').first();
      await searchBtn.click();
      await expect(page.locator('#modal-root')).toBeVisible({ timeout: 10000 });
      
      await page.keyboard.press('Escape');
      await expect(page.locator('#modal-root')).toBeHidden();
    });

    test('debounced query updates result list', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });

      await page.keyboard.press('Control+k');
      const searchInput = page.locator('#modal-search-input');
      await expect(searchInput).toBeVisible({ timeout: 10000 });
      
      await page.route('**/api/chats?q=test*', (route) => route.fulfill({
        status: 200,
        body: JSON.stringify({ chats: [{ id: 's1', title: 'Search Result 1' }] })
      }));

      await searchInput.fill('test');
      await expect(page.locator('text=Search Result 1').first()).toBeVisible({ timeout: 15000 });
    });
  });

  test.describe('Sidebar and Layout', () => {
    test('desktop collapse/expand states', async ({ page }) => {
      test.skip(test.info().project.name === 'mobile-auth', 'Desktop-only sidebar collapse control');
      await page.goto('/');
      await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });

      const collapseBtn = page.locator('#toggle-sidebar-desktop, button[title*="Sidebar"], [aria-label*="Sidebar"]').first();
      await expect(page.locator('aside, #sidebar')).toBeVisible();
      
      await collapseBtn.click();
      const isCollapsed = await page.evaluate(() => localStorage.getItem('sidebarCollapsed') === 'true');
      expect(isCollapsed).toBe(true);
    });

    test('mobile sidebar visibility behavior', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/');
      await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
      
      const sidebar = page.locator('aside, #sidebar');
      const marginLeft = await sidebar.evaluate(el => window.getComputedStyle(el).marginLeft);
      expect(marginLeft).toBe('-260px');
      
      const openBtn = page.locator('#toggle-sidebar-mobile, button[aria-label*="sidebar"], button[title*="sidebar"]').first();
      await openBtn.click();
      await expect.poll(async () => sidebar.evaluate(el => window.getComputedStyle(el).marginLeft), { timeout: 5000 }).toBe('0px');
    });
  });
});

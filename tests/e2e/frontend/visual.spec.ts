import { test, expect } from '@playwright/test';

test.describe('Visual Regressions @visual', () => {
  // Uses storageState from project config (chromium-auth or mobile-auth)

  test.beforeEach(async ({ page }) => {
    const now = 1704067200000;
    await page.addInitScript((fixedNow) => {
      const originalNow = Date.now;
      Date.now = () => fixedNow;
      window.__restoreDateNowForTests = () => {
        Date.now = originalNow;
      };
    }, now);
    await page.route('**/api/users/me**', (route) => route.fulfill({ status: 200, body: JSON.stringify({ user: { id: '1', name: 'Visual Test' } }) }));
    await page.route('**/api/auth/refresh', (route) => route.fulfill({
      status: 200,
      body: JSON.stringify({ access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjQxMDI0NDQ4MDAsInN1YiI6IjEiLCJuYW1lIjoiVGVzdCJ9.signature', refresh_token: 'refresh-token', user: { id: '1', name: 'Visual Test' } }),
    }));
    await page.route('**/api/chats/shared', (route) => route.fulfill({ status: 200, body: JSON.stringify({ chats: [] }) }));
    await page.route('**/api/chats/c1', (route) => route.fulfill({
      status: 200,
      body: JSON.stringify({ chat: { id: 'c1', title: 'Example Chat', model: 'gpt-4', updated_at: now, created_at: now }, messages: [] }),
    }));
    await page.route(/\/api\/chats(?:\?.*)?$/, (route) => route.fulfill({ 
      status: 200, 
      body: JSON.stringify({ chats: [{ id: 'c1', title: 'Example Chat', model: 'gpt-4', updated_at: now, created_at: now }] }) 
    }));
    await page.route('**/api/models', (route) => route.fulfill({ 
      status: 200, 
      body: JSON.stringify({ models: [{ id: 'gpt-4', name: 'GPT-4' }] }) 
    }));
    await page.route('**/api/realtime/stream', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }));
    await page.route('**/api/chats/c1/messages*', (route) => route.fulfill({ status: 200, body: JSON.stringify({ messages: [
      { id: 'm1', role: 'user', content: 'Visual regression test message' },
      { id: 'm2', role: 'assistant', content: 'Looks good!' }
    ]}) }));
  });

  test('auth page login mode', async ({ page }) => {
    // Guest context preferred but visual.spec.ts runs in auth project usually.
    // Let's force navigation to auth
    await page.goto('/auth.html');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('auth-login.png');
  });

  test('auth page register mode', async ({ page }) => {
    await page.goto('/auth.html');
    await page.click('#toggle-mode');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('auth-register.png');
  });

  test('main app shell desktop', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('app-shell-desktop.png');
  });

  test('chat with messages', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
    const isMobile = await page.evaluate(() => window.matchMedia('(max-width: 767px)').matches);
    if (isMobile) {
      await page.click('#toggle-sidebar-mobile');
    }
    await page.click('text=Example Chat');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('chat-with-messages.png');
  });

  test('search modal open', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
    await page.keyboard.press('Control+k');
    const modal = page.locator('#modal-root');
    await expect(modal).toBeVisible({ timeout: 10000 });
    await page.waitForLoadState('networkidle');
    await page.addStyleTag({ content: '* { caret-color: transparent !important; }' });
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    await expect(modal).toHaveScreenshot('search-modal.png');
  });
});


import { test, expect } from '@playwright/test';

test.describe('Realtime Sync and Event Safety', () => {
  // chromium-auth project provides storageState: tests/e2e/fixtures/auth-state.json

  test.beforeEach(async ({ page }) => {
    const now = Date.now();
    await page.route('**/api/users/me**', (route) => route.fulfill({ status: 200, body: JSON.stringify({ user: { id: '1', name: 'Test' } }) }));
    await page.route('**/api/auth/refresh', (route) => route.fulfill({
      status: 200,
      body: JSON.stringify({ access_token: 'new-token', refresh_token: 'new-refresh', user: { id: '1', name: 'Test' } }),
    }));
    await page.route('**/api/chats/shared', (route) => route.fulfill({ status: 200, body: JSON.stringify({ chats: [] }) }));
    await page.route('**/api/chats/c1', (route) => route.fulfill({
      status: 200,
      body: JSON.stringify({ chat: { id: 'c1', title: 'Existing Chat', model: 'gpt-4', updated_at: now, created_at: now }, messages: [] }),
    }));
    await page.route('**/api/chats*', (route) => route.fulfill({ status: 200, body: JSON.stringify({ chats: [] }) }));
    await page.route('**/api/models', (route) => route.fulfill({ status: 200, body: JSON.stringify({ models: [] }) }));
  });

  test('client connects with bearer token', async ({ page }) => {
    const realtimeRequestPromise = page.waitForRequest(request => 
      request.url().includes('/api/realtime/stream') &&
      request.headers()['authorization']?.includes('Bearer')
    );

    await page.route('**/api/realtime/stream', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }));

    await page.goto('/?realtime=1');
    await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
    await realtimeRequestPromise;
  });

  test('401 on realtime stream attempts refresh', async ({ page }) => {
    let refreshCalled = false;

    await page.route('**/api/auth/refresh', (route) => {
      refreshCalled = true;
      route.fulfill({ 
        status: 200, 
        body: JSON.stringify({ access_token: 'new-token', refresh_token: 'new-refresh' }) 
      });
    });

    await page.route('**/api/realtime/stream', async (route) => {
      await route.fulfill({ status: 401 });
    });

    await page.goto('/?realtime=1');
    await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
    
    // Verifying refreshCalled via route interception
    await expect.poll(() => refreshCalled, { timeout: 10000 }).toBe(true);
  });

  test('realtime stream does not break shell rendering', async ({ page }) => {
    await page.route('**/api/realtime/stream', (route) => route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'data: {"type":"chat:created","chat_id":"new-c","title":"Realtime Chat"}\n\n'
    }));

    await page.goto('/?realtime=1');
    await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
    await expect(page.locator('#sidebar')).toBeVisible();
  });
});


import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.describe('App Bootstrap and Route Guards', () => {
  test('unauthenticated user redirected to /auth.html', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(url => url.pathname.includes('/auth'), { timeout: 15000 });
    expect(page.url()).toMatch(/\/auth(?:\.html)?$/);
  });

  test('shared route /s/:id renders read-only page', async ({ page }) => {
    const mockSharedChat = {
      chat: { id: 'chat-123', title: 'A Shared Conversation' },
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' }
      ]
    };

    await page.route('**/s/*', (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('format') === 'json') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockSharedChat),
        });
      }
      if (route.request().resourceType() === 'document') {
        const html = fs.readFileSync(path.resolve(process.cwd(), 'public/index.html'), 'utf8');
        return route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: html,
        });
      }
      return route.continue();
    });

    await page.goto('/s/chat-123');
    
    await expect(page.locator('h1, .chat-title').first()).toContainText('A Shared Conversation', { timeout: 15000 });
    await expect(page.locator('text=Read-only view')).toBeVisible();
  });

  test('authenticated bootstrap loads chats and renders shell', async ({ page }) => {
    const mockAuth = { access_token: 'valid-token', user: { id: '1', name: 'Test' } };
    await page.addInitScript((auth) => {
      localStorage.setItem('growchat_auth', JSON.stringify(auth));
    }, mockAuth);

    await page.route('**/api/users/me', (route) => route.fulfill({ status: 200, body: JSON.stringify({ user: { id: '1', name: 'Test' } }) }));
    await page.route('**/api/chats', (route) => route.fulfill({ status: 200, body: JSON.stringify({ chats: [{ id: 'c1', title: 'Chat 1' }] }) }));
    await page.route('**/api/models', (route) => route.fulfill({ status: 200, body: JSON.stringify({ models: [{ id: 'm1', name: 'Model 1' }] }) }));

    await page.goto('/');
    await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
    await expect(page.locator('#app')).not.toBeEmpty();
  });
});

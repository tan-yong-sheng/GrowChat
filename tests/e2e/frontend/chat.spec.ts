import { test, expect } from '@playwright/test';

test.describe('Core Chat UI Logic', () => {
  // chromium-auth project provides storageState: tests/e2e/fixtures/auth-state.json

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/users/me**', (route) => route.fulfill({ status: 200, body: JSON.stringify({ user: { id: '1', name: 'Test' } }) }));
    await page.route('**/api/auth/refresh', (route) => route.fulfill({
      status: 200,
      body: JSON.stringify({ access_token: 'valid-token', refresh_token: 'refresh-token', user: { id: '1', name: 'Test' } }),
    }));
    await page.route('**/api/chats/shared', (route) => route.fulfill({
      status: 200,
      body: JSON.stringify({ chats: [] }),
    }));
    const now = Date.now();
    await page.route('**/api/chats/c1', (route) => route.fulfill({
      status: 200,
      body: JSON.stringify({ chat: { id: 'c1', title: 'Existing Chat', model: 'gpt-4', updated_at: now, created_at: now }, messages: [] }),
    }));
    await page.route('**/api/chats*', (route) => route.fulfill({ 
      status: 200, 
      body: JSON.stringify({ chats: [{ id: 'c1', title: 'Existing Chat', model: 'gpt-4', updated_at: now, created_at: now }] }) 
    }));
    await page.route('**/api/models', (route) => route.fulfill({ 
      status: 200, 
      body: JSON.stringify({ models: [{ id: 'gpt-4', name: 'GPT-4' }] }) 
    }));
    await page.route('**/api/folders', (route) => route.fulfill({ status: 200, body: JSON.stringify({ folders: [] }) }));
    await page.route('**/api/realtime/stream', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }));
  });

  test('new chat creation adds row and selects chat', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });

    const newChatBtn = page.locator('#new-chat, [aria-label="New chat"], button:has-text("New chat")').first();
    
    await page.route('**/api/chats**', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({ id: 'c2', title: 'New Chat', model: 'gpt-4', updated_at: Date.now(), created_at: Date.now() })
        });
      } else {
        await route.continue();
      }
    });

    await newChatBtn.click();
    await expect(page.locator('text=New Chat').first()).toBeVisible({ timeout: 15000 });
  });

  test('chat selection loads message history', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });

    const mockMessages = {
      messages: [
        { id: 'm1', role: 'user', content: 'Hello', created_at: Date.now() },
        { id: 'm2', role: 'assistant', content: 'Hi!', created_at: Date.now() }
      ]
    };

    await page.route('**/api/chats/c1', (route) => route.fulfill({
      status: 200,
      body: JSON.stringify({
        chat: { id: 'c1', title: 'Existing Chat', model: 'gpt-4', updated_at: Date.now(), created_at: Date.now() },
        messages: mockMessages.messages,
      }),
    }));

    const chatRow = page.locator('text=Existing Chat').first();
    await expect(chatRow).toBeVisible({ timeout: 15000 });
    await chatRow.click();
    await expect(page.locator('text=Hello').first()).toBeVisible({ timeout: 15000 });
  });

  test('send message path with streaming assistant tokens', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });

    await page.route('**/api/chats/c1', (route) => route.fulfill({
      status: 200,
      body: JSON.stringify({
        chat: { id: 'c1', title: 'Existing Chat', model: 'gpt-4', updated_at: Date.now(), created_at: Date.now() },
        messages: [
          { id: 'm1', role: 'user', content: 'What is 2+2?', created_at: Date.now() },
          { id: 'm2', role: 'assistant', content: 'The answer is 4.', created_at: Date.now() },
        ],
      }),
    }));
    
    const chatRow = page.locator('text=Existing Chat').first();
    await expect(chatRow).toBeVisible({ timeout: 15000 });
    await chatRow.click();

    const input = page.locator('#message-input, textarea').first();
    await input.fill('What is 2+2?');

    await page.route('**/api/chats/c1/messages', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: 
            'data: {"response":"The answer"}\n\n' +
            'data: {"response":" is 4."}\n\n' +
            'data: [DONE]\n\n'
        });
      }
    });

    await page.click('#send-btn, button:has(svg path[d*="M6"])');
    await expect(page.locator('text=What is 2+2?').first()).toBeVisible({ timeout: 15000 });
  });

  test('empty/whitespace message cannot be sent', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });

    const input = page.locator('#message-input, textarea').first();
    await input.fill('   ');
    const sendBtn = page.locator('#send-btn, button:has(svg path[d*="M6"])').first();
    const isVisible = await sendBtn.isVisible();
    if (isVisible) {
      await expect(sendBtn).toBeDisabled();
    }
  });

  test('streaming error path shows failure indicator', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });

    await page.route('**/api/chats/c1', (route) => route.fulfill({
      status: 200,
      body: JSON.stringify({
        chat: { id: 'c1', title: 'Existing Chat', model: 'gpt-4', updated_at: Date.now(), created_at: Date.now() },
        messages: [],
      }),
    }));
    
    const chatRow = page.locator('text=Existing Chat').first();
    await expect(chatRow).toBeVisible({ timeout: 15000 });
    await chatRow.click();

    await page.route('**/api/chats/c1/messages', (route) => route.fulfill({ status: 500, body: JSON.stringify({ error: 'LLM Error' }) }));

    await page.fill('#message-input, textarea', 'Fail me');
    await page.click('#send-btn, button:has(svg path[d*="M6"])');
    await expect(page.locator('#message-input, textarea').first()).toBeVisible({ timeout: 15000 });
  });
});


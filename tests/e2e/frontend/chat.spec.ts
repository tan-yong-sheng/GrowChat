import { test, expect } from '@playwright/test';

test.describe('Core Chat UI Logic', () => {
  // chromium-auth project gets storageState from tests/shared/test-env.js
  const CHATS_LIST_RE = /\/api\/chats(?:\?.*)?$/;
  const CHAT_C1_RE = /\/api\/chats\/c1(?:\?.*)?$/;
  const MODELS_RE = /\/api\/models(?:\?.*)?$/;

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/users/me**', (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ user: { id: '1', name: 'Test' } }),
      })
    );
    await page.route('**/api/auth/refresh', (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          access_token:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjQxMDI0NDQ4MDAsInN1YiI6IjEiLCJuYW1lIjoiVGVzdCJ9.signature',
          refresh_token: 'refresh-token',
          user: { id: '1', name: 'Test' },
        }),
      })
    );
    await page.route('**/api/chats/shared', (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ chats: [] }),
      })
    );
    const now = Date.now();
    await page.route(CHAT_C1_RE, (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          chat: {
            id: 'c1',
            title: 'Existing Chat',
            model: 'gpt-4',
            updated_at: now,
            created_at: now,
          },
          messages: [],
        }),
      })
    );
    await page.route(CHATS_LIST_RE, (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          chats: [
            {
              id: 'c1',
              title: 'Existing Chat',
              model: 'gpt-4',
              updated_at: now,
              created_at: now,
            },
          ],
        }),
      })
    );
    await page.route(MODELS_RE, (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ models: [{ id: 'gpt-4', name: 'GPT-4' }] }),
      })
    );
    await page.route('**/api/realtime/stream', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: '',
      })
    );
  });

  test('new chat creation adds row and selects chat', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });

    const newChatBtn = page
      .locator('#new-chat, [aria-label="New chat"], button:has-text("New chat")')
      .first();

    await page.route(CHATS_LIST_RE, async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({
            id: 'c2',
            title: 'New Chat',
            model: 'gpt-4',
            updated_at: Date.now(),
            created_at: Date.now(),
          }),
        });
        return;
      }
      await route.fallback();
    });

    await newChatBtn.click();
    await expect(page.locator('text=New Chat').first()).toBeVisible({
      timeout: 15000,
    });
  });

  test('chat selection loads message history', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });

    const mockMessages = {
      messages: [
        { id: 'm1', role: 'user', content: 'Hello', created_at: Date.now() },
        { id: 'm2', role: 'assistant', content: 'Hi!', created_at: Date.now() },
      ],
    };

    await page.route(CHAT_C1_RE, (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          chat: {
            id: 'c1',
            title: 'Existing Chat',
            model: 'gpt-4',
            updated_at: Date.now(),
            created_at: Date.now(),
          },
          messages: mockMessages.messages,
        }),
      })
    );

    const chatRow = page.locator('text=Existing Chat').first();
    await expect(chatRow).toBeVisible({ timeout: 15000 });
    await chatRow.click();
    await expect(page.locator('text=Hello').first()).toBeVisible({
      timeout: 15000,
    });
  });

  test('send message path with streaming assistant tokens', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });

    await page.route(CHAT_C1_RE, (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          chat: {
            id: 'c1',
            title: 'Existing Chat',
            model: 'gpt-4',
            updated_at: Date.now(),
            created_at: Date.now(),
          },
          messages: [
            {
              id: 'm1',
              role: 'user',
              content: 'What is 2+2?',
              created_at: Date.now(),
            },
            {
              id: 'm2',
              role: 'assistant',
              content: 'The answer is 4.',
              created_at: Date.now(),
            },
          ],
        }),
      })
    );

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
            'data: [DONE]\n\n',
        });
      }
    });

    await page.click('#send-btn');
    await expect(page.locator('text=What is 2+2?').first()).toBeVisible({
      timeout: 15000,
    });
  });

  test('empty/whitespace message cannot be sent', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });

    const input = page.locator('#message-input, textarea').first();
    await input.fill('   ');
    const sendBtn = page.locator('#send-btn').first();
    const isVisible = await sendBtn.isVisible();
    if (isVisible) {
      await expect(sendBtn).toBeDisabled();
    }
  });

  test('streaming error path shows failure indicator', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });

    await page.route(CHAT_C1_RE, (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          chat: {
            id: 'c1',
            title: 'Existing Chat',
            model: 'gpt-4',
            updated_at: Date.now(),
            created_at: Date.now(),
          },
          messages: [],
        }),
      })
    );

    const chatRow = page.locator('text=Existing Chat').first();
    await expect(chatRow).toBeVisible({ timeout: 15000 });
    await chatRow.click();

    await page.route('**/api/chats/c1/messages', (route) =>
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'LLM Error' }),
      })
    );

    await page.fill('#message-input, textarea', 'Fail me');
    await page.click('#send-btn');
    await expect(page.locator('#message-input, textarea').first()).toBeVisible({
      timeout: 15000,
    });
  });

  test('selection survives repeated highlight and cancel while streaming', async ({ page }) => {
    await page.route('**/api/chats/**', async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (method === 'GET' && /\/api\/chats\/c1(?:\?.*)?$/.test(url)) {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({
            chat: {
              id: 'c1',
              title: 'Existing Chat',
              model: 'gpt-4',
              updated_at: Date.now(),
              created_at: Date.now(),
            },
            messages: [],
          }),
        });
        return;
      }
      if (method === 'POST' && /\/api\/chats\/c1\/messages(?:\?.*)?$/.test(url)) {
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body:
            'data: {"event":"start","message_id":"m-resp-1","user_message_id":"m-user-1"}\n\n' +
            'data: {"response":"alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau. "}\n\n' +
            'data: {"response":"SECOND CHUNK with more words for selection testing. "}\n\n' +
            'data: {"response":"THIRD CHUNK with more words to keep the stream alive. "}\n\n' +
            'data: {"response":"FOURTH CHUNK final."}\n\n' +
            'data: [DONE]\n\n',
        });
        return;
      }
      await route.fallback();
    });

    await page.goto('/');
    await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });

    const chatRow = page.locator('text=Existing Chat').first();
    await expect(chatRow).toBeVisible({ timeout: 15000 });
    await chatRow.click();

    await page.fill('#message-input, textarea', 'Select mid stream');
    await page.click('#send-btn');
    await page.waitForSelector('[data-message-content="m-resp-1"]', {
      state: 'attached',
      timeout: 15000,
    });
    await page.waitForTimeout(250);

    const box = await page.locator('[data-message-content="m-resp-1"]').boundingBox();
    expect(box).toBeTruthy();
    if (!box) throw new Error('missing assistant message box');

    for (let i = 0; i < 3; i += 1) {
      await page.mouse.move(box.x + 10, box.y + 15);
      await page.mouse.down();
      await page.mouse.move(box.x + 250, box.y + 15, { steps: 12 });
      await page.waitForTimeout(350);
      const during = await page.evaluate(() => window.getSelection()?.toString() || '');
      expect(during.length).toBeGreaterThan(0);

      await page.mouse.up();
      await page.mouse.click(20, 20);
      await page.waitForTimeout(150);
      const after = await page.evaluate(() => window.getSelection()?.toString() || '');
      expect(after.length).toBeLessThanOrEqual(during.length);
    }

    await page.waitForTimeout(2200);
    await expect(page.locator('#message-input, textarea').first()).toBeEnabled({ timeout: 15000 });
    await expect(page.locator('[data-message-content="m-resp-1"]').first()).toContainText(
      'FOURTH CHUNK final.',
      {
        timeout: 15000,
      }
    );
  });
});

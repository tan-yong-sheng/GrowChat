import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // Mock the models API endpoint to provide at least one enabled model.
  // Without this, the message input is disabled ("No selectable models are available").
  // IMPORTANT: Use a function matcher to avoid intercepting JS files like
  // /js/shared/api/models.js which also contain '/api/models' in their path.
  await page.route((url) => url.pathname === '/api/models', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        models: [
          {
            id: 'gpt-4o',
            name: 'GPT-4o',
            provider: 'openai',
            enabled: true,
            hidden_for_user: false,
            scope: 'global',
            attachment_cap: null,
            user_attachment_cap: null,
            user_access: true,
          }
        ],
        total: 1,
        active_total: 1,
        enabled_total: 1,
        user_total: 0,
        user_enabled_total: 0,
        user_active_total: 0,
        attachment_caps: {},
      }
    });
  });
});

test("create and send message in chat", async ({ page }) => {
	await page.goto("/?app=1");
	await page.waitForLoadState("domcontentloaded");

	// Wait for the sidebar to appear (indicates SPA is fully loaded)
	await page.locator('#sidebar').waitFor({ state: 'visible', timeout: 15000 });

	// Check if logged in (user menu visible)
	const userMenu = page.locator('.user-profile-btn');
	await expect(userMenu).toBeVisible({ timeout: 5000 });

	// Create new chat (use #new-chat ID to avoid matching the "New Chat" button in the chat list)
	await page.locator('#new-chat').click();

	// Wait for message input to appear and be enabled
	const messageInput = page.locator('#message-input');
	await expect(messageInput).toBeVisible({ timeout: 10000 });
	await expect(messageInput).toBeEnabled({ timeout: 10000 });

	// Send message
	await messageInput.fill("Hello, test message");

	// Send message by pressing Enter
	await page.keyboard.press('Enter');

	// Verify message sent in the messages list
	const sentMessage = page.locator('#messages-list').getByText('Hello, test message');
	await expect(sentMessage).toBeVisible({ timeout: 10000 });
});

test('sent messages show edit button on hover', async ({ page }) => {
  await page.goto('/?app=1');
  await page.waitForLoadState('domcontentloaded');

  // Wait for the sidebar / SPA to be ready
  await page.locator('#sidebar').waitFor({ state: 'visible', timeout: 15000 });

  // Wait for the message input to appear and be enabled
  const messageInput = page.locator('#message-input');
  await expect(messageInput).toBeVisible({ timeout: 10000 });
  await expect(messageInput).toBeEnabled({ timeout: 10000 });

  await messageInput.fill('Hover test message');
  await page.keyboard.press('Enter');

  // Wait for message to appear
  const userMessage = page.locator('[data-message-id]').filter({ hasText: 'Hover test message' });
  await expect(userMessage).toBeVisible({ timeout: 10000 });

  // The edit button should exist on the message
  const editBtn = userMessage.locator('[data-edit-message]');
  await expect(editBtn).toBeVisible({ timeout: 5000 });
});

import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route('**/api/models*', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        models: [{ id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', enabled: true, hidden_for_user: false }],
        total: 1,
        active_total: 1
      }
    });
  });
});

test("create and send message in chat", async ({ page }) => {
	await page.goto("/");
	await page.waitForLoadState("networkidle");

	// Check if logged in (user menu visible)
	const userMenu = page.locator('.user-profile-btn');
	try {
	  await expect(userMenu).toBeVisible({ timeout: 10000 });
	} catch (e) {
	  console.error("Test failed, URL is", page.url());
	  console.error("Content:", await page.content());
	  throw e;
	}

	// Create new chat
	const newChatBtn = page.locator(
		'button:has-text("New Chat"), [data-testid="new-chat"]',
	);
	await newChatBtn.click();
	await page.waitForLoadState("networkidle");

	// Take screenshot of chat page
	await page.screenshot({ path: "chat-page.png" });

	// Send message
	const messageInput = page
		.locator('textarea, input[placeholder*="message" i]')
		.first();
	await messageInput.fill("Hello, test message");

	// Click send button
	const sendBtn = page
		.locator('button:has-text("Send"), [data-testid="send-message"]')
		.first();
	await sendBtn.click();

	// Wait for message to appear
	await page.waitForLoadState("networkidle");

	// Verify message sent
	const sentMessage = page.locator('text="Hello, test message"');
	await expect(sentMessage).toBeVisible({ timeout: 5000 });

	// Take screenshot after send
	await page.screenshot({ path: "chat-message-sent.png" });
});

test('sent messages show edit button on hover', async ({ page }) => {
  await page.route('**/api/models*', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        models: [{ id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', enabled: true, hidden_for_user: false }],
        total: 1,
        active_total: 1
      }
    });
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Send a message
  const messageInput = page.locator('#message-input');
  await messageInput.fill('Hover test message');
  await page.keyboard.press('Enter');

  // Wait for message to appear
  const userMessage = page.locator('[data-message-id]').filter({ hasText: 'Hover test message' });
  await expect(userMessage).toBeVisible({ timeout: 10000 });

  // Before hover, edit button should be hidden (opacity-0/hidden)
  const editBtn = userMessage.locator('[data-edit-message]');
  await expect(editBtn).not.toBeVisible();

  // Hover over the message container
  await userMessage.hover();

  // Now it should be visible
  await expect(editBtn).toBeVisible({ timeout: 5000 });
});

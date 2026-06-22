import { test, expect } from "@playwright/test";

test('can revoke an active session', async ({ page }) => {
  // TODO: Sessions tab is not yet exposed in the account settings UI.
  // Re-enable this test once the sessions subnav is wired up.
  test.skip(true, 'Sessions tab not available in current account settings UI');
  // Mock sessions API
  await page.route('**/api/user/sessions', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        sessions: [
          { id: 'session-1', device: 'Chrome on Windows', ip: '127.0.0.1', lastActive: Math.floor(Date.now() / 1000) - 60 },
          { id: 'session-2', device: 'Safari on iPhone', ip: '127.0.0.1', lastActive: Math.floor(Date.now() / 1000) - 3600 }
        ]
      }
    });
  });

  // Mock session revocation API
  await page.route('**/api/user/sessions/session-1', async (route) => {
    if (route.request().method() === 'DELETE') {
      await route.fulfill({ status: 200, json: { message: 'Session revoked successfully' } });
    } else {
      await route.continue();
    }
  });

  await page.goto('/');
  // Don't use networkidle — the SSE /api/realtime/stream connection keeps
  // the network active indefinitely. Wait for the UI to render instead.
  await expect(page.locator('.user-profile-btn')).toBeVisible({ timeout: 10000 });
  
  // Navigate to Settings > Sessions
  await page.locator('.user-profile-btn').click();
  await page.locator('.menu-item[data-action="preferences"]').click();
  
  const sessionTab = page.locator('[data-subnav="sessions"]').first();
  await expect(sessionTab).toBeVisible({ timeout: 10000 });
  await sessionTab.click();
  
  // Wait for session cards to appear
  const session1 = page.locator('.session-card[data-session-id="session-1"]');
  await expect(session1).toBeVisible();
  
  // Trigger revocation
  // Need to mock the window.confirm
  page.on('dialog', dialog => dialog.accept());
  await session1.locator('.revoke-btn').click();
  
  // Verify card removed
  await expect(session1).not.toBeVisible();
});

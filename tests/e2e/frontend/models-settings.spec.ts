import { test, expect } from '@playwright/test';

test.describe('Models Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    // Mock user and auth
    await page.route('**/api/users/me*', (route) => route.fulfill({ 
      status: 200, 
      body: JSON.stringify({ user: { id: '1', name: 'Admin', role: 'admin' }, permissions: ['admin.rbac.admin'], roles: [{ role_name: 'admin' }] }) 
    }));
    await page.route('**/api/auth/refresh', (route) => route.fulfill({
      status: 200,
      body: JSON.stringify({ access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjQxMDI0NDQ4MDAsInN1YiI6IjEiLCJuYW1lIjoiVGVzdCJ9.signature', refresh_token: 'refresh-token', user: { id: '1', name: 'Admin', role: 'admin' } }),
    }));

    // Mock admin models API
    await page.route('**/api/admin/models*', (route) => route.fulfill({
      status: 200,
      body: JSON.stringify({
        models: [
          { id: 'gpt-4', name: 'GPT-4', enabled: true },
          { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', enabled: true },
          { id: 'claude-3-opus', name: 'Claude 3 Opus', enabled: true },
          { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet', enabled: true },
        ],
        total: 4,
        limit: 20,
        offset: 0
      })
    }));

    // Mock other required APIs to prevent 404s
    await page.route('**/api/chats/shared', (route) => route.fulfill({ status: 200, body: JSON.stringify({ chats: [] }) }));
    await page.route('**/api/chats*', (route) => route.fulfill({ status: 200, body: JSON.stringify({ chats: [] }) }));
  });

  test('displays total count of models', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app', { state: 'visible' });

    await page.evaluate(async () => {
      const { renderAdminPage } = await import('./js/admin.js');
      window.history.pushState({}, '', '/admin/settings/models');
      await renderAdminPage(document.getElementById('app'));
    });

    // Wait for the total count to appear. 
    // It should be '4' based on our mock.
    // The total count is in a div with class "text-gray-500 font-normal ml-0.5" next to "Models"
    const totalCount = page.locator('.text-xl .text-gray-500');
    await expect(totalCount).toHaveText('4');
  });

  test('filters models based on search query', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#app', { state: 'visible' });

    await page.evaluate(async () => {
      const { renderAdminPage } = await import('./js/admin.js');
      window.history.pushState({}, '', '/admin/settings/models');
      await renderAdminPage(document.getElementById('app'));
    });
    
    const searchInput = page.locator('#model-search-input');
    await expect(searchInput).toBeVisible();

    // Initially all 4 models should be visible
    await expect(page.locator('.model-toggle')).toHaveCount(4);

    // Search for "gpt"
    await searchInput.fill('gpt');
    await expect(page.locator('.model-toggle')).toHaveCount(2);
    await expect(page.locator('td').filter({ hasText: /^GPT-4$/ })).toBeVisible();
    await expect(page.locator('td[title="GPT-3.5 Turbo"]')).toBeVisible();
    await expect(page.locator('td').filter({ hasText: /^Claude 3 Opus$/ })).not.toBeVisible();

    // Search for "claude"
    await searchInput.fill('claude');
    await expect(page.locator('.model-toggle')).toHaveCount(2);
    await expect(page.locator('td').filter({ hasText: /^Claude 3 Opus$/ })).toBeVisible();
    await expect(page.locator('td').filter({ hasText: /^Claude 3 Sonnet$/ })).toBeVisible();
    await expect(page.locator('td').filter({ hasText: /^GPT-4$/ })).not.toBeVisible();

    // Search for non-existent model
    await searchInput.fill('xyz');
    await expect(page.locator('.model-toggle')).toHaveCount(0);
    await expect(page.locator('text=No models found matching "xyz"')).toBeVisible();
  });
});

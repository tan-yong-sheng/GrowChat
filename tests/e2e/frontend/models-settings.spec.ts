import { expect, test } from '@playwright/test';
import { renderAdminRoute, setupAdminPage } from './admin-test-helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Models Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminPage(page);

    await page.route('**/api/admin/models*', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        models: [
          { id: 'gpt-4', name: 'GPT-4', enabled: true },
          { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', enabled: true },
          { id: 'claude-3-opus', name: 'Claude 3 Opus', enabled: true },
          { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet', enabled: true },
        ],
        total: 4,
        limit: 20,
        offset: 0,
      }),
    }));
  });

  test('displays total count of models', async ({ page }) => {
    await renderAdminRoute(page, '/admin/settings/models');
    const totalCount = page.locator('.text-xl .text-gray-500');
    await expect(totalCount).toHaveText('4');
  });

  test('filters models based on search query', async ({ page }) => {
    await renderAdminRoute(page, '/admin/settings/models');

    const searchInput = page.locator('#model-search-input');
    await expect(searchInput).toBeVisible();
    await expect(page.locator('.model-toggle')).toHaveCount(4);

    await searchInput.fill('gpt');
    await expect(page.locator('.model-toggle')).toHaveCount(2);
    await expect(page.locator('td').filter({ hasText: /^GPT-4$/ })).toBeVisible();
    await expect(page.locator('td[title="GPT-3.5 Turbo"]')).toBeVisible();
    await expect(page.locator('td').filter({ hasText: /^Claude 3 Opus$/ })).not.toBeVisible();

    await searchInput.fill('claude');
    await expect(page.locator('.model-toggle')).toHaveCount(2);
    await expect(page.locator('td').filter({ hasText: /^Claude 3 Opus$/ })).toBeVisible();
    await expect(page.locator('td').filter({ hasText: /^Claude 3 Sonnet$/ })).toBeVisible();
    await expect(page.locator('td').filter({ hasText: /^GPT-4$/ })).not.toBeVisible();

    await searchInput.fill('xyz');
    await expect(page.locator('.model-toggle')).toHaveCount(0);
    await expect(page.locator('text=No models found matching "xyz"')).toBeVisible();
  });
});

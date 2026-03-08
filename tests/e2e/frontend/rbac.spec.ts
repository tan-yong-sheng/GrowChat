import { test, expect } from '@playwright/test';

test.describe('RBAC Frontend Integration', () => {
  test.beforeEach(async ({ page }) => {
    // Mock user and permissions for a standard admin user
    await page.route('**/api/users/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-admin-id',
            email: 'tys203831@gmail.com',
            name: 'Test Admin',
            role: 'admin',
            preferences: {}
          }
        })
      });
    });

    await page.route('**/api/users/me/permissions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          permissions: [
            'chat.read', 'chat.write', 'chat.delete', 'chat.share',
            'model.use', 'model.admin', 'kb.read', 'kb.write', 'kb.reindex',
            'file.upload', 'file.delete', 'admin.user.read', 'admin.user.write',
            'admin.audit.read', 'admin.rbac.admin'
          ]
        })
      });
    });

    await page.route('**/api/users/me/roles', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          roles: [{ role_name: 'admin' }]
        })
      });
    });

    // Mock other required endpoints
    await page.route('**/api/chats', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ chats: [] }) });
    });
    await page.route('**/api/models', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [{ id: 'gpt-4', name: 'GPT-4' }] }) });
    });

    // Set auth token in localStorage
    await page.addInitScript(() => {
      window.localStorage.setItem('growchat_auth', JSON.stringify({ access_token: 'mock-token' }));
    });

    await page.goto('/');
  });

  test('Admin Panel is visible for users with admin.rbac.admin permission', async ({ page }) => {
    // Wait for user profile button
    const profileBtn = page.locator('.user-profile-btn');
    await expect(profileBtn).toBeVisible();
    
    // Click user profile button to open menu
    await profileBtn.click();
    
    // Check if Admin Panel button is visible
    const adminBtn = page.locator('button[data-action="admin"]');
    await expect(adminBtn).toBeVisible();
    await expect(adminBtn).toContainText('Admin Panel');
  });

  test('Clicking Admin Panel shows "Backend api not found" modal', async ({ page }) => {
    await page.locator('.user-profile-btn').click();
    await page.locator('button[data-action="admin"]').click();
    
    // Check for modal content
    const modal = page.locator('.modal-content');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Admin Panel');
    await expect(modal).toContainText('Backend api not found');
  });
});

test.describe('RBAC Denied States', () => {
  test('Admin Panel is hidden for users without admin.rbac.admin permission', async ({ page }) => {
    // Mock standard user WITHOUT admin permissions
    await page.route('**/api/users/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: 'test-user-id', email: 'user@example.com', name: 'Test User', role: 'user', preferences: {} }
        })
      });
    });

    await page.route('**/api/users/me/permissions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          permissions: ['chat.read', 'chat.write', 'model.use']
        })
      });
    });

    await page.route('**/api/users/me/roles', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          roles: [{ role_name: 'member' }]
        })
      });
    });

    // Mock other required endpoints
    await page.route('**/api/chats', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ chats: [] }) });
    });
    await page.route('**/api/models', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [{ id: 'gpt-4', name: 'GPT-4' }] }) });
    });

    await page.addInitScript(() => {
      window.localStorage.setItem('growchat_auth', JSON.stringify({ access_token: 'mock-token' }));
    });

    await page.goto('/');
    
    await page.locator('.user-profile-btn').click();
    const adminBtn = page.locator('button[data-action="admin"]');
    await expect(adminBtn).not.toBeVisible();
  });
});

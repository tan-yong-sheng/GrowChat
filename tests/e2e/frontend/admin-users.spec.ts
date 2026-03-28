import { expect, test } from '@playwright/test';
import { renderAdminRoute, setupAdminPage } from './admin-test-helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Admin users staged save flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminPage(page);
  });

  test('stages delete and edit changes until the shared Save button commits them', async ({ page }) => {
    let deleteCalls = 0;
    let putCalls = 0;

    await page.route('**/api/admin/users?**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        users: [
          {
            id: 'u1',
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            primary_role: 'admin',
            account_status: 'active',
            last_active_at: 1710000000,
            created_at: 1700000000,
          },
          {
            id: 'u2',
            name: 'Grace Hopper',
            email: 'grace@example.com',
            primary_role: 'member',
            account_status: 'active',
            last_active_at: 1710000500,
            created_at: 1700000500,
          },
        ],
        total: 2,
        limit: 20,
        offset: 0,
      }),
    }));

    await page.route('**/api/admin/users/u1', async (route) => {
      if (route.request().method() === 'PUT') {
        putCalls += 1;
        const body = JSON.parse(route.request().postData() || '{}');
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: {
              id: 'u1',
              name: body.name || 'Ada Lovelace',
              email: body.email || 'ada@example.com',
              primary_role: body.primary_role || 'admin',
              account_status: body.account_status || 'active',
            },
          }),
        });
      }
      if (route.request().method() === 'DELETE') {
        deleteCalls += 1;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
      }
      return route.continue();
    });

    await page.route('**/api/admin/users/u2', async (route) => {
      if (route.request().method() === 'DELETE') {
        deleteCalls += 1;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
      }
      return route.continue();
    });

    await renderAdminRoute(page, '/admin/users/overview');

    await expect(page.locator('#save-users')).toBeDisabled();
    page.once('dialog', async (dialog) => {
      expect(dialog.type()).toBe('confirm');
      await dialog.accept();
    });

    await page.locator('.btn-delete-user[data-user-id="u2"]').click();

    await expect(page.locator('[data-user-row="u2"]')).toContainText('Pending delete');
    await expect(page.locator('#save-users')).toBeEnabled();
    expect(deleteCalls).toBe(0);

    await page.locator('#save-users').click();
    await expect.poll(() => deleteCalls).toBe(1);
    await expect(page.locator('[data-user-row="u2"]')).toHaveCount(0);

    await page.locator('.btn-edit-user[data-user-id="u1"]').click();
    await expect(page.locator('#edit-user-modal')).toBeVisible();
    await page.locator('#edit-user-modal [name="name"]').fill('Ada Lovelace II');
    await page.locator('#edit-user-save-btn').click();

    await expect(page.locator('#save-users')).toBeEnabled();
    expect(putCalls).toBe(0);

    await page.locator('#save-users').click();
    await expect.poll(() => putCalls).toBe(1);
    await expect(page.locator('[data-user-row="u1"]')).toContainText('Ada Lovelace II');
    await expect(page.locator('#save-users')).toBeDisabled();
  });

  test('stages role changes until the shared Save button commits them', async ({ page }) => {
    let createCalls = 0;
    const savedBodies = [];

    await page.route('**/api/admin/rbac/roles**', async (route) => {
      const url = new URL(route.request().url());
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            roles: [
              {
                id: 'admin',
                name: 'Admin',
                description: 'Full platform access',
                system: true,
                permissions: ['chat.read', 'chat.write', 'model.use', 'admin.rbac.admin'],
              },
              {
                id: 'member',
                name: 'Member',
                description: 'Base app access',
                system: true,
                permissions: ['chat.read', 'chat.write', 'model.use'],
              },
            ],
          }),
        });
      }

      if (route.request().method() === 'POST' && url.pathname === '/api/admin/rbac/roles') {
        createCalls += 1;
        const body = JSON.parse(route.request().postData() || '{}');
        savedBodies.push(body);
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            role: {
              id: 'custom-1',
              name: body.name,
              description: 'Custom role',
              system: false,
              permissions: body.permissions || [],
            },
          }),
        });
      }

      return route.continue();
    });

    await renderAdminRoute(page, '/admin/users/roles');

    await expect(page.locator('#create-role-btn')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#save-users')).toBeDisabled();

    await page.locator('#create-role-btn').click();
    await expect(page.locator('[data-role-save]')).toBeVisible();

    await page.locator('#role-name').fill('Support');
    await page.locator('[data-role-save]').click();

    await expect(page.locator('[data-role-save]')).toHaveCount(0);
    await expect(page.locator('#save-users')).toBeEnabled();
    expect(createCalls).toBe(0);

    await page.locator('#save-users').click();

    await expect.poll(() => createCalls).toBe(1);
    await expect(page.locator('#save-users')).toBeDisabled();
    expect(savedBodies).toHaveLength(1);
    expect(savedBodies[0].name).toBe('Support');
    expect(Array.isArray(savedBodies[0].permissions)).toBe(true);
    await expect(page.locator('[data-role-list]')).toContainText('Support');
  });

  test('stages group changes until the shared Save button commits them', async ({ page }) => {
    let createCalls = 0;
    const savedBodies = [];

    await page.route('**/api/admin/groups', async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            groups: [
              { id: 'g1', name: 'Team One', member_count: 2 },
            ],
          }),
        });
      }

      if (route.request().method() === 'POST') {
        createCalls += 1;
        const body = JSON.parse(route.request().postData() || '{}');
        savedBodies.push(body);
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            group: {
              id: 'g2',
              name: body.name,
              description: body.description,
              member_count: Array.isArray(body.member_ids) ? body.member_ids.length : 0,
            },
          }),
        });
      }

      return route.continue();
    });

    await page.route('**/api/admin/users?**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        users: [
          {
            id: 'u1',
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            primary_role: 'admin',
            account_status: 'active',
          },
        ],
        total: 1,
        limit: 100,
        offset: 0,
      }),
    }));

    await renderAdminRoute(page, '/admin/users/groups');

    await expect(page.locator('#create-group-btn')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#save-users')).toBeDisabled();

    await page.locator('#create-group-btn').click();
    await expect(page.locator('#group-modal')).toBeVisible();

    await page.locator('#group-name-input').fill('Team Two');
    await page.locator('#group-description-input').fill('Team description');
    await page.locator('#group-save-btn').click();

    await expect(page.locator('#group-modal')).toHaveCount(0);
    await expect(page.locator('#save-users')).toBeEnabled();
    expect(createCalls).toBe(0);

    await page.locator('#save-users').click();

    await expect.poll(() => createCalls).toBe(1);
    await expect(page.locator('#save-users')).toBeDisabled();
    expect(savedBodies).toHaveLength(1);
    expect(savedBodies[0]).toMatchObject({
      name: 'Team Two',
      description: 'Team description',
    });
    expect(Array.isArray(savedBodies[0].member_ids)).toBe(true);
    await expect(page.locator('[data-group-row="g2"]')).toContainText('Team Two');
  });
});

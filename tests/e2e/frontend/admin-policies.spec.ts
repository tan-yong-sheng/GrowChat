import { expect, test } from '@playwright/test';
import { renderAdminRoute, setupAdminPage } from './admin-test-helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Admin policies staged save flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminPage(page);
  });

  test('stages model ACL edits until the page Save commits them', async ({ page }) => {
    let saveCalls = 0;
    const savedBodies = [];

    await page.route('**/api/admin/groups**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        groups: [
          { id: 'g1', name: 'Core', description: 'Core team', is_system: 0 },
          { id: 'g2', name: 'Ops', description: 'Ops team', is_system: 0 },
        ],
      }),
    }));

    await page.route('**/api/admin/models**', async (route) => {
      if (route.request().method() !== 'GET') {
        return route.continue();
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          models: [
            {
              id: 'm1',
              name: 'Model 1',
              provider: 'openai',
              enabled: true,
              connection_id: 'c1',
              connection_name: 'Conn 1',
            },
          ],
          total: 1,
          active_total: 1,
          providers: [
            { value: 'all', label: 'All Providers', active: 1, total: 1 },
            { value: 'openai', label: 'OpenAI', active: 1, total: 1 },
          ],
        }),
      });
    });

    await page.route('**/api/admin/openai/connections**', async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            connections: [
              {
                id: 'c1',
                name: 'Conn 1',
                providerType: 'openai-compatible',
                baseUrl: 'https://example.com',
                source: 'config',
              },
            ],
          }),
        });
      }
      if (route.request().method() === 'PUT') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ enabled: true, connections: [] }),
        });
      }
      return route.continue();
    });

    await page.route('**/api/admin/tool-servers**', async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ servers: [] }),
        });
      }
      return route.continue();
    });

    await page.route('**/api/admin/models/access**', async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            groups: [
              { id: 'g1', name: 'Core', description: 'Core team', is_system: 0 },
              { id: 'g2', name: 'Ops', description: 'Ops team', is_system: 0 },
            ],
            rules: [{ model_id: 'm1', principal_type: 'group', principal_id: 'g1', effect: 'allow', action: 'use' }],
          }),
        });
      }
      if (route.request().method() === 'PUT') {
        saveCalls += 1;
        const body = JSON.parse(route.request().postData() || '{}');
        savedBodies.push(body);
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
      }
      return route.continue();
    });

    await page.route('**/api/admin/openai/connections/access**', async (route) => {
      if (route.request().method() !== 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          groups: [
            { id: 'g1', name: 'Core', description: 'Core team', is_system: 0 },
            { id: 'g2', name: 'Ops', description: 'Ops team', is_system: 0 },
          ],
          rules: [{ connection_id: 'c1', principal_type: 'group', principal_id: 'g1', effect: 'allow', action: 'use' }],
        }),
      });
    });

    await page.route('**/api/admin/tool-servers/access**', async (route) => {
      if (route.request().method() !== 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          groups: [
            { id: 'g1', name: 'Core', description: 'Core team', is_system: 0 },
            { id: 'g2', name: 'Ops', description: 'Ops team', is_system: 0 },
          ],
          rules: [],
        }),
      });
    });

    await renderAdminRoute(page, '/admin/users/policies?group=g1');

    await expect(page.locator('#policy-group-filter')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#policy-page-save')).toBeDisabled();
    await expect(page.locator('[data-edit-resource="m1"]')).toBeVisible();

    await page.locator('[data-edit-resource="m1"]').click();
    await expect(page.locator('#policy-acl-save')).toBeVisible();

    await page.locator('#policy-acl-list .resource-acl-effect[data-group-id="g2"]').selectOption('allow');
    await page.locator('#policy-acl-save').click();

    await expect(page.locator('#policy-acl-save')).toHaveCount(0);
    await expect(page.locator('#policy-page-save')).toBeEnabled();
    expect(saveCalls).toBe(0);

    await page.locator('#policy-page-save').click();

    await expect.poll(() => saveCalls).toBe(1);
    await expect(page.locator('#policy-page-save')).toBeDisabled();
    expect(savedBodies).toHaveLength(1);
    expect(savedBodies[0].updates).toHaveLength(1);
    expect(savedBodies[0].updates[0]).toMatchObject({
      model_id: 'm1',
    });
    expect(savedBodies[0].updates[0].rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          principal_type: 'group',
          principal_id: 'g1',
          effect: 'allow',
          action: 'use',
        }),
        expect.objectContaining({
          principal_type: 'group',
          principal_id: 'g2',
          effect: 'allow',
          action: 'use',
        }),
      ]),
    );
  });
});

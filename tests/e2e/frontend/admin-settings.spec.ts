import { expect, test } from '@playwright/test';
import { renderAdminRoute, setupAdminPage } from './admin-test-helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Admin settings staged save flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminPage(page);
  });

  test('stages integrations modal changes until the shared Save button commits them', async ({ page }) => {
    let verifyCalls = 0;
    let saveCalls = 0;
    const savedBodies = [];

    await page.route('**/api/admin/tool-servers?include_disabled=1', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ servers: [] }),
    }));

    await page.route('**/api/admin/tool-servers/test', (route) => {
      verifyCalls += 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Connection successful',
          tools_verified_at: new Date().toISOString(),
          tools: [
            { name: 'search', title: 'Search', description: 'Search documents', enabled: true },
          ],
        }),
      });
    });

    await page.route('**/api/admin/tool-servers', async (route) => {
      if (route.request().method() !== 'PUT') {
        return route.continue();
      }
      saveCalls += 1;
      const body = JSON.parse(route.request().postData() || '{}');
      savedBodies.push(body);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          servers: body.servers || [],
        }),
      });
    });

    await renderAdminRoute(page, '/admin/settings/integrations');

    await expect(page.locator('#add-tool-server')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#save-integrations')).toBeDisabled();

    await page.locator('#add-tool-server').click();
    await expect(page.locator('#edit-connection-modal')).toBeVisible();

    await page.locator('#server-name').fill('Tavily');
    await page.locator('#server-url').fill('https://mcp.example.com');
    await page.locator('#save-modal').click();

    await expect(page.locator('#edit-connection-modal')).toHaveClass(/hidden/);
    await expect(page.locator('#save-integrations')).toBeEnabled();
    expect(verifyCalls).toBe(1);
    expect(saveCalls).toBe(0);

    await page.locator('#save-integrations').click();

    await expect.poll(() => saveCalls).toBe(1);
    await expect(page.locator('#save-integrations')).toBeDisabled();
    expect(savedBodies).toHaveLength(1);
    expect(Array.isArray(savedBodies[0].servers)).toBe(true);
    expect(savedBodies[0].servers).toHaveLength(1);
    expect(savedBodies[0].servers[0].name).toBe('Tavily');
    expect(savedBodies[0].servers[0].url).toBe('https://mcp.example.com');
  });

  test('stages connection ACL changes until the shared Save button commits them', async ({ page }) => {
    let accessPutCalls = 0;
    let saveCalls = 0;
    const savedBodies = [];

    await page.route('**/api/admin/openai/connections?include_disabled=1', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        enabled: true,
        connections: [
          {
            id: 'conn-1',
            name: 'OpenAI',
            url: 'https://api.openai.com/v1',
            key: 'secret',
            providerType: 'openai',
            providerFamily: 'openai',
            apiType: 'openai',
            enabled: true,
          },
        ],
      }),
    }));

    await page.route('**/api/admin/openai/connections/conn-1/access**', async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: { id: '1', name: 'Admin', role: 'admin' },
            groups: [
              { id: 'g-1', name: 'Team Alpha', description: 'Primary ops team' },
            ],
            rules: [],
          }),
        });
      }
      if (route.request().method() === 'PUT') {
        accessPutCalls += 1;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
      }
      return route.continue();
    });

    await page.route('**/api/admin/openai/connections', async (route) => {
      if (route.request().method() !== 'PUT') {
        return route.continue();
      }
      saveCalls += 1;
      const body = JSON.parse(route.request().postData() || '{}');
      savedBodies.push(body);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          connections: body.connections || [],
        }),
      });
    });

    await renderAdminRoute(page, '/admin/settings/connections');

    await expect(page.locator('.connection-acl-btn[data-id="conn-1"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#save-connections')).toBeDisabled();

    await page.locator('.connection-acl-btn[data-id="conn-1"]').click();
    await expect(page.locator('#connection-acl-list')).toBeVisible();

    await page.locator('#connection-acl-list .connection-acl-effect[data-group-id="g-1"]').selectOption('allow');
    await page.locator('#connection-acl-save-btn').click();

    await expect(page.locator('#connection-acl-list')).toHaveCount(0);
    await expect(page.locator('#save-connections')).toBeEnabled();
    expect(accessPutCalls).toBe(0);
    expect(saveCalls).toBe(0);

    await page.locator('#save-connections').click();

    await expect.poll(() => saveCalls).toBe(1);
    await expect(page.locator('#save-connections')).toBeDisabled();
    expect(savedBodies).toHaveLength(1);
    expect(savedBodies[0].access_updates).toHaveLength(1);
    expect(savedBodies[0].access_updates[0].connection_id).toBe('conn-1');
    expect(savedBodies[0].access_updates[0].rules).toHaveLength(1);
    expect(savedBodies[0].access_updates[0].rules[0]).toMatchObject({
      principal_type: 'group',
      principal_id: 'g-1',
      effect: 'allow',
      action: 'use',
    });
  });

  test('stages model toggles until the shared Save button commits them', async ({ page }) => {
    let saveCalls = 0;
    const savedBodies = [];

    await page.route('**/api/admin/models?**', async (route) => {
      if (route.request().method() !== 'GET') {
        return route.continue();
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          models: [
            {
              id: 'gpt-4',
              name: 'GPT-4',
              provider: 'openai',
              enabled: true,
            },
            {
              id: 'gpt-5-mini',
              name: 'GPT-5 Mini',
              provider: 'openai',
              enabled: false,
            },
          ],
          total: 2,
          active_total: 1,
          providers: [
            { value: 'all', label: 'All Providers', active: 1, total: 2 },
            { value: 'openai', label: 'OpenAI', active: 1, total: 2 },
          ],
        }),
      });
    });

    await page.route('**/api/admin/models', async (route) => {
      if (route.request().method() !== 'PUT') {
        return route.continue();
      }
      saveCalls += 1;
      const body = JSON.parse(route.request().postData() || '{}');
      savedBodies.push(body);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          models: body.updates?.length
            ? [
                { id: 'gpt-4', name: 'GPT-4', provider: 'openai', enabled: true },
                { id: 'gpt-5-mini', name: 'GPT-5 Mini', provider: 'openai', enabled: true },
              ]
            : [],
        }),
      });
    });

    await renderAdminRoute(page, '/admin/settings/models');

    await expect(page.locator('#save-models-top')).toBeDisabled({ timeout: 15000 });
    await expect(page.locator('[data-model-row="gpt-5-mini"]')).toBeVisible();

    await page.locator('[data-model-row="gpt-5-mini"] .model-toggle').click();

    await expect(page.locator('#save-models-top')).toBeEnabled();
    expect(saveCalls).toBe(0);

    await page.locator('#save-models-top').click();

    await expect.poll(() => saveCalls).toBe(1);
    await expect(page.locator('#save-models-top')).toBeDisabled();
    expect(savedBodies).toHaveLength(1);
    expect(savedBodies[0].updates).toHaveLength(1);
    expect(savedBodies[0].updates[0]).toMatchObject({
      id: 'gpt-5-mini',
      enabled: true,
    });
  });

  test('shows the unsaved changes modal when leaving dirty general settings', async ({ page }) => {
    await page.route('**/api/admin/config', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        public_registration: true,
        public_registration_status: 'pending',
        default_model_id: 'gpt-4',
      }),
    }));

    await renderAdminRoute(page, '/admin/settings/general');

    await expect(page.locator('#registration-status')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#save-settings')).toBeDisabled();

    await page.locator('#registration-status').selectOption('active');
    await expect(page.locator('#save-settings')).toBeEnabled();

    await page.locator('a[data-subnav="connections"]').click();
    await expect(page.locator('#admin-unsaved-modal')).toBeVisible();
    await page.locator('#unsaved-discard').click();

    await expect(page.locator('#admin-unsaved-modal')).toBeHidden();
    await expect(page).toHaveURL(/\/admin\/settings\/connections$/);
    await expect(page.locator('#save-connections')).toBeVisible();
  });

  test('blocks navigation with a native beforeunload prompt when the page is dirty', async ({ page }) => {
    await page.route('**/api/admin/config', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        public_registration: true,
        public_registration_status: 'pending',
        default_model_id: 'gpt-4',
      }),
    }));

    await renderAdminRoute(page, '/admin/settings/general');

    await expect(page.locator('#registration-status')).toBeVisible({ timeout: 15000 });
    await page.locator('#registration-status').selectOption('active');
    await expect(page.locator('#save-settings')).toBeEnabled();

    const dialogPromise = page.waitForEvent('dialog');
    const gotoPromise = page.goto('/');
    const dialog = await dialogPromise;

    expect(dialog.type()).toBe('beforeunload');
    await dialog.accept();
    await gotoPromise;
    await expect(page).toHaveURL(/\/$/);
  });
});

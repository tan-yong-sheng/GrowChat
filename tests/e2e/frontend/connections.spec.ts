import { test, expect } from '@playwright/test';

/**
 * E2E integration tests for the Connections (provider management) UI.
 * Tests both admin-level and account-level connection creation flows.
 *
 * These tests verify that:
 * - The add connection button opens the modal
 * - The connection form renders with correct fields
 * - Provider type selection works
 * - Connection creation via save works (with mocked API)
 * - Connection editing works
 */

// ── Admin Connections ────────────────────────────────────────────────────────

test.describe('Admin Connections', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the admin connections list API to return an empty list initially
    await page.route(
      (url) => url.pathname === '/api/admin/openai/connections',
      async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            json: {
              enabled: true,
              connections: [],
            },
          });
        } else if (route.request().method() === 'PUT') {
          // Mock the save endpoint
          await route.fulfill({
            status: 200,
            json: { ok: true },
          });
        } else {
          await route.fallback();
        }
      }
    );

    // Mock the connection test endpoint
    await page.route(
      (url) => url.pathname === '/api/admin/openai/connections/test',
      async (route) => {
        await route.fulfill({
          status: 200,
          json: {
            ok: true,
            models: [
              { id: 'gpt-4o', name: 'GPT-4o' },
              { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
            ],
          },
        });
      }
    );

    // Mock the admin models API (called when editing connections)
    await page.route(
      (url) => url.pathname === '/api/admin/models',
      async (route) => {
        await route.fulfill({
          status: 200,
          json: { models: [], total: 0 },
        });
      }
    );
  });

  test('add connection button opens the modal', async ({ page }) => {
    await page.goto('/admin/settings/connections');
    await page.waitForLoadState('domcontentloaded');

    // Wait for the connections section to render
    await page.waitForSelector('#connections-list', { timeout: 10000 });

    // Click the add connection button
    const addBtn = page.locator('#add-connection');
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    // Verify the modal opens
    const modal = page.locator('#edit-connection-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Verify modal title says "Add Connection"
    const title = page.locator('#modal-title');
    await expect(title).toHaveText('Add Connection');

    // Verify form fields are present
    await expect(page.locator('#modal-conn-name')).toBeVisible();
    await expect(page.locator('#modal-conn-url')).toBeVisible();
    await expect(page.locator('#modal-conn-key')).toBeVisible();
    await expect(page.locator('#modal-conn-provider')).toBeVisible();
  });

  test('provider type selection changes URL placeholder', async ({ page }) => {
    await page.goto('/admin/settings/connections');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#connections-list', { timeout: 10000 });

    // Open modal
    await page.locator('#add-connection').click();
    await expect(page.locator('#edit-connection-modal')).toBeVisible({ timeout: 5000 });

    // Select Gemini provider
    const providerSelect = page.locator('#modal-conn-provider');
    await providerSelect.selectOption('google');

    // URL field should update placeholder for Gemini
    const urlInput = page.locator('#modal-conn-url');
    const placeholder = await urlInput.getAttribute('placeholder');
    expect(placeholder).toContain('generativelanguage');
  });

  test('fill and save a new connection', async ({ page }) => {
    await page.goto('/admin/settings/connections');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#connections-list', { timeout: 10000 });

    // Open modal
    await page.locator('#add-connection').click();
    await expect(page.locator('#edit-connection-modal')).toBeVisible({ timeout: 5000 });

    // Fill in the form
    await page.locator('#modal-conn-name').fill('Test OpenAI');
    await page.locator('#modal-conn-key').fill('sk-test-key-12345');

    // Click Save
    await page.locator('#save-modal').click();

    // The save button should show saving state briefly, then modal should close
    // (our mocked API returns immediately)
    await expect(page.locator('#edit-connection-modal')).toHaveClass(/hidden/, { timeout: 5000 });
  });

  test('close button dismisses the modal', async ({ page }) => {
    await page.goto('/admin/settings/connections');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#connections-list', { timeout: 10000 });

    // Open modal
    await page.locator('#add-connection').click();
    const modal = page.locator('#edit-connection-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Close via X button
    await page.locator('#close-modal').click();
    await expect(modal).toHaveClass(/hidden/, { timeout: 5000 });
  });

  test('edit existing connection opens modal with data', async ({ page }) => {
    // Override the connections list API to return a pre-existing connection
    await page.route(
      (url) => url.pathname === '/api/admin/openai/connections',
      async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            json: {
              enabled: true,
              connections: [
                {
                  id: 'conn_test1',
                  name: 'My OpenAI',
                  url: 'https://api.openai.com/v1',
                  provider_type: 'openai',
                  enabled: true,
                  source: 'manual',
                  has_key: true,
                  key_masked: 'sk-****5678',
                  manual_models: [],
                },
              ],
            },
          });
        } else if (route.request().method() === 'PUT') {
          await route.fulfill({ status: 200, json: { ok: true } });
        } else {
          await route.fallback();
        }
      }
    );

    await page.goto('/admin/settings/connections');
    await page.waitForLoadState('domcontentloaded');

    // Wait for the connection row to appear
    await page.waitForSelector('[data-connection-row="conn_test1"]', { timeout: 10000 });

    // Click the edit button
    await page.locator('.edit-connection-btn[data-id="conn_test1"]').click();

    // Verify modal opens with "Edit Connection" title
    const modal = page.locator('#edit-connection-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#modal-title')).toHaveText('Edit Connection');

    // Verify the name field is pre-filled
    await expect(page.locator('#modal-conn-name')).toHaveValue('My OpenAI');
  });

  test('connection toggle click persists the new enabled state', async ({ page }) => {
    let storedEnabled = true;
    await page.route(
      (url) => url.pathname === '/api/admin/openai/connections',
      async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            json: {
              enabled: true,
              connections: [
                {
                  id: 'conn_test1',
                  name: 'My OpenAI',
                  url: 'https://api.openai.com/v1',
                  provider_type: 'openai',
                  enabled: storedEnabled,
                  source: 'manual',
                  has_key: true,
                  key_masked: 'sk-****5678',
                  manual_models: [],
                },
              ],
            },
          });
        } else if (route.request().method() === 'PUT') {
          // Capture the new enabled state for the next GET
          const body = JSON.parse(route.request().postData() || '{}');
          if (Array.isArray(body.connections)) {
            const target = body.connections.find((c) => c.id === 'conn_test1');
            if (target) storedEnabled = target.enabled !== false;
          }
          await route.fulfill({ status: 200, json: { ok: true } });
        } else {
          await route.fallback();
        }
      }
    );

    await page.goto('/admin/settings/connections');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('[data-connection-row="conn_test1"]', { timeout: 10000 });

    // Initially enabled — toggle should have bg-black (not bg-gray-200)
    const toggle = page.locator('.connection-toggle[data-id="conn_test1"]');
    await expect(toggle).toHaveClass(/bg-black/);
    await expect(toggle).not.toHaveClass(/bg-gray-200/);

    // Click the toggle to disable
    await toggle.click();

    // Immediately the local row reflects the disabled state
    await expect(toggle).toHaveClass(/bg-gray-200/);

    // Reload and confirm the new state is persisted
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('[data-connection-row="conn_test1"]', { timeout: 10000 });

    // After reload the disabled state is restored from the GET mock
    const toggleAfterReload = page.locator('.connection-toggle[data-id="conn_test1"]');
    await expect(toggleAfterReload).toHaveClass(/bg-gray-200/);
  });

  test('acl button opens the access-rules modal', async ({ page }) => {
    // Mock the connection ACL access endpoint that the modal fetches
    await page.route(
      (url) => url.pathname === '/api/admin/openai/connections/conn_test1/access',
      async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            json: {
              groups: [{ id: 'g1', name: 'Admins' }],
              rules: [],
            },
          });
        } else {
          await route.fulfill({ status: 200, json: { ok: true } });
        }
      }
    );

    // Override the connections list API to return one enabled connection
    await page.route(
      (url) => url.pathname === '/api/admin/openai/connections',
      async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            json: {
              enabled: true,
              connections: [
                {
                  id: 'conn_test1',
                  name: 'My OpenAI',
                  url: 'https://api.openai.com/v1',
                  provider_type: 'openai',
                  enabled: true,
                  source: 'manual',
                  has_key: true,
                  key_masked: 'sk-****5678',
                  manual_models: [],
                },
              ],
            },
          });
        } else if (route.request().method() === 'PUT') {
          await route.fulfill({ status: 200, json: { ok: true } });
        } else {
          await route.fallback();
        }
      }
    );

    await page.goto('/admin/settings/connections');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('[data-connection-row="conn_test1"]', { timeout: 10000 });

    // ACL button must be visible (connection enabled + canManageAcls defaults true)
    const aclBtn = page.locator('.connection-acl-btn[data-id="conn_test1"]');
    await expect(aclBtn).toBeVisible();

    await aclBtn.click();

    // The ACL modal is appended to document.body with title "Connection Access"
    await expect(page.locator('text=Connection Access').first()).toBeVisible({ timeout: 5000 });
    // The modal exposes the connection name as subtitle
    await expect(page.locator('text=My OpenAI').first()).toBeVisible();
  });

  test('buttons remain clickable after toggling another connection', async ({ page }) => {
    await page.route(
      (url) => url.pathname === '/api/admin/openai/connections',
      async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            json: {
              enabled: true,
              connections: [
                {
                  id: 'conn_a',
                  name: 'Alpha Connection',
                  url: 'https://a.example.com/v1',
                  provider_type: 'openai-compatible',
                  enabled: true,
                  source: 'manual',
                  has_key: true,
                  key_masked: 'sk-****aaaa',
                  manual_models: [],
                },
                {
                  id: 'conn_b',
                  name: 'Beta Connection',
                  url: 'https://b.example.com/v1',
                  provider_type: 'openai-compatible',
                  enabled: true,
                  source: 'manual',
                  has_key: true,
                  key_masked: 'sk-****bbbb',
                  manual_models: [],
                },
              ],
            },
          });
        } else if (route.request().method() === 'PUT') {
          await route.fulfill({ status: 200, json: { ok: true } });
        } else {
          await route.fallback();
        }
      }
    );

    await page.goto('/admin/settings/connections');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('[data-connection-row="conn_a"]', { timeout: 10000 });
    await page.waitForSelector('[data-connection-row="conn_b"]', { timeout: 10000 });

    // Click the toggle on conn_a to disable it.
    // The click handler is synchronous for the class update but the PUT is async.
    // Wait for the PUT response to succeed (the catch block reverts if PUT fails).
    const toggleA = page.locator('.connection-toggle[data-id="conn_a"]');
    const putAResponse = page.waitForResponse(
      (resp) =>
        resp.url().endsWith('/api/admin/openai/connections') && resp.request().method() === 'PUT'
    );
    await toggleA.click();
    const resp = await putAResponse;
    expect(resp.status()).toBe(200);
    // Allow the broadcast invalidation callbacks to settle before checking the next button
    await page.waitForTimeout(200);

    // Click edit on a DIFFERENT row (conn_b) — the user-reported scenario
    await page.locator('.edit-connection-btn[data-id="conn_b"]').click();
    const modal = page.locator('#edit-connection-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#modal-title')).toHaveText('Edit Connection');
    await expect(page.locator('#modal-conn-name')).toHaveValue('Beta Connection');

    // Close the modal
    await page.locator('#close-modal').click();
    await expect(modal).toHaveClass(/hidden/, { timeout: 5000 });

    // The #add-connection button must also still respond
    await page.locator('#add-connection').click();
    await expect(modal).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#modal-title')).toHaveText('Add Connection');
  });

  test('manual-model delete + cancel does not resurrect the deleted model on reopen', async ({
    page,
  }) => {
    // Mock the admin connections list with a connection that has a manual model.
    await page.route(
      (url) => url.pathname === '/api/admin/openai/connections',
      async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            json: {
              enabled: true,
              connections: [
                {
                  id: 'conn_cancel',
                  name: 'Cancel Test',
                  url: 'https://api.openai.com/v1',
                  provider_type: 'openai',
                  enabled: true,
                  source: 'manual',
                  has_key: true,
                  key_masked: 'sk-****0000',
                  manualModels: [
                    { modelId: 'gpt-3', name: 'gpt-3' },
                    { modelId: 'gpt-4', name: 'gpt-4' },
                  ],
                },
              ],
            },
          });
        } else if (route.request().method() === 'PUT') {
          await route.fulfill({ status: 200, json: { ok: true } });
        } else {
          await route.fallback();
        }
      }
    );

    await page.goto('/admin/settings/connections');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('[data-connection-row="conn_cancel"]', { timeout: 10000 });

    // Open the edit modal — both manual models should be listed.
    await page.locator('.edit-connection-btn[data-id="conn_cancel"]').click();
    const modal = page.locator('#edit-connection-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });
    await expect(modal.locator('[data-delete-model-id]')).toHaveCount(2);

    // Delete the gpt-3 manual model.
    const deleteGpt3 = modal.locator('[data-delete-model-id$=":gpt-3"]');
    await deleteGpt3.first().click();
    // After delete, only the gpt-4 delete button remains.
    await expect(modal.locator('[data-delete-model-id]')).toHaveCount(1);
    await expect(modal.locator('[data-delete-model-id]').first()).toHaveAttribute(
      'data-delete-model-id',
      /gpt-4$/
    );

    // Cancel — close the modal without saving.
    await page.locator('#close-modal').click();
    await expect(modal).toHaveClass(/hidden/, { timeout: 5000 });

    // Reopen the modal — gpt-3 must still be listed because the cancel should
    // not have mutated the live connection state, and the next open reseeds
    // from connection.manualModels which is the DB view.
    await page.locator('.edit-connection-btn[data-id="conn_cancel"]').click();
    await expect(modal).toBeVisible({ timeout: 5000 });
    await expect(modal.locator('[data-delete-model-id]')).toHaveCount(2);
    const ids = await modal
      .locator('[data-delete-model-id]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-delete-model-id')));
    expect(ids.some((id) => /:gpt-3$/.test(id))).toBe(true);
    expect(ids.some((id) => /:gpt-4$/.test(id))).toBe(true);
  });
});

// ── Account Connections ───────────────────────────────────────────────────────

test.describe('Account Connections', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the user connections API
    await page.route(
      (url) => url.pathname === '/api/user/connections',
      async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            json: {
              my_connections: [],
              connections: [],
            },
          });
        } else if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 200,
            json: {
              ok: true,
              connection: {
                id: 'new-conn-1',
                name: 'Test Connection',
                provider_type: 'openai-compatible',
                base_url: 'https://api.openai.com/v1',
                enabled: true,
              },
            },
          });
        } else {
          await route.fallback();
        }
      }
    );

    // Mock the user settings API (needed for account page to load)
    await page.route(
      (url) => url.pathname === '/api/users/me/settings',
      async (route) => {
        await route.fulfill({
          status: 200,
          json: {
            user: {
              id: 'test-user',
              email: 'admin@test.com',
              name: 'Admin',
              account_status: 'active',
              preferences: {},
            },
            settings: {
              connections: { my_connections: [], connections: [] },
              preferences: {},
            },
            capabilities: {
              can_manage_connections: true,
            },
          },
        });
      }
    );
  });

  // Account connections drawer opens as an overlay on top of the main app.
  // Testing this requires a full client-side navigation flow that's complex
  // to set up reliably in E2E. The admin connection tests above cover the
  // same modal/form behavior with the shared connection-modal component.
  test.skip('add connection button opens the account modal', async ({ page }) => {
    // TODO: Implement account drawer E2E test once the drawer rendering is
    // more testable (e.g., via a dedicated route or data-testid on the drawer).
  });
});

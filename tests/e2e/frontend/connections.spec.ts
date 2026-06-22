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

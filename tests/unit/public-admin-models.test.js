// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  broadcastModelsInvalidation: vi.fn(),
}));

vi.mock('../../public/js/shared/api.js', () => ({
  apiFetch: (...args) => mocks.apiFetch(...args),
}));

vi.mock('../../public/js/shared/utils/model-sync.js', () => ({
  broadcastModelsInvalidation: (...args) => mocks.broadcastModelsInvalidation(...args),
}));

async function loadModule() {
  vi.resetModules();
  return import('../../public/js/features/admin/settings/models.js');
}

describe('admin models settings', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root" data-settings-tab="models"></div>';
    vi.clearAllMocks();
    mocks.apiFetch.mockImplementation(async (url) => {
      if (String(url).startsWith('/api/admin/models?')) {
        return new Response(JSON.stringify({
          models: [
            { id: 'model-a', name: 'Model A', enabled: true, attachments: { image: false, pdf: false } },
          ],
          total: 1,
          active_total: 1,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (String(url) === '/api/admin/model-attachment-caps') {
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
  });

  it('keeps the main Save button enabled after a model toggle changes', async () => {
    const { renderModelsSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    renderModelsSettings(container, data);
    await vi.waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/models?limit=20&offset=0'));
    await vi.waitFor(() => expect(data.modelsSettings.loading).toBe(false));
    await vi.waitFor(() => expect(container.querySelector('.model-toggle')).not.toBeNull());

    const beforeCalls = mocks.apiFetch.mock.calls.length;
    container.querySelector('.model-toggle')?.click();

    // Immediate-save pattern: API call should be made immediately
    await vi.waitFor(() => expect(mocks.apiFetch.mock.calls.length).toBeGreaterThan(beforeCalls));
  });

  it('filters provider options to active entries and uses provider name in requests', async () => {
    const { renderModelsSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    mocks.apiFetch.mockImplementation(async (url) => {
      if (String(url).startsWith('/api/admin/models?')) {
        return new Response(JSON.stringify({
          models: [
            { id: 'model-a', name: 'Model A', enabled: true, attachments: { image: false, pdf: false } },
            { id: 'model-b', name: 'Model B', enabled: false, attachments: { image: false, pdf: false } },
          ],
          total: 2,
          active_total: 1,
          providers: [
            { value: 'openai main', label: 'OpenAI Main', active: 1, total: 2 },
            { value: 'claude main', label: 'Claude Main', active: 0, total: 2 },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    renderModelsSettings(container, data);
    await vi.waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/models?limit=20&offset=0'));
    await vi.waitFor(() => expect(container.querySelector('#model-provider-select')).not.toBeNull());
    await vi.waitFor(() => {
      const select = container.querySelector('#model-provider-select');
      const text = Array.from(select.options).map((option) => option.textContent.trim()).join(' ');
      expect(text).toContain('OpenAI Main');
    });

    const providerSelect = container.querySelector('#model-provider-select');
    const options = Array.from(providerSelect.options).map((option) => option.textContent.trim());
    const joined = options.join(' ');
    expect(joined).toContain('All Providers');
    expect(joined).toContain('OpenAI Main');
    expect(joined).not.toContain('Claude Main');

    const beforeCalls = mocks.apiFetch.mock.calls.length;
    providerSelect.value = providerSelect.options[1]?.value || 'openai main';
    providerSelect.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => expect(mocks.apiFetch.mock.calls.length).toBeGreaterThan(beforeCalls));
    expect(
      mocks.apiFetch.mock.calls.some(([url]) => /provider=openai(\+|%20)main/.test(String(url)))
    ).toBe(true);
  });

  it('dims disabled models and hides the ACL lock button for them', async () => {
    const { renderModelsSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    mocks.apiFetch.mockImplementation(async (url) => {
      if (String(url).startsWith('/api/admin/models?')) {
        return new Response(JSON.stringify({
          models: [
            { id: 'model-a', name: 'Model A', enabled: true, attachments: { image: false, pdf: false } },
            { id: 'model-b', name: 'Model B', enabled: false, attachments: { image: false, pdf: false } },
          ],
          total: 2,
          active_total: 1,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    renderModelsSettings(container, data);
    await vi.waitFor(() => expect(container.querySelector('#models-table-body')).not.toBeNull());
    await vi.waitFor(() => expect(container.textContent).toContain('Model B'));

    const rows = Array.from(container.querySelectorAll('#models-table-body tr'));
    const disabledRow = rows.find((row) => row.textContent.includes('Model B'));
    expect(disabledRow).toBeTruthy();
    expect(disabledRow.className).toContain('opacity-70');
    expect(disabledRow.querySelector('[data-model-acl]')).not.toBeNull();
    expect(disabledRow.querySelector('[data-model-acl]')?.classList.contains('hidden')).toBe(true);
    expect(disabledRow.querySelector('.model-toggle')).toBeTruthy();
  });

  it('hides and restores the model ACL lock button immediately when toggling enabled state', async () => {
    const { renderModelsSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    renderModelsSettings(container, data);
    await vi.waitFor(() => expect(container.querySelector('[data-model-acl="model-a"]')).not.toBeNull());

    container.querySelector('.model-toggle')?.click();
    await vi.waitFor(() => expect(container.querySelector('[data-model-acl="model-a"]')?.classList.contains('hidden')).toBe(true));

    container.querySelector('.model-toggle')?.click();
    await vi.waitFor(() => expect(container.querySelector('[data-model-acl="model-a"]')?.classList.contains('hidden')).toBe(false));
  });

  it('keeps model rows in place while toggling enabled state', async () => {
    const { renderModelsSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    mocks.apiFetch.mockImplementation(async (url) => {
      if (String(url).startsWith('/api/admin/models?')) {
        return new Response(JSON.stringify({
          models: [
            { id: 'model-z', name: 'Model Z', enabled: true, attachments: { image: false, pdf: false } },
            { id: 'model-a', name: 'Model A', enabled: false, attachments: { image: false, pdf: false } },
          ],
          total: 2,
          active_total: 1,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    renderModelsSettings(container, data);
    await vi.waitFor(() => expect(container.querySelectorAll('#models-table-body tr').length).toBe(2));

    const initialRows = Array.from(container.querySelectorAll('#models-table-body tr')).map((row) => row.textContent.trim());
    expect(initialRows[0]).toContain('Model Z');
    expect(initialRows[1]).toContain('Model A');

    const modelAToggle = Array.from(container.querySelectorAll('.model-toggle')).find((button) => button.dataset.modelId === 'model-a');
    modelAToggle?.click();

    await vi.waitFor(() => {
      const rows = Array.from(container.querySelectorAll('#models-table-body tr')).map((row) => row.textContent.trim());
      expect(rows[0]).toContain('Model Z');
      expect(rows[1]).toContain('Model A');
    });
  });

  it('keeps an explicit No Access ACL draft dirty and saves a combined model settings payload', async () => {
    const { renderModelsSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    mocks.apiFetch.mockImplementation(async (url, options = {}) => {
      const requestUrl = String(url);
      if (requestUrl.startsWith('/api/admin/models?')) {
        return new Response(JSON.stringify({
          models: [
            {
              id: 'openai/env-openai-0:gemini-2.5-flash',
              name: 'gemini-2.5-flash',
              enabled: true,
              attachments: { image: false, pdf: false },
            },
          ],
          total: 1,
          active_total: 1,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (requestUrl === '/api/admin/models/openai%2Fenv-openai-0%3Agemini-2.5-flash/access' && (!options.method || options.method === 'GET')) {
        return new Response(JSON.stringify({
          model_id: 'openai/env-openai-0:gemini-2.5-flash',
          groups: [
            { id: 'group-1', name: 'test1', description: 'Test Group', is_system: false },
          ],
          rules: [
            {
              model_id: 'openai/env-openai-0:gemini-2.5-flash',
              principal_type: 'group',
              principal_id: 'group-1',
              effect: 'allow',
              action: 'use',
            },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (requestUrl === '/api/admin/models/openai%2Fenv-openai-0%3Agemini-2.5-flash/access' && options.method === 'PUT') {
        return new Response(JSON.stringify({
          model_id: 'openai/env-openai-0:gemini-2.5-flash',
          rules: [],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    renderModelsSettings(container, data);
    await vi.waitFor(() => expect(container.querySelector('[data-model-acl="openai/env-openai-0:gemini-2.5-flash"]')).not.toBeNull());

    const capButton = container.querySelector('[data-cap-model="openai/env-openai-0:gemini-2.5-flash"][data-cap-kind="image"]');
    expect(capButton).toBeTruthy();
    capButton.click();

    container.querySelector('[data-model-acl="openai/env-openai-0:gemini-2.5-flash"]').click();
    await vi.waitFor(() => {
      expect(mocks.apiFetch.mock.calls.some(([url]) => String(url) === '/api/admin/models/openai%2Fenv-openai-0%3Agemini-2.5-flash/access')).toBe(true);
    });
    await vi.waitFor(() => expect(document.body.textContent).toContain('Test Group'));

    const select = document.querySelector('.model-acl-effect[data-group-id="group-1"]');
    expect(select).toBeTruthy();
    select.value = 'none';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    // Immediate-save pattern: ACL changes are saved immediately when the modal is closed
    document.querySelector('#model-acl-save-btn').click();
    await vi.waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith(
      '/api/admin/models',
      expect.objectContaining({
        method: 'PUT',
        body: expect.any(String),
      })
    ));

    // With immediate-save, attachment and ACL changes are saved in separate calls
    // Check for attachment update call
    const attachmentCall = mocks.apiFetch.mock.calls.find(([url, options]) => {
      if (String(url) !== '/api/admin/models' || String(options?.method || 'GET').toUpperCase() !== 'PUT') return false;
      const body = JSON.parse(options.body);
      return body.attachment_updates && body.attachment_updates.length > 0;
    });
    expect(attachmentCall).toBeTruthy();
    const attachmentPayload = JSON.parse(attachmentCall[1].body);
    expect(attachmentPayload.attachment_updates).toEqual([
      {
        model_id: 'openai/env-openai-0:gemini-2.5-flash',
        attachments: { image: true },
      },
    ]);

    // Check for ACL update call
    const aclCall = mocks.apiFetch.mock.calls.find(([url, options]) => {
      if (String(url) !== '/api/admin/models' || String(options?.method || 'GET').toUpperCase() !== 'PUT') return false;
      const body = JSON.parse(options.body);
      return body.access_updates && body.access_updates.length > 0;
    });
    expect(aclCall).toBeTruthy();
    const aclPayload = JSON.parse(aclCall[1].body);
    expect(aclPayload.access_updates).toEqual([
      {
        modelId: 'openai/env-openai-0:gemini-2.5-flash',
        rules: [],
      },
    ]);
  });
});



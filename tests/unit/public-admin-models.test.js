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
    mocks.apiFetch.mockImplementation(async (url, options = {}) => {
      if (String(url).startsWith('/api/admin/models?')) {
        return new Response(JSON.stringify({
          models: [
            { id: 'model-a', name: 'Model A', enabled: true, access_label: 'Admin', access_variant: 'admin', attachments: { image: false, pdf: false } },
            { id: 'model-b', name: 'Model B', enabled: false, access_label: 'Shared', access_variant: 'shared', attachments: { image: false, pdf: false } },
          ],
          total: 2,
          active_total: 1,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (String(url) === '/api/admin/models' && String(options.method || 'GET').toUpperCase() === 'PUT') {
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
  });

  it('renders only selected models without an enable/disable toggle', async () => {
    const { renderModelsSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    renderModelsSettings(container, data);
    await vi.waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/models?limit=0&offset=0'));
    await vi.waitFor(() => expect(data.modelsSettings.loading).toBe(false));

    expect(container.querySelector('.model-toggle')).toBeNull();
    expect(container.querySelector('[title="Selected models"]')?.textContent).toBe('1');
    expect(container.textContent).toContain('Selected models');
    expect(container.textContent).toContain('Model A');
    expect(container.textContent).not.toContain('Model B');
    expect(container.querySelector('thead')?.textContent).toContain('Access');
    expect(container.querySelector('thead')?.textContent).not.toContain('Input');
    expect(container.querySelector('[data-model-access="model-a"]')?.textContent).toContain('Admin');
  });

  it('filters provider options from the selected set only', async () => {
    const { renderModelsSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    mocks.apiFetch.mockImplementation(async (url) => {
      if (String(url).startsWith('/api/admin/models?')) {
        return new Response(JSON.stringify({
          models: [
            { id: 'model-a', name: 'Model A', provider_family: 'openai', provider_type: 'openai', enabled: true, attachments: { image: false, pdf: false } },
            { id: 'model-b', name: 'Model B', provider_family: 'anthropic', provider_type: 'anthropic', enabled: false, attachments: { image: false, pdf: false } },
          ],
          total: 2,
          active_total: 1,
          providers: [
            { value: 'openai', label: 'OpenAI', active: 1, total: 1 },
            { value: 'claude', label: 'Claude', active: 0, total: 1 },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    renderModelsSettings(container, data);
    await vi.waitFor(() => expect(container.querySelector('#model-provider-select')).not.toBeNull());
    await vi.waitFor(() => expect(container.textContent).toContain('Model A'));

    const providerSelect = container.querySelector('#model-provider-select');
    const options = Array.from(providerSelect.options).map((option) => option.textContent.trim()).join(' ');
    expect(options).toContain('All Providers');
    expect(options.toLowerCase()).toContain('openai');
    expect(options.toLowerCase()).not.toContain('anthropic');
  });

  it('keeps ACL editing available for selected models', async () => {
    const { renderModelsSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    renderModelsSettings(container, data);
    await vi.waitFor(() => expect(container.querySelector('[data-model-acl="model-a"]')).not.toBeNull());
    expect(container.querySelector('[data-model-acl="model-a"]')?.classList.contains('hidden')).toBe(false);
    expect(container.querySelector('[data-model-acl="model-b"]')).toBeNull();
  });

  it('keeps explicit No Access ACL edits and saves a combined model settings payload', async () => {
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
              provider: 'openai',
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

    container.querySelector('[data-model-acl="openai/env-openai-0:gemini-2.5-flash"]').click();
    await vi.waitFor(() => {
      expect(mocks.apiFetch.mock.calls.some(([url]) => String(url) === '/api/admin/models/openai%2Fenv-openai-0%3Agemini-2.5-flash/access')).toBe(true);
    });
    await vi.waitFor(() => expect(document.body.textContent).toContain('Test Group'));

    const select = document.querySelector('.model-acl-effect[data-group-id="group-1"]');
    expect(select).toBeTruthy();
    select.value = 'none';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    document.querySelector('#model-acl-save-btn').click();
    await vi.waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith(
      '/api/admin/models',
      expect.objectContaining({
        method: 'PUT',
        body: expect.any(String),
      })
    ));

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

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
  return import('../../public/js/features/admin/settings/connections.js');
}

describe('admin connections modal', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root" data-settings-tab="connections"></div>';
    localStorage.clear();
    vi.restoreAllMocks();
    mocks.apiFetch.mockImplementation(async (url) => {
      if (String(url).includes('/api/admin/openai/connections')) {
        return new Response(JSON.stringify({
          enabled: true,
          connections: [],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (String(url).includes('/api/admin/models')) {
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
  });

  it('creates a draft connection from the modal and saves it into state', async () => {
    const { renderConnectionsSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    renderConnectionsSettings(container, data);
    await vi.waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/openai/connections?include_disabled=1'));
    await vi.waitFor(() => expect(data.connectionsSettings.originalSnapshot).not.toBeNull());
    await vi.waitFor(() => expect(container.querySelector('#save-connections')?.disabled).toBe(true));

    container.querySelector('#add-connection')?.click();
    expect(container.querySelector('#modal-title')?.textContent).toBe('Add Connection');
    expect(container.querySelector('#edit-connection-modal')?.className).toContain('items-start');
    expect(container.querySelector('#edit-connection-modal')?.className).toContain('overflow-y-auto');
    container.querySelector('#modal-conn-name').value = 'OpenAI';
    container.querySelector('#modal-conn-url').value = 'https://api.openai.com/v1';
    container.querySelector('#modal-conn-key').value = 'secret';
    container.querySelector('#modal-conn-headers').value = '{"x-test":"1"}';
    container.querySelector('#save-modal')?.click();

    await vi.waitFor(() => expect(container.querySelector('#edit-connection-modal')?.classList.contains('hidden')).toBe(true));
    expect(data.connectionsSettings.openai.connections).toHaveLength(1);
    expect(container.querySelector('#save-connections')?.disabled).toBe(false);
    expect(data.connectionsSettings.openai.connections[0]).toMatchObject({
      name: 'OpenAI',
      url: 'https://api.openai.com/v1',
      key: 'secret',
      headers: '{"x-test":"1"}',
      providerType: 'openai',
      enabled: true,
    });
    expect(mocks.apiFetch.mock.calls.some(([url, init]) => String(url) === '/api/admin/openai/connections' && init?.method === 'PUT')).toBe(false);
  });

  it('labels the modal as edit when opening an existing connection', async () => {
    mocks.apiFetch.mockImplementation(async (url) => {
      if (String(url).includes('/api/admin/openai/connections')) {
        return new Response(JSON.stringify({
          enabled: true,
          connections: [
            {
              id: 'conn-1',
              name: 'OpenAI',
              url: 'https://api.openai.com/v1',
              key: 'secret',
              providerType: 'openai',
            },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const { renderConnectionsSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    renderConnectionsSettings(container, data);
    await vi.waitFor(() => expect(container.querySelector('.edit-connection-btn')).not.toBeNull());

    container.querySelector('.edit-connection-btn')?.click();
    expect(container.querySelector('#modal-title')?.textContent).toBe('Edit Connection');
  });

  it('does not render a master provider toggle and keeps providers visible', async () => {
    mocks.apiFetch.mockImplementationOnce(async (url) => {
      if (String(url).includes('/api/admin/openai/connections')) {
        return new Response(JSON.stringify({
          enabled: false,
          connections: [],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const { renderConnectionsSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    renderConnectionsSettings(container, data);
    await vi.waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/openai/connections?include_disabled=1'));
    await vi.waitFor(() => expect(data.connectionsSettings.originalSnapshot).not.toBeNull());
    await vi.waitFor(() => expect(container.querySelector('#save-connections')?.disabled).toBe(true));

    expect(container.querySelector('#openai-toggle')).toBeNull();
    expect(container.querySelector('#manage-connections-section')).not.toBeNull();
    expect(container.querySelector('#manage-connections-section')?.classList.contains('hidden')).toBe(false);
  });

  it('sorts enabled connections before disabled ones on reload', async () => {
    mocks.apiFetch.mockImplementationOnce(async (url) => {
      if (String(url).includes('/api/admin/openai/connections')) {
        return new Response(JSON.stringify({
          enabled: true,
          connections: [
            {
              id: 'conn-disabled',
              name: 'Zulu Connection',
              url: 'https://zulu.example.com',
              providerType: 'openai',
              enabled: false,
            },
            {
              id: 'conn-enabled',
              name: 'Alpha Connection',
              url: 'https://alpha.example.com',
              providerType: 'openai',
              enabled: true,
            },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const { renderConnectionsSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    renderConnectionsSettings(container, data);
    await vi.waitFor(() => expect(container.querySelectorAll('[data-connection-row]').length).toBe(2));

    const rows = Array.from(container.querySelectorAll('[data-connection-row]')).map((row) => row.textContent.trim());
    expect(rows[0]).toContain('Alpha Connection');
    expect(rows[1]).toContain('Zulu Connection');
  });

  it('saves env overrides when toggling a provider and invalidates models', async () => {
    let lastPutBody = null;
    mocks.apiFetch.mockImplementation(async (url, init) => {
      const target = String(url);
      if (target.includes('/api/admin/openai/connections') && init?.method === 'PUT') {
        lastPutBody = JSON.parse(init.body || '{}');
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (target.includes('/api/admin/openai/connections')) {
        return new Response(JSON.stringify({
          enabled: true,
          connections: [
            {
              id: 'env-openai-0',
              name: 'OpenAI (proxy)',
              url: 'https://proxy.tanyongsheng.site/v1',
              providerType: 'openai',
              source: 'env',
              readOnly: true,
              enabled: true,
            },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const { renderConnectionsSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    renderConnectionsSettings(container, data);
    await vi.waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/openai/connections?include_disabled=1'));
    await vi.waitFor(() => expect(container.querySelector('.connection-toggle')).not.toBeNull());
    expect(container.querySelector('.connection-acl-btn')).not.toBeNull();

    container.querySelector('.connection-toggle')?.click();
    expect(container.querySelector('#save-connections')?.disabled).toBe(false);
    await vi.waitFor(() => expect(container.querySelector('.connection-acl-btn')?.classList.contains('hidden')).toBe(true));

    container.querySelector('.connection-toggle')?.click();
    await vi.waitFor(() => expect(container.querySelector('.connection-acl-btn')?.classList.contains('hidden')).toBe(false));

    container.querySelector('.connection-toggle')?.click();
    await vi.waitFor(() => expect(container.querySelector('.connection-acl-btn')?.classList.contains('hidden')).toBe(true));

    container.querySelector('#save-connections')?.click();
    await vi.waitFor(() => expect(lastPutBody).not.toBeNull());
    expect(lastPutBody.env_overrides).toEqual({ 'env-openai-0': false });
    await vi.waitFor(() => expect(mocks.broadcastModelsInvalidation).toHaveBeenCalled());
    expect(data.modelsSettingsInvalidate).toBeTruthy();
    expect(lastPutBody.model_updates).toEqual([]);
    expect(lastPutBody.access_updates).toEqual([]);
  });

  it('keeps disabled connections visible on reload', async () => {
    mocks.apiFetch.mockImplementationOnce(async (url) => {
      if (String(url).includes('/api/admin/openai/connections')) {
        return new Response(JSON.stringify({
          enabled: true,
          connections: [
            {
              id: 'conn-disabled',
              name: 'Archived Connection',
              url: 'https://disabled.example.com',
              providerType: 'openai',
              enabled: false,
            },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const { renderConnectionsSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    renderConnectionsSettings(container, data);
    await vi.waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/openai/connections?include_disabled=1'));
    await vi.waitFor(() => expect(container.textContent).toContain('Archived Connection'));
    expect(container.textContent).toContain('Disabled');
    expect(container.querySelector('.connection-toggle')?.classList.contains('bg-gray-200')).toBe(true);
    expect(container.querySelector('[data-settings-tab="connections"] [class*="opacity-70"]')).not.toBeNull();
  });
});



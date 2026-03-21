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
    await vi.waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/openai/connections'));
    await vi.waitFor(() => expect(data.connectionsSettings.originalSnapshot).not.toBeNull());
    await vi.waitFor(() => expect(container.querySelector('#save-connections')?.disabled).toBe(true));

    container.querySelector('#add-connection')?.click();
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
    await vi.waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/openai/connections'));
    await vi.waitFor(() => expect(data.connectionsSettings.originalSnapshot).not.toBeNull());
    await vi.waitFor(() => expect(container.querySelector('#save-connections')?.disabled).toBe(true));

    expect(container.querySelector('#openai-toggle')).toBeNull();
    expect(container.querySelector('#manage-connections-section')).not.toBeNull();
    expect(container.querySelector('#manage-connections-section')?.classList.contains('hidden')).toBe(false);
  });
});



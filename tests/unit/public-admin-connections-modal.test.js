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
        return new Response(
          JSON.stringify({
            enabled: true,
            connections: [],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (String(url).includes('/api/admin/models')) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
  });

  it('creates a connection from the modal and saves it into state', async () => {
    const { renderConnectionsSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    renderConnectionsSettings(container, data);
    await vi.waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        '/api/admin/openai/connections?include_disabled=1'
      )
    );

    container.querySelector('#add-connection')?.click();
    expect(container.querySelector('#modal-title')?.textContent).toBe('Add Connection');
    expect(container.querySelector('#edit-connection-modal')?.className).toContain('items-start');
    expect(container.querySelector('#edit-connection-modal')?.className).toContain(
      'overflow-y-auto'
    );
    expect(window.location.hash).toBe('#add-connection-modal');
    container.querySelector('#modal-conn-name').value = 'OpenAI';
    container.querySelector('#modal-conn-url').value = 'https://api.openai.com/v1';
    container.querySelector('#modal-conn-key').value = 'secret';
    container.querySelector('#modal-conn-headers').value = '{"x-test":"1"}';
    container.querySelector('#save-modal')?.click();

    // Immediate-save: API call should be made when modal is saved
    await vi.waitFor(() =>
      expect(
        mocks.apiFetch.mock.calls.some(
          ([url, init]) => String(url) === '/api/admin/openai/connections' && init?.method === 'PUT'
        )
      ).toBe(true)
    );
    await vi.waitFor(() =>
      expect(container.querySelector('#edit-connection-modal')?.classList.contains('hidden')).toBe(
        true
      )
    );
    expect(window.location.hash).toBe('');
    expect(data.connectionsSettings.openai.connections).toHaveLength(1);
    expect(data.connectionsSettings.openai.connections[0]).toMatchObject({
      name: 'OpenAI',
      url: 'https://api.openai.com/v1',
      key: 'secret',
      headers: '{"x-test":"1"}',
      providerType: 'openai',
      enabled: true,
    });
  });

  it('verifies a new connection without payload TDZ errors', async () => {
    mocks.apiFetch.mockImplementation(async (url, init) => {
      const target = String(url);
      if (target.includes('/api/admin/openai/connections?include_disabled=1')) {
        return new Response(
          JSON.stringify({
            enabled: true,
            connections: [],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (target.includes('/api/admin/models')) {
        return new Response(JSON.stringify({ models: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (target.includes('/api/admin/openai/connections/test') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            ok: true,
            models: [{ id: 'conn_test__gpt-4o-mini', name: 'gpt-4o-mini' }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const { renderConnectionsSettings } = await loadModule();
    const container = document.getElementById('root');

    renderConnectionsSettings(container, {});
    await vi.waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        '/api/admin/openai/connections?include_disabled=1'
      )
    );

    container.querySelector('#add-connection')?.click();
    container.querySelector('#modal-conn-name').value = 'OpenAI';
    container.querySelector('#modal-conn-url').value = 'https://api.openai.com/v1';
    container.querySelector('#modal-conn-key').value = 'secret';

    container.querySelector('#test-connection')?.click();

    await vi.waitFor(() => {
      expect(
        mocks.apiFetch.mock.calls.some(
          ([url, reqInit]) =>
            String(url) === '/api/admin/openai/connections/test' && reqInit?.method === 'POST'
        )
      ).toBe(true);
    });

    expect(container.textContent || '').not.toContain(
      "Cannot access 'payload' before initialization"
    );
  });

  it('labels the modal as edit when opening an existing connection', async () => {
    mocks.apiFetch.mockImplementation(async (url) => {
      if (String(url).includes('/api/admin/openai/connections')) {
        return new Response(
          JSON.stringify({
            enabled: true,
            connections: [
              {
                id: 'conn-1',
                name: 'OpenAI',
                url: 'https://api.openai.com/v1',
                hasKey: true,
                keyMasked: '••••cret',
                providerType: 'openai',
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const { renderConnectionsSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    renderConnectionsSettings(container, data);
    await vi.waitFor(() => expect(container.querySelector('.edit-connection-btn')).not.toBeNull());

    container.querySelector('.edit-connection-btn')?.click();
    expect(container.querySelector('#modal-title')?.textContent).toBe('Edit Connection');
    expect(window.location.hash).toBe('#edit-connection-modal');
  });

  it('does not render a master provider toggle and keeps providers visible', async () => {
    mocks.apiFetch.mockImplementationOnce(async (url) => {
      if (String(url).includes('/api/admin/openai/connections')) {
        return new Response(
          JSON.stringify({
            enabled: false,
            connections: [],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const { renderConnectionsSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    renderConnectionsSettings(container, data);
    await vi.waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        '/api/admin/openai/connections?include_disabled=1'
      )
    );

    expect(container.querySelector('#openai-toggle')).toBeNull();
    expect(container.querySelector('#manage-connections-section')).not.toBeNull();
    expect(
      container.querySelector('#manage-connections-section')?.classList.contains('hidden')
    ).toBe(false);
  });

  it('sorts enabled connections before disabled ones on reload', async () => {
    mocks.apiFetch.mockImplementationOnce(async (url) => {
      if (String(url).includes('/api/admin/openai/connections')) {
        return new Response(
          JSON.stringify({
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
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const { renderConnectionsSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    renderConnectionsSettings(container, data);
    await vi.waitFor(() =>
      expect(container.querySelectorAll('[data-connection-row]').length).toBe(2)
    );

    const rows = Array.from(container.querySelectorAll('[data-connection-row]')).map((row) =>
      row.textContent.trim()
    );
    expect(rows[0]).toContain('Alpha Connection');
    expect(rows[1]).toContain('Zulu Connection');
  });

  it('saves a read-only provider toggle and invalidates models', async () => {
    let lastPutBody = null;
    mocks.apiFetch.mockImplementation(async (url, init) => {
      const target = String(url);
      if (target.includes('/api/admin/openai/connections') && init?.method === 'PUT') {
        lastPutBody = JSON.parse(init.body || '{}');
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (target.includes('/api/admin/openai/connections')) {
        return new Response(
          JSON.stringify({
            enabled: true,
            connections: [
              {
                id: 'readonly-openai-0',
                name: 'OpenAI (proxy)',
                url: 'https://localhost:11434/v1',
                providerType: 'openai',
                readOnly: true,
                enabled: true,
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const { renderConnectionsSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    renderConnectionsSettings(container, data);
    await vi.waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        '/api/admin/openai/connections?include_disabled=1'
      )
    );
    await vi.waitFor(() => expect(container.querySelector('.connection-toggle')).not.toBeNull());
    expect(container.querySelector('.connection-acl-btn')).not.toBeNull();

    // Immediate-save: toggle should trigger API call immediately
    container.querySelector('.connection-toggle')?.click();
    await vi.waitFor(() => expect(lastPutBody).not.toBeNull());
    await vi.waitFor(() =>
      expect(container.querySelector('.connection-acl-btn')?.classList.contains('hidden')).toBe(
        true
      )
    );

    container.querySelector('.connection-toggle')?.click();
    await vi.waitFor(() =>
      expect(container.querySelector('.connection-acl-btn')?.classList.contains('hidden')).toBe(
        false
      )
    );

    container.querySelector('.connection-toggle')?.click();
    await vi.waitFor(() =>
      expect(container.querySelector('.connection-acl-btn')?.classList.contains('hidden')).toBe(
        true
      )
    );

    await vi.waitFor(() => expect(lastPutBody).not.toBeNull());
    await vi.waitFor(() => expect(mocks.broadcastModelsInvalidation).toHaveBeenCalled());
    expect(data.modelsSettingsInvalidate).toBeTruthy();
    expect(lastPutBody.model_updates).toEqual([]);
    expect(lastPutBody.access_updates).toEqual([]);
  });

  it('keeps disabled connections visible on reload', async () => {
    mocks.apiFetch.mockImplementationOnce(async (url) => {
      if (String(url).includes('/api/admin/openai/connections')) {
        return new Response(
          JSON.stringify({
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
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const { renderConnectionsSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    renderConnectionsSettings(container, data);
    await vi.waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        '/api/admin/openai/connections?include_disabled=1'
      )
    );
    await vi.waitFor(() => expect(container.textContent).toContain('Archived Connection'));
    expect(container.textContent).toContain('Disabled');
    expect(container.querySelector('.connection-toggle')?.classList.contains('bg-gray-200')).toBe(
      true
    );
    expect(
      container.querySelector('[data-settings-tab="connections"] [class*="opacity-70"]')
    ).not.toBeNull();
  });

  it('escapes connection names containing HTML special characters (#121 XSS)', async () => {
    mocks.apiFetch.mockImplementationOnce(async (url) => {
      if (String(url).includes('/api/admin/openai/connections')) {
        return new Response(
          JSON.stringify({
            enabled: true,
            connections: [
              {
                id: 'xss-conn',
                name: '<img onerror=alert(1) src=x>',
                url: 'https://xss.example.com',
                providerType: 'openai',
                enabled: true,
                readOnly: false,
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const { renderConnectionsSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};
    renderConnectionsSettings(container, data);
    await vi.waitFor(() =>
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        '/api/admin/openai/connections?include_disabled=1'
      )
    );
    await vi.waitFor(() => expect(container.textContent).toContain('<img onerror=alert(1) src=x>'));
    expect(container.querySelector('img')).toBeNull();
    const row = container.querySelector('[data-connection-row]');
    expect(row).not.toBeNull();
    expect(row.getAttribute('data-connection-row')).toBe('xss-conn');
  });
});

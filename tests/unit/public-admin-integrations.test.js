// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}));

vi.mock('../../public/js/shared/api.js', () => ({
  apiFetch: (...args) => mocks.apiFetch(...args),
}));

vi.mock('../../public/js/shared/api/request.js', () => ({
  apiFetch: (...args) => mocks.apiFetch(...args),
  getClientSessionId: () => 'test-session',
}));

async function loadModule() {
  vi.resetModules();
  return import('../../public/js/features/admin/settings/integrations.js');
}

describe('admin integrations settings', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root" data-settings-tab="integrations"></div>';
    vi.clearAllMocks();
    mocks.apiFetch.mockImplementation(async (url) => {
      if (String(url).includes('/api/admin/tool-servers')) {
        return new Response(JSON.stringify({
          servers: [
            {
              id: 'server-1',
              name: 'Tavily',
              url: 'https://mcp.example.com',
              enabled: true,
              toolsExpanded: true,
              tools: [
                { name: 'tool-a', title: 'Tool A', description: 'Desc A', enabled: true },
                { name: 'tool-b', title: 'Tool B', description: 'Desc B', enabled: false },
              ],
            },
          ],
        }), {
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

  it('locks tool toggles when the server is off and restores their state when re-enabled', async () => {
    const { renderIntegrationsSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    renderIntegrationsSettings(container, data);
    await vi.waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/tool-servers?include_disabled=1'));
    await vi.waitFor(() => expect(container.querySelector('.tool-toggle')).not.toBeNull());
    expect(container.querySelector('.tool-access-btn')).not.toBeNull();

    const initialRows = Array.from(container.querySelectorAll('[data-tool-server-row]')).map((row) => row.textContent.trim());
    expect(container.querySelector('.tool-toggle').disabled).toBe(false);
    expect(container.querySelector('.tool-toggle').getAttribute('aria-pressed')).toBe('true');
    expect(data.integrationsSettings.toolServers[0].tools[0].enabled).toBe(true);

    container.querySelector('.server-toggle').click();
    expect(Array.from(container.querySelectorAll('[data-tool-server-row]')).map((row) => row.textContent.trim())).toEqual(initialRows);
    expect(container.querySelector('.tool-toggle').disabled).toBe(true);
    expect(container.querySelector('.tool-toggle').getAttribute('aria-disabled')).toBe('true');
    await vi.waitFor(() => expect(container.querySelector('.tool-access-btn')?.classList.contains('hidden')).toBe(true));
    expect(data.integrationsSettings.toolServers[0].enabled).toBe(false);
    expect(data.integrationsSettings.toolServers[0].tools[0].enabled).toBe(true);

    container.querySelector('.tool-toggle').click();
    expect(data.integrationsSettings.toolServers[0].tools[0].enabled).toBe(true);

    container.querySelector('.server-toggle').click();
    expect(Array.from(container.querySelectorAll('[data-tool-server-row]')).map((row) => row.textContent.trim())).toEqual(initialRows);
    expect(container.querySelector('.tool-toggle').disabled).toBe(false);
    expect(container.querySelector('.tool-toggle').getAttribute('aria-pressed')).toBe('true');
    await vi.waitFor(() => expect(container.querySelector('.tool-access-btn')?.classList.contains('hidden')).toBe(false));

    container.querySelector('.tool-toggle').click();
    expect(data.integrationsSettings.toolServers[0].tools[0].enabled).toBe(false);
    expect(container.querySelector('.tool-toggle').getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps the main Save button dirty after saving the modal draft', async () => {
    const { renderIntegrationsSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    renderIntegrationsSettings(container, data);
    await vi.waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/tool-servers?include_disabled=1'));
    await vi.waitFor(() => expect(data.integrationsSettings.originalSnapshot).not.toBeNull());
    await vi.waitFor(() => expect(container.querySelector('#save-integrations')?.disabled).toBe(true));
    vi.clearAllMocks();

    container.querySelector('#add-tool-server')?.click();
    container.querySelector('#server-name').value = 'Tavily';
    container.querySelector('#server-url').value = 'https://mcp.example.com';
    container.querySelector('#save-modal')?.click();

    await vi.waitFor(() => expect(container.querySelector('#edit-connection-modal')?.classList.contains('hidden')).toBe(true));

    expect(container.querySelector('#save-integrations')?.disabled).toBe(false);
    expect(mocks.apiFetch.mock.calls.some(([url, init]) => String(url) === '/api/admin/tool-servers' && init?.method === 'PUT')).toBe(false);
  });

  it('labels the modal as add for a new server and edit for an existing one', async () => {
    const { renderIntegrationsSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    renderIntegrationsSettings(container, data);
    await vi.waitFor(() => expect(data.integrationsSettings.originalSnapshot).not.toBeNull());

    container.querySelector('#add-tool-server')?.click();
    expect(container.querySelector('#server-modal-title')?.textContent).toBe('Add MCP Server');
    expect(container.querySelector('#edit-connection-modal')?.className).toContain('items-start');
    expect(container.querySelector('#edit-connection-modal')?.className).toContain('overflow-y-auto');

    container.querySelector('#close-modal')?.click();
    await vi.waitFor(() => expect(container.querySelector('#edit-connection-modal')?.classList.contains('hidden')).toBe(true));

    container.querySelector('.edit-server-btn')?.click();
    expect(container.querySelector('#server-modal-title')?.textContent).toBe('Edit MCP Server');
  });

  it('broadcasts a tool-server invalidation after saving integrations', async () => {
    const { renderIntegrationsSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};
    const listener = vi.fn();

    renderIntegrationsSettings(container, data);
    await vi.waitFor(() => expect(data.integrationsSettings.originalSnapshot).not.toBeNull());
    window.addEventListener('growchat:tool-servers-invalidated', listener);
    vi.clearAllMocks();

    container.querySelector('.server-toggle')?.click();
    await vi.waitFor(() => expect(container.querySelector('#save-integrations')?.disabled).toBe(false));
    container.querySelector('#save-integrations')?.click();

    await vi.waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/tool-servers', expect.objectContaining({ method: 'PUT' })));
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
    window.removeEventListener('growchat:tool-servers-invalidated', listener);
  });

  it('saves a new server immediately without needing footer save', async () => {
    const { renderIntegrationsSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    renderIntegrationsSettings(container, data);
    await vi.waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/tool-servers?include_disabled=1'));
    await vi.waitFor(() => expect(container.querySelector('[data-tool-server-row]')).not.toBeNull());

    container.querySelector('[data-account-integration-add], #add-tool-server')?.click();
    await vi.waitFor(() => expect(container.querySelector('#edit-connection-modal')).not.toBeNull());

    container.querySelector('#server-name').value = 'Immediate Save MCP';
    container.querySelector('#server-url').value = 'https://immediate-save.example.com';
    container.querySelector('#save-modal')?.click();

    await vi.waitFor(() => expect(container.querySelector('#edit-connection-modal')?.classList.contains('hidden')).toBe(true));

    await vi.waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/tool-servers', expect.objectContaining({
      method: 'PUT',
    })));
    expect(document.body.textContent).toContain('Immediate Save MCP');
  });

  it('dirty checker always returns false for immediate-save pattern', async () => {
    const { renderIntegrationsSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    renderIntegrationsSettings(container, data);
    await vi.waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/tool-servers?include_disabled=1'));
    await vi.waitFor(() => expect(container.querySelector('[data-tool-server-row]')).not.toBeNull());

    expect(data.settingsDirtyCheckers.integrations()).toBe(false);
  });

  it('keeps disabled tool servers visible on reload', async () => {
    mocks.apiFetch.mockImplementationOnce(async (url) => {
      if (String(url).includes('/api/admin/tool-servers')) {
        return new Response(JSON.stringify({
          servers: [
            {
              id: 'server-disabled',
              name: 'Archived MCP',
              url: 'https://disabled-mcp.example.com',
              enabled: false,
              toolsExpanded: true,
              tools: [],
            },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const { renderIntegrationsSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    renderIntegrationsSettings(container, data);
    await vi.waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/tool-servers?include_disabled=1'));
    await vi.waitFor(() => expect(container.textContent).toContain('Archived MCP'));
    expect(container.textContent).toContain('Disabled');
    expect(container.querySelector('.server-toggle')?.classList.contains('bg-gray-200')).toBe(true);
    expect(container.querySelector('[data-settings-tab="integrations"] [class*="opacity-70"]')).not.toBeNull();
  });

  it('sorts enabled tool servers before disabled ones on reload', async () => {
    mocks.apiFetch.mockImplementationOnce(async (url) => {
      if (String(url).includes('/api/admin/tool-servers')) {
        return new Response(JSON.stringify({
          servers: [
            {
              id: 'server-disabled',
              name: 'Zulu MCP',
              url: 'https://zulu-mcp.example.com',
              enabled: false,
              toolsExpanded: true,
              tools: [],
            },
            {
              id: 'server-enabled',
              name: 'Alpha MCP',
              url: 'https://alpha-mcp.example.com',
              enabled: true,
              toolsExpanded: true,
              tools: [],
            },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const { renderIntegrationsSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    renderIntegrationsSettings(container, data);
    await vi.waitFor(() => expect(container.querySelectorAll('[data-tool-server-row]').length).toBe(2));

    const rows = Array.from(container.querySelectorAll('[data-tool-server-row]')).map((row) => row.textContent.trim());
    expect(rows[0]).toContain('Alpha MCP');
    expect(rows[1]).toContain('Zulu MCP');
  });
});

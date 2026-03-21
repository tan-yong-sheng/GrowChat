// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}));

vi.mock('../../public/js/api.js', () => ({
  apiFetch: (...args) => mocks.apiFetch(...args),
}));

async function loadModule() {
  vi.resetModules();
  return import('../../public/js/components/admin/settings/integrations.js');
}

describe('admin integrations settings', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root" data-settings-tab="integrations"></div>';
    vi.clearAllMocks();
    mocks.apiFetch.mockImplementation(async (url) => {
      if (String(url) === '/api/admin/tool-servers') {
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
    await vi.waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/tool-servers'));
    await vi.waitFor(() => expect(container.querySelector('.tool-toggle')).not.toBeNull());

    expect(container.querySelector('.tool-toggle').disabled).toBe(false);
    expect(container.querySelector('.tool-toggle').getAttribute('aria-pressed')).toBe('true');
    expect(data.integrationsSettings.toolServers[0].tools[0].enabled).toBe(true);

    container.querySelector('.server-toggle').click();
    expect(container.querySelector('.tool-toggle').disabled).toBe(true);
    expect(container.querySelector('.tool-toggle').getAttribute('aria-disabled')).toBe('true');
    expect(data.integrationsSettings.toolServers[0].enabled).toBe(false);
    expect(data.integrationsSettings.toolServers[0].tools[0].enabled).toBe(true);

    container.querySelector('.tool-toggle').click();
    expect(data.integrationsSettings.toolServers[0].tools[0].enabled).toBe(true);

    container.querySelector('.server-toggle').click();
    expect(container.querySelector('.tool-toggle').disabled).toBe(false);
    expect(container.querySelector('.tool-toggle').getAttribute('aria-pressed')).toBe('true');

    container.querySelector('.tool-toggle').click();
    expect(data.integrationsSettings.toolServers[0].tools[0].enabled).toBe(false);
    expect(container.querySelector('.tool-toggle').getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps the main Save button dirty after saving the modal draft', async () => {
    const { renderIntegrationsSettings } = await loadModule();
    const container = document.getElementById('root');
    const data = {};

    renderIntegrationsSettings(container, data);
    await vi.waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/api/admin/tool-servers'));
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
});

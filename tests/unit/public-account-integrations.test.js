// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  ensureMarkedReady: vi.fn(),
  fetchUserMcpServers: vi.fn(),
  createUserMcpServer: vi.fn(),
  updateUserMcpServer: vi.fn(),
  deleteUserMcpServer: vi.fn(),
  testUserMcpServer: vi.fn(),
}));

vi.mock('../../public/js/shared/api.js', () => ({
  apiFetch: (...args) => mocks.apiFetch(...args),
}));

vi.mock('../../public/js/shared/api/request.js', () => ({
  apiFetch: (...args) => mocks.apiFetch(...args),
}));

vi.mock('../../public/js/shared/utils.js', () => ({
  ensureMarkedReady: (...args) => mocks.ensureMarkedReady(...args),
}));

async function loadModule() {
  vi.resetModules();
  const { renderAccountPage } = await import('../../public/js/features/account/account.js');
  return { renderAccountPage };
}

async function flush(count = 2) {
  for (let i = 0; i < count; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function makeIntegrationServer(overrides = {}) {
  return {
    id: 'mcp-1',
    name: 'Personal MCP',
    url: 'https://mcp.example.com',
    headers: '{"X-Test":"1"}',
    enabled: true,
    auth_type: 'bearer',
    auth_bearer_token: 'secret-token',
    auth_basic_username: '',
    auth_basic_password: '',
    oauth_client_name: '',
    oauth_scope: '',
    oauth_client_id: '',
    oauth_client_secret: '',
    oauth_token_auth_method: '',
    oauth_connected: false,
    oauth_connected_at: null,
    ...overrides,
  };
}

function makeAccountState(servers = [makeIntegrationServer()]) {
  return {
    user: {
      id: 'u1',
      name: 'Sam',
      email: 'sam@example.com',
      primary_role: 'member',
      avatar_emoji: 'S',
      status: 'online',
    },
    permissions: ['chat.read'],
    roles: [{ role_name: 'member' }],
    app_config: { default_model_id: 'gpt-5-mini' },
    settings: {
      general: {
        name: 'Sam',
        email: 'sam@example.com',
        avatar: null,
        avatar_emoji: 'S',
        status: 'online',
        account_status: 'active',
        settings: {},
      },
      preferences: { theme: 'system' },
      connections: { my_connections: [], connections: [] },
      integrations: { servers },
      tool_servers: { servers },
      models: { default_model_id: 'gpt-5-mini' },
    },
  };
}

describe('account integrations section', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    localStorage.clear();
    window.history.pushState({}, '', '/account/settings/integrations');
    vi.restoreAllMocks();
    mocks.ensureMarkedReady.mockReset();
    mocks.apiFetch.mockReset();
    mocks.createUserMcpServer.mockReset();
    mocks.updateUserMcpServer.mockReset();
    mocks.deleteUserMcpServer.mockReset();
    mocks.testUserMcpServer.mockReset();
  });

  it('opens the add integration modal with the shared admin-style shell', async () => {
    mocks.apiFetch
      .mockResolvedValueOnce(jsonResponse(makeAccountState()))
      .mockResolvedValueOnce(jsonResponse({ servers: [makeIntegrationServer()] }));

    const { renderAccountPage } = await loadModule();
    await renderAccountPage(document.getElementById('app'));
    await flush(4);

    expect(document.querySelector('#account-main-footer #save-integrations')).not.toBeNull();
    const addBtn = document.querySelector('[data-account-integration-add]');
    expect(addBtn).not.toBeNull();
    addBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();

    const modalRoot = document.getElementById('account-integration-modal');
    expect(modalRoot).not.toBeNull();
    expect(modalRoot?.className).toContain('items-start');
    expect(modalRoot?.className).toContain('overflow-y-auto');
    expect(modalRoot?.querySelector('[class*="rounded-3xl"]')).not.toBeNull();
    expect(modalRoot?.querySelector('#server-modal-title')).not.toBeNull();
    expect(modalRoot?.textContent).toContain('Add MCP Server');
  }, 10000);

  it('saves a personal integration and refreshes the list', async () => {
    mocks.apiFetch
      .mockResolvedValueOnce(jsonResponse(makeAccountState([])))
      .mockResolvedValueOnce(jsonResponse({ servers: [] }))
      .mockResolvedValueOnce(jsonResponse({ server: { id: 'mcp-new' } }, 201))
      .mockResolvedValueOnce(jsonResponse(makeAccountState([
        makeIntegrationServer({
          id: 'mcp-new',
          name: 'Updated MCP',
          url: 'https://tools.example.com',
          auth_type: 'basic',
          auth_basic_username: 'sam',
        }),
      ])))
      .mockResolvedValueOnce(jsonResponse({
        servers: [
          makeIntegrationServer({
            id: 'mcp-new',
            name: 'Updated MCP',
            url: 'https://tools.example.com',
            auth_type: 'basic',
            auth_basic_username: 'sam',
          }),
        ],
      }));

    const { renderAccountPage } = await loadModule();
    await renderAccountPage(document.getElementById('app'));
    await flush(4);

    expect(document.querySelector('#account-main-footer #save-integrations')).not.toBeNull();
    const addBtn = document.querySelector('[data-account-integration-add]');
    expect(addBtn).not.toBeNull();
    addBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    const modal = document.getElementById('account-integration-modal');
    expect(modal).not.toBeNull();

    modal.querySelector('#server-name').value = 'Updated MCP';
    modal.querySelector('#server-url').value = 'https://tools.example.com';
    modal.querySelector('#server-auth-type').value = 'basic';
    modal.querySelector('#server-auth-basic-username').value = 'sam';
    modal.querySelector('#server-auth-basic-password').value = 'secret';
    modal.querySelector('#save-modal')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush(6);

    expect(mocks.apiFetch).toHaveBeenCalledWith('/api/users/me/resources/mcp-servers', expect.objectContaining({
      method: 'POST',
    }));
    expect(JSON.parse(mocks.apiFetch.mock.calls[2][1].body)).toEqual(expect.objectContaining({
      name: 'Updated MCP',
      url: 'https://tools.example.com',
      auth_type: 'basic',
      auth_basic_username: 'sam',
      auth_basic_password: 'secret',
      enabled: true,
    }));
    expect(document.body.textContent).toContain('Updated MCP');
  });

  it('deletes a personal integration after confirmation and refreshes the list', async () => {
    mocks.apiFetch
      .mockResolvedValueOnce(jsonResponse(makeAccountState()))
      .mockResolvedValueOnce(jsonResponse({ servers: [makeIntegrationServer()] }))
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockResolvedValueOnce(jsonResponse(makeAccountState([])))
      .mockResolvedValueOnce(jsonResponse({ servers: [] }));

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    const { renderAccountPage } = await loadModule();
    await renderAccountPage(document.getElementById('app'));
    await flush(4);

    expect(document.querySelector('#account-main-footer #save-integrations')).not.toBeNull();
    const editBtn = document.querySelector('[data-account-integration-edit="mcp-1"]');
    expect(editBtn).not.toBeNull();
    editBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush(2);
    document.querySelector('#delete-server')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush(6);

    expect(confirmSpy).toHaveBeenCalled();
    expect(mocks.apiFetch.mock.calls.some(([url, options]) => String(url) === '/api/users/me/resources/mcp-servers/mcp-1' && String(options?.method || '').toUpperCase() === 'DELETE')).toBe(true);
    expect(document.body.textContent).toContain('No tool servers configured');
  });
});

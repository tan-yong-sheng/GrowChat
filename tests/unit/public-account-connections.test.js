// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  clearModelsCache: vi.fn(),
  ensureMarkedReady: vi.fn(),
  createUserConnection: vi.fn(),
  updateUserConnection: vi.fn(),
  deleteUserConnection: vi.fn(),
  testUserConnection: vi.fn(),
}));

vi.mock('../../public/js/shared/api.js', () => ({
  apiFetch: (...args) => mocks.apiFetch(...args),
  clearModelsCache: (...args) => mocks.clearModelsCache(...args),
}));

vi.mock('../../public/js/shared/api/resources.js', () => ({
  createUserConnection: (...args) => mocks.createUserConnection(...args),
  updateUserConnection: (...args) => mocks.updateUserConnection(...args),
  deleteUserConnection: (...args) => mocks.deleteUserConnection(...args),
  testUserConnection: (...args) => mocks.testUserConnection(...args),
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

function makeAccountState(connectionName = 'Personal Conn', capabilities = {}) {
  const baseCapabilities = {
    permissions: [
      'chat.read',
      'user.settings.profile.write',
      'user.settings.preferences.write',
      'user.settings.connections.write',
      'user.settings.integrations.write',
      'user.settings.tool-servers.write',
    ],
    canManageConnections: true,
    canManageToolServers: true,
    canManageModels: true,
    canManageAcls: false,
  };
  return {
    user: {
      id: 'u1',
      name: 'Sam',
      email: 'sam@example.com',
      primary_role: 'member',
      avatar_emoji: 'S',
      status: 'online',
    },
    permissions: baseCapabilities.permissions,
    roles: [{ role_name: 'member' }],
    capabilities: {
      ...baseCapabilities,
      ...capabilities,
    },
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
      connections: {
        my_connections: [
          {
            id: 'conn-1',
            name: connectionName,
            provider_type: 'openai-compatible',
            provider_family: 'openai',
            base_url: 'https://api.example.com/v1',
            auth_type: 'bearer',
            headers: { 'X-Test': '1' },
            enabled: true,
            has_key: true,
            manual_models: [{ modelId: 'gpt-4o', name: 'GPT-4o' }],
          },
        ],
        connections: [
          {
            id: 'shared-1',
            name: 'Shared Conn',
            note: 'Shared from admin',
            access_label: 'Shared',
          },
        ],
      },
      integrations: { servers: [] },
      tool_servers: { servers: [] },
      models: { default_model_id: null },
    },
  };
}

describe('account connections section', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    localStorage.clear();
    window.history.pushState({}, '', '/account/settings/connections');
    vi.restoreAllMocks();
    mocks.ensureMarkedReady.mockReset();
    mocks.apiFetch.mockReset();
    mocks.createUserConnection.mockReset();
    mocks.updateUserConnection.mockReset();
    mocks.deleteUserConnection.mockReset();
    mocks.testUserConnection.mockReset();
    mocks.testUserConnection.mockResolvedValue({ message: 'Connection successful', models: [] });
  });

  it('disables connection actions when capability denies management', async () => {
    mocks.apiFetch.mockResolvedValue({
      ok: true,
      json: async () => makeAccountState('Personal Conn', {
        canManageConnections: false,
      }),
    });

    const { renderAccountPage } = await loadModule();
    await renderAccountPage(document.getElementById('app'));
    await flush();

    expect(document.body.textContent).toContain('Personal');
    expect(document.body.textContent).toContain('Shared');
    expect(document.body.textContent).not.toContain('Admin');
    expect(document.body.textContent).not.toContain('Shared providers');
    expect(document.body.textContent).not.toContain('Visible for you');
    expect(document.querySelector('#manage-connections-section')?.className).not.toContain('overflow-y-auto');
    expect(document.querySelector('#manage-connections-section')?.className).not.toContain('max-h-[calc(100dvh-18rem)]');
    const addButton = document.querySelector('[data-account-connection-add]');
    expect(addButton).not.toBeNull();
    expect(addButton?.disabled).toBe(true);
    addButton?.click();
    expect(document.getElementById('account-connection-modal')).toBeNull();
  }, 10000);

  it('shows hidden shared connections explicitly so they can be restored', async () => {
    mocks.apiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ...makeAccountState('Personal Conn'),
        settings: {
          ...makeAccountState('Personal Conn').settings,
          preferences: {
            ...makeAccountState('Personal Conn').settings.preferences,
            resource_overrides: {
              connections: {
                hidden_ids: ['shared-1'],
              },
            },
          },
          connections: {
            my_connections: makeAccountState('Personal Conn').settings.connections.my_connections,
            connections: [
              {
                id: 'shared-1',
                name: 'Shared Conn',
                note: 'Shared from admin',
                access_label: 'Shared',
              },
            ],
          },
        },
      }),
    });

    const { renderAccountPage } = await loadModule();
    await renderAccountPage(document.getElementById('app'));
    await flush();

    expect(document.body.textContent).toContain('Hidden for you');
    expect(document.querySelector('[data-connection-row="shared-1"]')?.textContent).toContain('Hidden for you');
    expect(document.querySelector('[data-connection-row="shared-1"] [data-toggle-scope="shared"]')?.getAttribute('aria-label')).toBe('Show for me');
  });

  it('keeps shared visibility toggles available when connection management is disabled', async () => {
    const accountState = makeAccountState('Personal Conn', { canManageConnections: false });
    accountState.settings.connections.connections = [
      {
        id: 'shared-1',
        name: 'Shared Conn',
        note: 'Shared from admin',
        access_label: 'Shared',
        hidden_for_user: false,
        visible_for_user: true,
      },
    ];
    mocks.apiFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => accountState,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: {
            preferences: {
              connections: {
                hidden_ids: ['shared-1'],
              },
            },
          },
        }),
      });

    const { renderAccountPage } = await loadModule();
    await renderAccountPage(document.getElementById('app'));
    await flush();

    const sharedToggle = document.querySelector('[data-connection-row="shared-1"] [data-toggle-scope="shared"]');
    expect(sharedToggle).not.toBeNull();
    expect(sharedToggle?.getAttribute('aria-label')).toBe('Hide for me');
    expect(sharedToggle?.hasAttribute('disabled')).toBe(false);
    sharedToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush(10);
    expect(mocks.apiFetch).toHaveBeenCalledWith('/api/users/me', expect.objectContaining({ method: 'PUT' }));
  });

  it('sorts enabled personal connections before disabled ones and keeps visible shared rows above hidden ones', async () => {
    mocks.apiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ...makeAccountState('Personal B'),
        settings: {
          ...makeAccountState('Personal B').settings,
          connections: {
            my_connections: [
              {
                id: 'conn-b',
                name: 'Personal B',
                provider_type: 'openai-compatible',
                base_url: 'https://b.example.com',
                enabled: false,
              },
              {
                id: 'conn-a',
                name: 'Personal A',
                provider_type: 'openai-compatible',
                base_url: 'https://a.example.com',
                enabled: true,
              },
            ],
            connections: [
              {
                id: 'shared-hidden',
                name: 'Shared Hidden',
                note: 'Shared hidden',
                access_label: 'Shared',
                hidden_for_user: true,
                visible_for_user: false,
              },
              {
                id: 'shared-visible',
                name: 'Shared Visible',
                note: 'Shared visible',
                access_label: 'Shared',
                hidden_for_user: false,
                visible_for_user: true,
              },
            ],
          },
        },
      }),
    });

    const { renderAccountPage } = await loadModule();
    await renderAccountPage(document.getElementById('app'));
    await flush();

    const personalRows = Array.from(document.querySelectorAll('[data-account-personal-connections] [data-connection-row]'));
    expect(personalRows.map((row) => row.getAttribute('data-id'))).toEqual(['conn-a', 'conn-b']);

    const sharedRows = Array.from(document.querySelectorAll('#manage-connections-section [data-connection-row]'))
      .filter((row) => row.closest('[data-account-personal-connections]') === null);
    expect(sharedRows.map((row) => row.getAttribute('data-id'))).toEqual(['shared-visible', 'shared-hidden']);
  }, 10000);

  it('opens the add connection modal with the shared admin-style shell', async () => {
    mocks.apiFetch.mockResolvedValue({
      ok: true,
      json: async () => makeAccountState(),
    });

    const { renderAccountPage } = await loadModule();
    await renderAccountPage(document.getElementById('app'));
    await flush();

    expect(document.querySelector('#account-main-footer #save-connections')).toBeNull();
    document.querySelector('[data-account-connection-add]')?.click();

    const modalRoot = document.getElementById('account-connection-modal');
    expect(modalRoot).not.toBeNull();
    expect(window.location.hash).toBe('#add-account-connection-modal');
    expect(modalRoot?.className).toContain('items-start');
    expect(modalRoot?.className).toContain('overflow-y-auto');
    expect(modalRoot?.querySelector('#modal-title')).not.toBeNull();
    expect(modalRoot?.querySelector('[class*="max-h-[70vh]"]')).not.toBeNull();
    expect(modalRoot?.querySelector('[class*="rounded-3xl"]')).not.toBeNull();
    expect(modalRoot?.querySelector('#toggle-key-visibility')).not.toBeNull();
    expect(modalRoot?.textContent).toContain('Add Connection');
  });

  it('saves shared connection visibility immediately', async () => {
    mocks.apiFetch.mockImplementation(async (url, options = {}) => {
      const method = String(options.method || 'GET').toUpperCase();
      if (String(url) === '/api/users/me/settings' && method === 'GET') {
        return {
          ok: true,
          json: async () => makeAccountState('Personal Conn'),
        };
      }
      if (String(url) === '/api/users/me' && method === 'PUT') {
        return {
          ok: true,
          json: async () => ({ user: { preferences: JSON.parse(options.body).preferences } }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    const { renderAccountPage } = await loadModule();
    await renderAccountPage(document.getElementById('app'));
    await flush(4);

    expect(document.querySelector('#account-main-footer #save-connections')).toBeNull();

    const sharedToggle = document.querySelector('[data-connection-row="shared-1"] [data-toggle-scope="shared"]');
    expect(sharedToggle).not.toBeNull();
    sharedToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush(2);

    await flush(8);

    const updateCall = mocks.apiFetch.mock.calls.find(([url, options]) => String(url) === '/api/users/me' && String(options?.method || '').toUpperCase() === 'PUT');
    expect(updateCall).toBeDefined();
    expect(JSON.parse(updateCall[1].body)).toEqual(expect.objectContaining({
      preferences: expect.objectContaining({
        resource_overrides: expect.objectContaining({
          connections: expect.objectContaining({
            hidden_ids: ['shared-1'],
          }),
        }),
      }),
    }));
    expect(document.querySelector('[data-connection-row="shared-1"] [data-toggle-scope="shared"]')?.getAttribute('aria-label')).toBe('Show for me');
  });

  it('saves an edited connection and refreshes the list', async () => {
    mocks.apiFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeAccountState('Personal Conn'),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeAccountState('Updated Conn'),
      });
    mocks.updateUserConnection.mockResolvedValue({ connection: { id: 'conn-1' } });

    const { renderAccountPage } = await loadModule();
    await renderAccountPage(document.getElementById('app'));
    await Promise.resolve();

    expect(document.body.textContent).toContain('Personal');
    expect(document.body.textContent).toContain('Shared');
    expect(document.body.textContent).not.toContain('Admin');
    expect(document.body.textContent).not.toContain('Shared providers');
    expect(document.body.textContent).not.toContain('Visible for you');
    expect(document.querySelector('#account-main-footer #save-connections')).toBeNull();
    document.querySelector('[data-account-connection-edit="conn-1"]')?.click();
    expect(document.getElementById('account-connection-modal')?.textContent).toContain('Edit Connection');

    const modal = document.getElementById('account-connection-modal');
    const nameInput = modal?.querySelector('#modal-conn-name');
    expect(nameInput).not.toBeNull();
    expect(modal?.querySelector('#modal-conn-key')?.getAttribute('placeholder')).toBe('Leave blank to keep current key');
    expect(modal?.textContent).toContain('A key is already saved. Leave this blank to keep it.');
    expect(modal?.querySelector('#modal-models-status')?.textContent).toContain('Models selected in this connection: 1');
    expect(modal?.querySelector('#modal-models-list')?.textContent).toContain('GPT-4o');
    nameInput.value = 'Updated Conn';

    modal?.querySelector('[data-account-connection-save]')?.click();
    await Promise.resolve();
    await flush(12);

    expect(mocks.updateUserConnection).toHaveBeenCalledTimes(1);
    expect(mocks.updateUserConnection).toHaveBeenCalledWith('conn-1', expect.objectContaining({
      name: 'Updated Conn',
      provider_type: 'openai-compatible',
      base_url: 'https://api.example.com/v1',
      enabled: true,
      auth_type: 'bearer',
      headers: expect.stringContaining('"X-Test": "1"'),
    }));
    expect(document.getElementById('account-connection-modal')).toBeNull();
    expect(window.location.hash).toBe('');
    expect(mocks.apiFetch.mock.calls.filter(([url]) => String(url) === '/api/users/me/settings')).toHaveLength(2);
  });

  it('deletes a connection after confirmation and refreshes the list', async () => {
    mocks.apiFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeAccountState('Personal Conn'),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...makeAccountState('Personal Conn'),
          settings: {
            ...makeAccountState('Personal Conn').settings,
            connections: {
              my_connections: [],
              connections: [],
            },
          },
        }),
      });
    mocks.deleteUserConnection.mockResolvedValue({ success: true });

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    const { renderAccountPage } = await loadModule();
    await renderAccountPage(document.getElementById('app'));
    await Promise.resolve();

    expect(document.body.textContent).toContain('Personal');
    expect(document.body.textContent).toContain('Shared');
    expect(document.body.textContent).not.toContain('Admin');
    expect(document.body.textContent).not.toContain('Shared providers');
    expect(document.body.textContent).not.toContain('Visible for you');
    expect(document.querySelector('#account-main-footer #save-connections')).toBeNull();
    document.querySelector('[data-account-connection-edit="conn-1"]')?.click();
    await flush(2);
    document.querySelector('[data-account-connection-delete-modal]')?.click();
    await flush(4);

    expect(confirmSpy).toHaveBeenCalled();
    expect(mocks.deleteUserConnection).toHaveBeenCalledWith('conn-1');
    expect(document.querySelector('[data-connection-row="conn-1"]')).toBeNull();
    expect(document.querySelector('[data-connection-row="shared-1"]')).not.toBeNull();
    expect(mocks.apiFetch.mock.calls.filter(([url]) => String(url) === '/api/users/me/settings')).toHaveLength(2);
  });
});

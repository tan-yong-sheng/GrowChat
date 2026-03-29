// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  ensureMarkedReady: vi.fn(),
  createUserConnection: vi.fn(),
  updateUserConnection: vi.fn(),
  deleteUserConnection: vi.fn(),
}));

vi.mock('../../public/js/shared/api.js', () => ({
  apiFetch: (...args) => mocks.apiFetch(...args),
}));

vi.mock('../../public/js/shared/api/resources.js', () => ({
  createUserConnection: (...args) => mocks.createUserConnection(...args),
  updateUserConnection: (...args) => mocks.updateUserConnection(...args),
  deleteUserConnection: (...args) => mocks.deleteUserConnection(...args),
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

function makeAccountState(connectionName = 'Personal Conn') {
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
  });

  it('opens the add connection modal with the shared admin-style shell', async () => {
    mocks.apiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeAccountState(),
    });

    const { renderAccountPage } = await loadModule();
    await renderAccountPage(document.getElementById('app'));
    await Promise.resolve();

    document.querySelector('[data-account-connection-add]')?.click();

    const modalRoot = document.getElementById('account-connection-modal');
    expect(modalRoot).not.toBeNull();
    expect(modalRoot?.className).toContain('items-start');
    expect(modalRoot?.className).toContain('overflow-y-auto');
    expect(modalRoot?.textContent).toContain('Create a personal connection for your account.');
    expect(modalRoot?.querySelector('[class*="max-h-[90vh]"]')).not.toBeNull();
    expect(modalRoot?.querySelector('[class*="rounded-[2.5rem]"]')).not.toBeNull();
    expect(modalRoot?.textContent).toContain('Add Connection');
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

    document.querySelector('[data-account-connection-edit="conn-1"]')?.click();
    expect(document.getElementById('account-connection-modal')?.textContent).toContain('Edit Connection');

    const modal = document.getElementById('account-connection-modal');
    const nameInput = modal?.querySelector('[name="name"]');
    expect(nameInput).not.toBeNull();
    nameInput.value = 'Updated Conn';

    modal?.querySelector('[data-account-connection-save]')?.click();
    await Promise.resolve();
    await flush();

    expect(mocks.updateUserConnection).toHaveBeenCalledTimes(1);
    expect(mocks.updateUserConnection).toHaveBeenCalledWith('conn-1', expect.objectContaining({
      name: 'Updated Conn',
      provider_type: 'openai-compatible',
      base_url: 'https://api.example.com/v1',
      enabled: true,
      auth_type: 'bearer',
      headers: expect.stringContaining('"X-Test": "1"'),
    }));
    expect(document.querySelector('[data-account-personal-connections]')?.textContent).toContain('Updated Conn');
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

    document.querySelector('[data-account-connection-delete="conn-1"]')?.click();
    await flush(4);

    expect(confirmSpy).toHaveBeenCalled();
    expect(mocks.deleteUserConnection).toHaveBeenCalledWith('conn-1');
    expect(document.querySelector('[data-account-personal-connections]')?.textContent).toContain('No personal connections yet');
  });
});

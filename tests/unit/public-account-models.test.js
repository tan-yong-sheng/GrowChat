// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  fetchModels: vi.fn(),
  ensureMarkedReady: vi.fn(),
}));

vi.mock('../../public/js/shared/api.js', () => ({
  apiFetch: (...args) => mocks.apiFetch(...args),
  fetchModels: (...args) => mocks.fetchModels(...args),
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

function makeAccountState(defaultModelId = 'm2') {
  const capabilities = {
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
    permissions: capabilities.permissions,
    roles: [{ role_name: 'member' }],
    capabilities,
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
      preferences: { theme: 'system', defaultModelId: defaultModelId || undefined },
      connections: { my_connections: [], connections: [] },
      integrations: { servers: [] },
      tool_servers: { servers: [] },
      models: { default_model_id: 'gpt-5-mini' },
    },
  };
}

describe('account models section', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    localStorage.clear();
    window.history.pushState({}, '', '/account/settings/models');
    vi.restoreAllMocks();
    mocks.ensureMarkedReady.mockReset();
    mocks.apiFetch.mockReset();
    mocks.fetchModels.mockReset();
  });

  it('renders an admin-style model table without the ACL lock button', async () => {
    mocks.apiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeAccountState('m2'),
    });

    mocks.fetchModels.mockResolvedValue({
      total: 42,
      active_total: 42,
      limit: 20,
      offset: 0,
      providers: [
        { value: 'all', label: 'All Providers', active: 42, total: 42 },
        { value: 'cli-proxy-api', label: 'cli-proxy-api', active: 42, total: 42 },
      ],
      models: [
        {
          id: 'm2',
          name: 'Model Two',
          access_label: 'Admin',
          access_variant: 'admin',
          enabled: true,
        },
        {
          id: 'm1',
          name: 'Model One',
          access_label: 'Personal',
          access_variant: 'personal',
          enabled: true,
        },
      ],
    });

    const { renderAccountPage } = await loadModule();
    await renderAccountPage(document.getElementById('app'));
    await vi.waitFor(() => expect(document.querySelector('[data-model-row]')).not.toBeNull());

    expect(mocks.fetchModels).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 20,
        offset: 0,
        scope: 'effective',
      })
    );
    expect(document.querySelector('#account-main-footer #save-models')).toBeNull();
    expect(document.querySelector('[data-account-model-form]')).toBeNull();
    expect(document.querySelector('#account-model-search-input')).not.toBeNull();
    expect(document.querySelector('[title="Available to you"]')?.textContent).toBe('42');
    expect(document.body.textContent).toContain('Available to you');
    expect(document.body.textContent).toContain('All Providers');
    expect(document.body.textContent).toContain('Show');
    expect(document.body.textContent).toContain('Page 1 / 3');
    expect(document.body.textContent).toContain('1-20 of 42');
    expect(document.body.textContent).toContain('Model One');
    expect(document.body.textContent).toContain('Model Two');
    expect(document.querySelector('thead')?.textContent).toContain('Access');
    expect(document.querySelector('thead')?.textContent).not.toContain('Input');
    expect(document.querySelector('[data-model-access="m2"]')?.textContent).toContain('Admin');
    expect(document.querySelector('[data-model-access="m1"]')?.textContent).toContain('Personal');
    expect(document.querySelector('[data-model-row]')).not.toBeNull();
    expect(document.querySelector('#account-main-content [data-model-acl]')).toBeNull();
    expect(document.querySelector('.model-toggle')).not.toBeNull();
    expect(document.querySelector('#prev-page')).not.toBeNull();
    expect(document.querySelector('#next-page')).not.toBeNull();
  }, 10000);

  it('renders hidden rows inline without a hidden-for-you badge so they can be restored later', async () => {
    mocks.apiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeAccountState('m2'),
    });

    mocks.fetchModels.mockResolvedValue({
      total: 2,
      active_total: 1,
      limit: 20,
      offset: 0,
      providers: [
        { value: 'all', label: 'All Providers', active: 1, total: 2 },
        { value: 'cli-proxy-api', label: 'cli-proxy-api', active: 1, total: 2 },
      ],
      models: [
        {
          id: 'm2',
          name: 'Model Two',
          access_label: 'Admin',
          access_variant: 'admin',
          enabled: true,
        },
      ],
      hidden_models: [
        {
          id: 'm1',
          name: 'Model One',
          access_label: 'Admin',
          access_variant: 'admin',
          enabled: false,
          hidden_for_user: true,
        },
      ],
    });

    const { renderAccountPage } = await loadModule();
    await renderAccountPage(document.getElementById('app'));
    await vi.waitFor(() =>
      expect(
        document.querySelector('#account-models-table-body [data-model-row="m1"]')
      ).not.toBeNull()
    );

    const disabledRow = document.querySelector('#account-models-table-body [data-model-row="m1"]');
    expect(disabledRow).not.toBeNull();
    expect(disabledRow.className).toContain('opacity-70');
    expect(disabledRow.querySelector('.model-toggle')?.getAttribute('aria-pressed')).toBe('false');
    expect(disabledRow.querySelector('.model-toggle')).not.toBeNull();
    expect(disabledRow.textContent).toContain('Model One');
    expect(disabledRow.querySelector('[data-model-access="m1"]')?.textContent).toContain('Admin');

    disabledRow?.querySelector('.model-toggle')?.click();
    await flush(10);

    expect(document.querySelector('[data-model-row="m1"]')).not.toBeNull();
    expect(document.body.textContent).toContain('Available to you');
  }, 10000);

  it('keeps shared model toggles available when model management is disabled', async () => {
    const state = makeAccountState('m2');
    state.capabilities.canManageModels = false;
    mocks.apiFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => state,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: {
            preferences: {
              model_settings: {
                disabled_model_ids: [],
                attachment_caps: {},
              },
            },
          },
        }),
      });

    mocks.fetchModels.mockResolvedValue({
      total: 2,
      active_total: 1,
      limit: 20,
      offset: 0,
      providers: [{ value: 'all', label: 'All Providers', active: 1, total: 2 }],
      models: [
        {
          id: 'm2',
          name: 'Model Two',
          access_label: 'Admin',
          access_variant: 'admin',
          enabled: true,
        },
      ],
      hidden_models: [
        {
          id: 'm1',
          name: 'Model One',
          access_label: 'Admin',
          access_variant: 'admin',
          enabled: false,
          hidden_for_user: true,
        },
      ],
    });

    const { renderAccountPage } = await loadModule();
    await renderAccountPage(document.getElementById('app'));
    await vi.waitFor(() =>
      expect(
        document.querySelector('#account-models-table-body [data-model-row="m1"]')
      ).not.toBeNull()
    );

    const disabledRow = document.querySelector('#account-models-table-body [data-model-row="m1"]');
    expect(disabledRow).not.toBeNull();
    const toggle = disabledRow.querySelector('.model-toggle');
    expect(toggle).not.toBeNull();
    expect(toggle?.hasAttribute('disabled')).toBe(false);
    toggle?.click();
    await flush(10);
    expect(mocks.apiFetch).toHaveBeenCalledWith(
      '/api/users/me',
      expect.objectContaining({ method: 'PUT' })
    );
  });

  it('omits admin-disabled models from the account table', async () => {
    mocks.apiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeAccountState('m2'),
    });

    mocks.fetchModels.mockResolvedValue({
      total: 3,
      active_total: 2,
      limit: 20,
      offset: 0,
      models: [
        {
          id: 'm2',
          name: 'Model Two',
          access_label: 'Admin',
          access_variant: 'admin',
          enabled: true,
        },
        {
          id: 'm1',
          name: 'Model One',
          access_label: 'Personal',
          access_variant: 'personal',
          enabled: true,
        },
      ],
      hidden_models: [],
    });

    const { renderAccountPage } = await loadModule();
    await renderAccountPage(document.getElementById('app'));
    await vi.waitFor(() => expect(document.querySelector('[data-model-row]')).not.toBeNull());

    expect(document.querySelector('[data-model-row="m3"]')).toBeNull();
    expect(document.body.textContent).not.toContain('Model Three');
    expect(document.body.textContent).toContain('Admin');
    expect(document.body.textContent).toContain('Personal');
  }, 10000);

  it('ignores admin-disabled models even if the effective payload includes them', async () => {
    mocks.apiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeAccountState('m2'),
    });

    mocks.fetchModels.mockResolvedValue({
      total: 3,
      active_total: 2,
      limit: 20,
      offset: 0,
      visibility: {
        disabled_model_ids: ['m3'],
        hidden_model_ids: [],
      },
      models: [
        {
          id: 'm2',
          name: 'Model Two',
          access_label: 'Admin',
          access_variant: 'admin',
          enabled: true,
        },
        {
          id: 'm3',
          name: 'Model Three',
          access_label: 'Admin',
          access_variant: 'admin',
          enabled: false,
        },
      ],
      hidden_models: [],
    });

    const { renderAccountPage } = await loadModule();
    await renderAccountPage(document.getElementById('app'));
    await vi.waitFor(() => expect(document.querySelector('[data-model-row]')).not.toBeNull());

    expect(document.querySelector('[data-model-row="m3"]')).toBeNull();
    expect(document.body.textContent).not.toContain('Model Three');
    expect(document.body.textContent).toContain('Model Two');
  }, 10000);

  it('saves personal model preferences through the shared account profile endpoint', async () => {
    mocks.apiFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeAccountState('m2'),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: {
            ...makeAccountState('m2').user,
            preferences: {
              theme: 'system',
              model_settings: {
                disabled_model_ids: ['m1'],
                attachment_caps: {
                  m1: { image: true, pdf: false },
                  m2: { image: false, pdf: false },
                },
              },
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeAccountState('m2'),
      });

    mocks.fetchModels.mockResolvedValue({
      total: 42,
      active_total: 42,
      limit: 20,
      offset: 0,
      models: [
        {
          id: 'm2',
          name: 'Model Two',
          access_label: 'Admin',
          access_variant: 'admin',
          attachments: { image: true, pdf: false },
        },
        {
          id: 'm1',
          name: 'Model One',
          access_label: 'Personal',
          access_variant: 'personal',
          attachments: { image: false, pdf: false },
        },
      ],
    });

    const { renderAccountPage } = await loadModule();
    await renderAccountPage(document.getElementById('app'));
    await vi.waitFor(() => expect(document.querySelector('[data-model-row="m1"]')).not.toBeNull());

    document.querySelector('[data-model-id="m1"]')?.click();
    await flush(10);

    expect(mocks.apiFetch).toHaveBeenCalledWith(
      '/api/users/me',
      expect.objectContaining({
        method: 'PUT',
        body: expect.any(String),
      })
    );
    const saveCall = mocks.apiFetch.mock.calls
      .filter(([url, options]) => String(url) === '/api/users/me' && options?.method === 'PUT')
      .pop();
    expect(saveCall).toBeTruthy();
    const saveBody = JSON.parse(saveCall[1].body);
    expect(saveBody.preferences.model_settings.disabled_model_ids).toContain('m1');
    expect(document.querySelector('[data-model-access="m1"]')?.textContent).toContain('Personal');
    expect(document.querySelector('#account-main-footer #save-models')).toBeNull();
  }, 10000);

  it('keeps rapid toggle changes on the latest immediate save', async () => {
    let resolveFirstSave;
    const firstSave = new Promise((resolve) => {
      resolveFirstSave = resolve;
    });

    mocks.apiFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeAccountState('m2'),
      })
      .mockImplementationOnce(() => firstSave)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: {
            ...makeAccountState('m2').user,
            preferences: {
              theme: 'system',
              model_settings: {
                disabled_model_ids: [],
                attachment_caps: {},
              },
            },
          },
        }),
      });

    mocks.fetchModels
      .mockResolvedValueOnce({
        total: 2,
        active_total: 2,
        limit: 20,
        offset: 0,
        providers: [
          { value: 'all', label: 'All Providers', active: 2, total: 2 },
          { value: 'cli-proxy-api', label: 'cli-proxy-api', active: 2, total: 2 },
        ],
        models: [
          { id: 'm2', name: 'Model Two', enabled: true },
          { id: 'm1', name: 'Model One', enabled: true },
        ],
        hidden_models: [],
      })
      .mockResolvedValueOnce({
        total: 2,
        active_total: 1,
        limit: 20,
        offset: 0,
        providers: [
          { value: 'all', label: 'All Providers', active: 1, total: 2 },
          { value: 'cli-proxy-api', label: 'cli-proxy-api', active: 1, total: 2 },
        ],
        models: [{ id: 'm2', name: 'Model Two', enabled: true }],
        hidden_models: [
          {
            id: 'm1',
            name: 'Model One',
            enabled: false,
            hidden_for_user: true,
            access_label: 'Admin',
            access_variant: 'admin',
          },
        ],
      })
      .mockResolvedValue({
        total: 2,
        active_total: 1,
        limit: 20,
        offset: 0,
        providers: [
          { value: 'all', label: 'All Providers', active: 1, total: 2 },
          { value: 'cli-proxy-api', label: 'cli-proxy-api', active: 1, total: 2 },
        ],
        models: [{ id: 'm2', name: 'Model Two', enabled: true }],
        hidden_models: [
          {
            id: 'm1',
            name: 'Model One',
            enabled: false,
            hidden_for_user: true,
            access_label: 'Admin',
            access_variant: 'admin',
          },
        ],
      });

    const { renderAccountPage } = await loadModule();
    await renderAccountPage(document.getElementById('app'));
    await vi.waitFor(() => expect(document.querySelector('[data-model-row="m1"]')).not.toBeNull());

    document.querySelector('[data-model-id="m1"]')?.click();
    await flush(2);
    expect(document.querySelector('[data-model-row="m1"]')?.textContent).toContain('Model One');
    expect(document.querySelector('[data-model-access="m1"]')?.textContent).toContain('Admin');
    resolveFirstSave({
      ok: true,
      json: async () => ({
        user: {
          ...makeAccountState('m2').user,
          preferences: {
            theme: 'system',
            model_settings: {
              disabled_model_ids: ['m1'],
              attachment_caps: {},
            },
          },
        },
      }),
    });

    await flush(8);

    const putCalls = mocks.apiFetch.mock.calls.filter(
      ([url, options]) => String(url) === '/api/users/me' && options?.method === 'PUT'
    );
    expect(putCalls).toHaveLength(1);
    const finalSaveBody = JSON.parse(putCalls[0][1].body);
    expect(finalSaveBody.preferences.model_settings.disabled_model_ids).toEqual(['m1']);
    expect(document.querySelector('[title="Available to you"]')).not.toBeNull();
  }, 10000);

  it('paginates the model list like admin settings', async () => {
    mocks.apiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeAccountState('m2'),
    });

    mocks.fetchModels
      .mockResolvedValueOnce({
        total: 42,
        active_total: 42,
        limit: 20,
        offset: 0,
        providers: [
          { value: 'all', label: 'All Providers', active: 42, total: 42 },
          { value: 'cli-proxy-api', label: 'cli-proxy-api', active: 42, total: 42 },
        ],
        models: [
          { id: 'm2', name: 'Model Two' },
          { id: 'm1', name: 'Model One' },
        ],
        hidden_models: [],
      })
      .mockResolvedValueOnce({
        total: 42,
        active_total: 42,
        limit: 20,
        offset: 20,
        providers: [
          { value: 'all', label: 'All Providers', active: 42, total: 42 },
          { value: 'cli-proxy-api', label: 'cli-proxy-api', active: 42, total: 42 },
        ],
        models: [{ id: 'm3', name: 'Model Three' }],
        hidden_models: [],
      });

    const { renderAccountPage } = await loadModule();
    await renderAccountPage(document.getElementById('app'));
    await flush();

    expect(document.body.textContent).toContain('Page 1 / 3');
    expect(document.body.textContent).toContain('1-20 of 42');
    expect(document.querySelector('#prev-page')?.disabled).toBe(true);
    expect(document.querySelector('#next-page')?.disabled).toBe(false);

    document.querySelector('#next-page')?.click();
    await flush(10);

    expect(mocks.fetchModels).toHaveBeenCalledWith(
      expect.objectContaining({
        cache: 'no-store',
        limit: 20,
        offset: 20,
      })
    );
    expect(document.body.textContent).toContain('Page 2 / 3');
    expect(document.body.textContent).toContain('21-40 of 42');
    expect(document.body.textContent).toContain('Model Three');
  }, 10000);
});

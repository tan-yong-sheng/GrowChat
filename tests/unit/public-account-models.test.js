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

  it('renders the model catalog without a personal default editor', async () => {
    mocks.apiFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeAccountState('m2'),
      });

    mocks.fetchModels.mockResolvedValue({
      models: [
        { id: 'm2', name: 'Model Two' },
        { id: 'm1', name: 'Model One' },
      ],
    });

    const { renderAccountPage } = await loadModule();
    await renderAccountPage(document.getElementById('app'));
    await flush();

    expect(document.querySelector('[data-account-model-form]')).toBeNull();
    expect(document.querySelector('#account-model-search-input')).not.toBeNull();
    expect(document.body.textContent).toContain('Available Models');
    expect(document.body.textContent).toContain('Model One');
    expect(document.body.textContent).toContain('Model Two');
  });
});

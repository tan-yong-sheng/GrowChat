// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  clearAuthState: vi.fn(),
  consumeModelsInvalidation: vi.fn(),
  fetchChats: vi.fn(),
  fetchModels: vi.fn(),
  fetchMyPermissions: vi.fn(),
  fetchMyRoles: vi.fn(),
  fetchPublicSharedChat: vi.fn(),
  getAuthState: vi.fn(),
  isAccessTokenUsable: vi.fn(),
  initShortcuts: vi.fn(),
  readChatsCache: vi.fn(),
  readModelsCache: vi.fn(),
  renderAdminPage: vi.fn(),
  renderChat: vi.fn(),
  refreshToken: vi.fn(),
  startRealtimeSync: vi.fn(),
  stopRealtimeSync: vi.fn(),
  writeChatsCache: vi.fn(),
}));

vi.mock('../../public/js/api.js', () => ({
  apiFetch: (...args) => mocks.apiFetch(...args),
  clearAuthState: (...args) => mocks.clearAuthState(...args),
  fetchChats: (...args) => mocks.fetchChats(...args),
  fetchModels: (...args) => mocks.fetchModels(...args),
  fetchMyPermissions: (...args) => mocks.fetchMyPermissions(...args),
  fetchMyRoles: (...args) => mocks.fetchMyRoles(...args),
  fetchPublicSharedChat: (...args) => mocks.fetchPublicSharedChat(...args),
  getAuthState: (...args) => mocks.getAuthState(...args),
  isAccessTokenUsable: (...args) => mocks.isAccessTokenUsable(...args),
  readChatsCache: (...args) => mocks.readChatsCache(...args),
  readModelsCache: (...args) => mocks.readModelsCache(...args),
  refreshToken: (...args) => mocks.refreshToken(...args),
  writeChatsCache: (...args) => mocks.writeChatsCache(...args),
}));

vi.mock('../../public/js/admin.js', () => ({
  renderAdminPage: (...args) => mocks.renderAdminPage(...args),
}));

vi.mock('../../public/js/chat.js', () => ({
  renderChat: (...args) => mocks.renderChat(...args),
}));

vi.mock('../../public/js/shortcuts.js', () => ({
  initShortcuts: (...args) => mocks.initShortcuts(...args),
}));

vi.mock('../../public/js/realtime.js', () => ({
  startRealtimeSync: (...args) => mocks.startRealtimeSync(...args),
  stopRealtimeSync: (...args) => mocks.stopRealtimeSync(...args),
}));

vi.mock('../../public/js/utils/model-sync.js', () => ({
  broadcastModelsInvalidation: vi.fn(),
  consumeModelsInvalidation: (...args) => mocks.consumeModelsInvalidation(...args),
}));

async function loadApp() {
  vi.resetModules();
  return import('../../public/js/app.js');
}

describe('public app bootstrap', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
    mocks.apiFetch.mockReset();
    mocks.clearAuthState.mockReset();
    mocks.consumeModelsInvalidation.mockReset();
    mocks.fetchChats.mockReset();
    mocks.fetchModels.mockReset();
    mocks.fetchMyPermissions.mockReset();
    mocks.fetchMyRoles.mockReset();
    mocks.fetchPublicSharedChat.mockReset();
    mocks.getAuthState.mockReset();
    mocks.isAccessTokenUsable.mockReset();
    mocks.initShortcuts.mockReset();
    mocks.readChatsCache.mockReset();
    mocks.readModelsCache.mockReset();
    mocks.renderAdminPage.mockReset();
    mocks.renderChat.mockReset();
    mocks.refreshToken.mockReset();
    mocks.startRealtimeSync.mockReset();
    mocks.stopRealtimeSync.mockReset();
    mocks.writeChatsCache.mockReset();
    mocks.isAccessTokenUsable.mockReturnValue(true);
    mocks.refreshToken.mockResolvedValue({ access_token: 'token', refresh_token: 'refresh', user: { id: 'u1' } });
  });

  it('renders a shared chat page without bootstrapping the chat shell', async () => {
    window.history.pushState({}, '', '/s/share-123');
    mocks.fetchPublicSharedChat.mockResolvedValue({
      chat: { title: 'Shared Title' },
      messages: [{ role: 'user', content: 'Hello' }],
    });

    await loadApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.fetchPublicSharedChat).toHaveBeenCalledWith('share-123');
    expect(document.getElementById('app').textContent).toContain('Shared Title');
    expect(mocks.renderChat).not.toHaveBeenCalled();
  });

  it('delegates admin routes to the admin renderer', async () => {
    window.history.pushState({}, '', '/admin');
    mocks.getAuthState.mockReturnValue({ access_token: 'token' });
    mocks.isAccessTokenUsable.mockReturnValue(true);
    mocks.apiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        user: { id: 'u1', role: 'admin', preferences: {} },
        permissions: ['chat.read'],
        roles: [{ role_name: 'admin' }],
        app_config: { default_model_id: 'gpt-4' },
      }),
    });
    mocks.readChatsCache.mockReturnValue(null);
    mocks.readModelsCache.mockReturnValue(null);
    mocks.fetchChats.mockResolvedValue({ chats: [], limit: 30, offset: 0, has_more: false });

    await loadApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.renderAdminPage).toHaveBeenCalledTimes(1);
    expect(document.getElementById('app').dataset.view).toBe('admin');
  });

  it('boots the chat shell on the home route', async () => {
    window.history.pushState({}, '', '/');
    mocks.getAuthState.mockReturnValue({ access_token: 'token' });
    mocks.isAccessTokenUsable.mockReturnValue(true);
    mocks.apiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        user: { id: 'u1', role: 'user', preferences: {} },
        permissions: ['chat.read'],
        roles: [{ role_name: 'user' }],
        app_config: { default_model_id: 'gpt-4' },
      }),
    });
    mocks.readChatsCache.mockReturnValue({
      chats: [{ id: 'c1', title: 'Cached Chat', model: 'm1' }],
      limit: 30,
      offset: 1,
      has_more: false,
    });
    mocks.readModelsCache.mockReturnValue({
      models: [{ id: 'm1', name: 'GPT Mini' }],
    });
    mocks.consumeModelsInvalidation.mockReturnValue(null);
    mocks.fetchChats.mockResolvedValue({ chats: [], limit: 30, offset: 0, has_more: false });

    await loadApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.initShortcuts).toHaveBeenCalledTimes(1);
    expect(mocks.renderChat).toHaveBeenCalledTimes(1);
    expect(document.getElementById('app').dataset.view).toBe('chat');
  });

  it('refreshes and retries profile bootstrap when the first me request returns 401', async () => {
    window.history.pushState({}, '', '/');
    mocks.getAuthState.mockReturnValue({ access_token: 'stale-access', refresh_token: 'refresh-token' });
    mocks.isAccessTokenUsable.mockReturnValue(true);
    mocks.apiFetch
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: { id: 'u1', role: 'user', preferences: {} },
          permissions: ['chat.read'],
          roles: [{ role_name: 'user' }],
          app_config: { default_model_id: 'gpt-4' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: { id: 'u1', role: 'user', preferences: {} },
          permissions: ['chat.read'],
          roles: [{ role_name: 'user' }],
          app_config: { default_model_id: 'gpt-4' },
        }),
      });
    mocks.readChatsCache.mockReturnValue(null);
    mocks.readModelsCache.mockReturnValue(null);
    mocks.fetchChats.mockResolvedValue({ chats: [], limit: 30, offset: 0, has_more: false });

    await loadApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.refreshToken).toHaveBeenCalledWith('refresh-token');
    expect(mocks.apiFetch).toHaveBeenCalledTimes(2);
    expect(mocks.renderChat).toHaveBeenCalledTimes(1);
  });

  it('suppresses the known autofill overlay error', async () => {
    await loadApp();
    const event = new ErrorEvent('error', {
      message: "Cannot read properties of null (reading 'includes')",
      filename: 'bootstrap-autofill-overlay.js',
      cancelable: true,
    });

    const dispatched = window.dispatchEvent(event);
    expect(dispatched).toBe(false);
    expect(event.defaultPrevented).toBe(true);
  });
});

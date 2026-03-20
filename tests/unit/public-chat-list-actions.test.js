// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createChatListHandlers } from '../../public/js/chat-list-actions.js';

function createMutableSetState(state) {
  return (updater) => {
    const changes = typeof updater === 'function' ? updater(state) : updater;
    if (!changes) return;
    Object.entries(changes).forEach(([key, value]) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        state[key] = { ...(state[key] || {}), ...value };
      } else {
        state[key] = value;
      }
    });
  };
}

describe('chat list actions', () => {
  it('routes temp chats locally and avoids remote actions', async () => {
    const state = { isMobile: true };
    const drawMessages = vi.fn();
    const loadMessages = vi.fn();
    const syncChatUrl = vi.fn();
    const setState = createMutableSetState(state);
    const handlers = createChatListHandlers({
      state,
      apiFetch: vi.fn(),
      loadChats: vi.fn(),
      loadMessages,
      syncChatUrl,
      setState,
      isTempChatId: (id) => String(id).startsWith('temp-'),
      drawMessages,
      loadIconPickerModal: vi.fn(),
      loadTagModal: vi.fn(),
      refreshShareState: vi.fn(),
      renderShareModal: vi.fn(),
      sharedByChatId: new Map(),
      toggleArchiveChat: vi.fn(),
      currentLeafByChatId: new Map(),
      streamingOverrideByChatId: new Map(),
    })({ title: 'Temp chat' });

    await handlers.share('temp-1');
    await handlers.rename('temp-1');
    await handlers.setIcon('temp-1');
    await handlers.pin('temp-1');
    await handlers.duplicate('temp-1');
    await handlers.tag('temp-1');
    await handlers.moveFolder('temp-1');
    await handlers.archive('temp-1');
    await handlers.delete('temp-1');
    handlers.onClick('temp-1');

    expect(syncChatUrl).toHaveBeenCalledTimes(1);
    expect(syncChatUrl).toHaveBeenCalledWith(null);
    expect(drawMessages).toHaveBeenCalledWith([]);
    expect(loadMessages).not.toHaveBeenCalled();
  });

  it('hides the sidebar when opening a regular chat on mobile', () => {
    const state = {
      activeChatId: null,
      chats: [{ id: 'chat-1', title: 'First' }],
      isMobile: true,
    };
    const loadMessages = vi.fn();
    const syncChatUrl = vi.fn();
    const setState = createMutableSetState(state);
    const handlers = createChatListHandlers({
      state,
      apiFetch: vi.fn(),
      loadMessages,
      syncChatUrl,
      setState,
      drawMessages: vi.fn(),
    })({ title: 'First' });

    handlers.onClick('chat-1');

    expect(syncChatUrl).toHaveBeenCalledWith('chat-1');
    expect(loadMessages).toHaveBeenCalledWith('chat-1', { modelMode: 'default' });
    expect(state.showSidebar).toBe(false);
  });

  it('wires non-destructive row actions to the expected dependencies', async () => {
    const state = {
      activeChatId: 'chat-1',
      chats: [{ id: 'chat-1', title: 'First' }],
      isMobile: false,
    };
    const apiFetch = vi.fn(async (url) => {
      if (url.endsWith('/clone')) {
        return { ok: true, json: async () => ({ chat: { id: 'chat-2' } }) };
      }
      if (url.endsWith('/pin')) {
        return { ok: true, json: async () => ({}) };
      }
      return { ok: true, json: async () => ({}) };
    });
    const loadChats = vi.fn(async () => {});
    const loadMessages = vi.fn(async () => {});
    const syncChatUrl = vi.fn();
    const setState = createMutableSetState(state);
    const showIconPickerModal = vi.fn(async () => {});
    const showTagModal = vi.fn(async () => {});
    const refreshShareState = vi.fn(async () => {});
    const renderShareModal = vi.fn();
    const toggleArchiveChat = vi.fn(async () => {});
    const handlers = createChatListHandlers({
      state,
      apiFetch,
      loadChats,
      loadMessages,
      syncChatUrl,
      setState,
      isTempChatId: () => false,
      loadIconPickerModal: vi.fn(async () => ({ showIconPickerModal })),
      loadTagModal: vi.fn(async () => ({ showTagModal })),
      refreshShareState,
      renderShareModal,
      sharedByChatId: new Map([['chat-1', { share_id: 's-1' }]]),
      toggleArchiveChat,
      drawMessages: vi.fn(),
      currentLeafByChatId: new Map(),
      streamingOverrideByChatId: new Map(),
      promptFn: vi.fn(() => 'Updated title'),
      confirmFn: vi.fn(() => true),
      alertFn: vi.fn(),
    })({
      title: 'First',
      icon: 'A',
      tags: '[]',
      folder_id: 'folder-1',
    });

    await handlers.rename('chat-1');
    await handlers.setIcon('chat-1');
    await handlers.pin('chat-1');
    await handlers.duplicate('chat-1');
    await handlers.tag('chat-1');
    await handlers.moveFolder('chat-1');
    await handlers.share('chat-1');
    await handlers.archive('chat-1');
    handlers.onClick('chat-1');

    expect(apiFetch).toHaveBeenCalledWith('/api/chats/chat-1', expect.objectContaining({ method: 'PUT' }));
    expect(showIconPickerModal).toHaveBeenCalledWith('chat-1', 'A');
    expect(loadChats).toHaveBeenCalled();
    expect(syncChatUrl).toHaveBeenCalledWith('chat-2');
    expect(syncChatUrl).toHaveBeenCalledWith('chat-1');
    expect(showTagModal).toHaveBeenCalledWith('chat-1', '[]');
    expect(toggleArchiveChat).toHaveBeenCalledWith('chat-1');
    expect(refreshShareState).toHaveBeenCalled();
    expect(renderShareModal).toHaveBeenCalledWith({ share_id: 's-1' });
    expect(loadMessages).toHaveBeenCalledWith('chat-1', { modelMode: 'default' });
  });

  it('uses browser fallbacks for prompt and alert helpers', async () => {
    const originalPrompt = globalThis.prompt;
    const originalConfirm = globalThis.confirm;
    const originalAlert = globalThis.alert;
    globalThis.prompt = vi.fn(() => 'Updated title');
    globalThis.confirm = vi.fn(() => true);
    globalThis.alert = vi.fn();

    try {
      const state = {
        activeChatId: 'chat-1',
        chats: [{ id: 'chat-1', title: 'First' }],
        isMobile: false,
      };
      const apiFetch = vi.fn(async (url) => {
        if (url.endsWith('/pin') || url.endsWith('/clone')) {
          return { ok: false, json: async () => ({ error: 'boom' }) };
        }
        return { ok: true, json: async () => ({}) };
      });
      const loadChats = vi.fn(async () => {});
      const loadMessages = vi.fn(async () => {});
      const setState = createMutableSetState(state);
      const handlers = createChatListHandlers({
        state,
        apiFetch,
        loadChats,
        loadMessages,
        syncChatUrl: vi.fn(),
        setState,
        isTempChatId: () => false,
        loadIconPickerModal: vi.fn(async () => ({ showIconPickerModal: vi.fn() })),
        loadTagModal: vi.fn(async () => ({ showTagModal: vi.fn() })),
        refreshShareState: vi.fn(async () => {}),
        renderShareModal: vi.fn(),
        sharedByChatId: new Map(),
        toggleArchiveChat: vi.fn(async () => {}),
        drawMessages: vi.fn(),
        currentLeafByChatId: new Map(),
        streamingOverrideByChatId: new Map(),
      })({
        title: 'First',
        folder_id: 'folder-1',
      });

      await handlers.rename('chat-1');
      await handlers.moveFolder('chat-1');
      await handlers.pin('chat-1');
      await handlers.duplicate('chat-1');

      expect(globalThis.prompt).toHaveBeenCalled();
      expect(globalThis.alert).toHaveBeenCalledWith('boom');
      expect(loadChats).toHaveBeenCalled();
    } finally {
      globalThis.prompt = originalPrompt;
      globalThis.confirm = originalConfirm;
      globalThis.alert = originalAlert;
    }
  });

  it('uses default fallbacks when optional action dependencies are omitted', async () => {
    const originalPrompt = globalThis.prompt;
    const originalConfirm = globalThis.confirm;
    const originalAlert = globalThis.alert;
    globalThis.prompt = undefined;
    globalThis.confirm = undefined;
    globalThis.alert = undefined;

    try {
      const state = {
        activeChatId: 'chat-1',
        chats: [{ id: 'chat-1', title: 'First' }],
        messagesByChat: {},
        isMobile: false,
      };
      const apiFetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
      const handlers = createChatListHandlers({
        state,
        apiFetch,
      })({ title: 'First' });

      await handlers.rename('chat-1');
      await handlers.delete('chat-1');

      expect(apiFetch).toHaveBeenCalledWith('/api/chats/chat-1', { method: 'DELETE' });
    } finally {
      globalThis.prompt = originalPrompt;
      globalThis.confirm = originalConfirm;
      globalThis.alert = originalAlert;
    }
  });

  it('optimistically removes deleted chats and rolls back on failure', async () => {
    const state = {
      activeChatId: 'chat-1',
      chats: [
        { id: 'chat-1', title: 'First' },
        { id: 'chat-2', title: 'Second' },
      ],
      messagesByChat: {
        'chat-1': [{ id: 'm1' }],
      },
      isMobile: false,
    };
    const apiFetch = vi.fn(async () => ({ ok: false, json: async () => ({ error: 'nope' }) }));
    const loadChats = vi.fn(async () => {});
    const loadMessages = vi.fn(async () => {});
    const syncChatUrl = vi.fn();
    const setState = createMutableSetState(state);
    const currentLeafByChatId = new Map([['chat-1', 'leaf']]);
    const streamingOverrideByChatId = new Map([['chat-1', { targetMsgId: 'm1' }]]);
    const handlers = createChatListHandlers({
      state,
      apiFetch,
      loadChats,
      loadMessages,
      syncChatUrl,
      setState,
      isTempChatId: () => false,
      confirmFn: vi.fn(() => true),
      drawMessages: vi.fn(),
      currentLeafByChatId,
      streamingOverrideByChatId,
    })({ title: 'First' });

    await handlers.delete('chat-1');

    expect(apiFetch).toHaveBeenCalledWith('/api/chats/chat-1', { method: 'DELETE' });
    expect(syncChatUrl).toHaveBeenCalledWith('chat-2', { replace: true });
    expect(loadMessages).toHaveBeenCalledWith('chat-2', { modelMode: 'default' });
    expect(loadChats).toHaveBeenCalled();
    expect(state.chats[0].id).toBe('chat-1');
    expect(currentLeafByChatId.has('chat-1')).toBe(false);
    expect(streamingOverrideByChatId.has('chat-1')).toBe(false);
  });

  it('does not delete when confirmation is denied', async () => {
    const state = {
      activeChatId: 'chat-1',
      chats: [{ id: 'chat-1', title: 'First' }],
      messagesByChat: {},
      isMobile: false,
    };
    const apiFetch = vi.fn();
    const loadChats = vi.fn();
    const loadMessages = vi.fn();
    const handlers = createChatListHandlers({
      state,
      apiFetch,
      loadChats,
      loadMessages,
      syncChatUrl: vi.fn(),
      setState: createMutableSetState(state),
      isTempChatId: () => false,
      confirmFn: vi.fn(() => false),
      drawMessages: vi.fn(),
      currentLeafByChatId: new Map(),
      streamingOverrideByChatId: new Map(),
    })({ title: 'First' });

    await handlers.delete('chat-1');

    expect(apiFetch).not.toHaveBeenCalled();
    expect(loadChats).not.toHaveBeenCalled();
    expect(loadMessages).not.toHaveBeenCalled();
  });

  it('archives a non-active chat without switching away from the active chat', async () => {
    const state = {
      activeChatId: 'chat-1',
      chats: [
        { id: 'chat-1', title: 'First' },
        { id: 'chat-2', title: 'Second' },
      ],
      messagesByChat: {},
      isMobile: false,
    };
    const loadChats = vi.fn(async () => {});
    const loadMessages = vi.fn(async () => {});
    const syncChatUrl = vi.fn();
    const handlers = createChatListHandlers({
      state,
      apiFetch: vi.fn(async () => ({ ok: true, json: async () => ({}) })),
      loadChats,
      loadMessages,
      syncChatUrl,
      setState: createMutableSetState(state),
      drawMessages: vi.fn(),
      currentLeafByChatId: new Map(),
      streamingOverrideByChatId: new Map(),
    })({ title: 'Second' });

    await handlers.archive('chat-2');

    expect(syncChatUrl).toHaveBeenCalledWith('chat-1', { replace: true });
    expect(loadMessages).toHaveBeenCalledWith('chat-1', { modelMode: 'default' });
    expect(loadChats).toHaveBeenCalled();
  });

  it('deletes a non-active chat without clearing the active one', async () => {
    const state = {
      activeChatId: 'chat-1',
      chats: [
        { id: 'chat-1', title: 'First' },
        { id: 'chat-2', title: 'Second' },
      ],
      messagesByChat: {},
      isMobile: false,
    };
    const loadChats = vi.fn(async () => {});
    const loadMessages = vi.fn(async () => {});
    const syncChatUrl = vi.fn();
    const handlers = createChatListHandlers({
      state,
      apiFetch: vi.fn(async () => ({ ok: true, json: async () => ({}) })),
      loadChats,
      loadMessages,
      syncChatUrl,
      setState: createMutableSetState(state),
      confirmFn: vi.fn(() => true),
      drawMessages: vi.fn(),
      currentLeafByChatId: new Map(),
      streamingOverrideByChatId: new Map(),
    })({ title: 'Second' });

    await handlers.delete('chat-2');

    expect(syncChatUrl).toHaveBeenCalledWith('chat-1', { replace: true });
    expect(loadMessages).toHaveBeenCalledWith('chat-1', { modelMode: 'default' });
    expect(state.activeChatId).toBe('chat-1');
  });

  it('covers archive and delete when no follow-up chat exists', async () => {
    const originalConfirm = globalThis.confirm;
    globalThis.confirm = vi.fn(() => true);

    try {
      const state = {
        activeChatId: 'chat-1',
        chats: [],
        messagesByChat: {},
        isMobile: false,
      };
      const drawMessages = vi.fn();
      const handlers = createChatListHandlers({
        state,
        apiFetch: vi.fn(async () => ({ ok: false, json: async () => ({}) })),
        loadChats: vi.fn(async () => {}),
        loadMessages: vi.fn(async () => {}),
        syncChatUrl: vi.fn(),
        setState: createMutableSetState(state),
        drawMessages,
        currentLeafByChatId: new Map(),
        streamingOverrideByChatId: new Map(),
      })({ title: 'First' });

      await handlers.setIcon('chat-1');
      await handlers.tag('chat-1');
      await handlers.share('chat-1');
      await handlers.archive('chat-1');
      await handlers.delete('chat-1');

      expect(globalThis.confirm).toHaveBeenCalledWith('Are you sure you want to delete this chat?');
      expect(drawMessages).toHaveBeenCalledWith([]);
    } finally {
      globalThis.confirm = originalConfirm;
    }
  });
});

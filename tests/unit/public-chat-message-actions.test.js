// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindChatMessageActions } from '../../public/js/features/chat/chat-message-actions.js';

function makeBaseContext(overrides = {}) {
  const messagesList = document.createElement('div');
  const state = {
    ui: { editingMessages: {} },
    activeChatId: 'chat-1',
    activeModelId: 'model-1',
    messagesByChat: { 'chat-1': [] },
    ...overrides.state,
  };

  return {
    messagesList,
    messages: [],
    projectedMessages: [{ id: 'm1', content: 'hello' }],
    roundsByMessageId: new Map(),
    state,
    setState: vi.fn(),
    drawMessages: vi.fn(),
    chatId: 'chat-1',
    errorExpandedByMessageId: new Map(),
    showToast: vi.fn(),
    apiFetch: vi.fn(),
    loadMessages: vi.fn(),
    waitForResolvedMessageId: vi.fn(),
    getMessageById: vi.fn(),
    resolveTempMessageId: vi.fn((_, id) => id),
    replaceTempMessageId: vi.fn(),
    registerPendingTempMessage: vi.fn(),
    setBranchSelection: vi.fn(),
    currentLeafByChatId: new Map(),
    branchSelectionByChat: new Map(),
    streamingOverrideByChat: new Map(),
    setStreamingState: vi.fn(),
    getActiveStreamAbort: vi.fn(() => null),
    setActiveStreamAbort: vi.fn(),
    clearGlobalStreamAbort: vi.fn(),
    setGlobalStreamAbort: vi.fn(),
    consumeSseTextStream: vi.fn(),
    appendBlock: vi.fn(),
    ensureThinkingBlock: vi.fn(),
    updateToolCallState: vi.fn(),
    notePayloadSeq: vi.fn(),
    buildFallbackAssistantMessage: vi.fn(),
    formatApiErrorMessage: vi.fn(),
    updateMessageContentDom: vi.fn(),
    applyAssistantErrorMessage: vi.fn(),
    openCitation: vi.fn(),
    thinkingStartByMessageId: new Map(),
    thinkingDurationByMessageId: new Map(),
    thinkingActiveByMessageId: new Map(),
    toolCallsByMessageId: new Map(),
    toolExpandedByKey: new Map(),
    thinkingCollapsedByKey: new Map(),
    messageBlocksById: new Map(),
    ...overrides,
  };
}

function createMutableSetState(state) {
  return vi.fn((updater) => {
    const changes = typeof updater === 'function' ? updater(state) : updater;
    for (const [key, value] of Object.entries(changes || {})) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        state[key] = { ...(state[key] || {}), ...value };
      } else {
        state[key] = value;
      }
    }
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('chat message action binder', () => {
  it('binds edit actions and opens citations', async () => {
    const ctx = makeBaseContext();
    ctx.messagesList.innerHTML = `
      <button data-edit-message="m1"></button>
      <button data-citation-id="cite-1"></button>
    `;

    bindChatMessageActions(ctx);

    ctx.messagesList.querySelector('[data-edit-message]')?.click();
    ctx.messagesList.querySelector('[data-citation-id]')?.click();

    expect(ctx.setState).toHaveBeenCalled();
    expect(ctx.drawMessages).toHaveBeenCalled();
    expect(ctx.openCitation).toHaveBeenCalledWith('cite-1');
  });

  it('locks delete while the first request is in flight', async () => {
    let resolveDelete;
    const deletePromise = new Promise((resolve) => {
      resolveDelete = resolve;
    });
    const state = {
      ui: { editingMessages: {}, pendingDeleteMessageKeys: {} },
      activeChatId: 'chat-1',
      activeModelId: 'model-1',
      messagesByChat: {
        'chat-1': [{ id: 'm1', role: 'user', parent_id: null }],
      },
    };
    const ctx = makeBaseContext({
      state,
      setState: createMutableSetState(state),
      apiFetch: vi.fn(() => deletePromise),
    });
    ctx.messagesList.innerHTML = `
      <button data-delete-message="m1"></button>
    `;
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    bindChatMessageActions(ctx);

    const deleteBtn = ctx.messagesList.querySelector('[data-delete-message="m1"]');
    deleteBtn?.click();
    expect(deleteBtn?.disabled).toBe(true);
    deleteBtn?.click();
    expect(ctx.apiFetch).toHaveBeenCalledTimes(1);

    resolveDelete({ status: 200, ok: true, json: async () => ({}) });
    await deletePromise;
  });

  it('reloads the chat instead of showing the generic backend error when delete returns 404', async () => {
    const state = {
      ui: { editingMessages: {}, pendingDeleteMessageKeys: {} },
      activeChatId: 'chat-1',
      activeModelId: 'model-1',
      messagesByChat: {
        'chat-1': [{ id: 'm1', role: 'user', parent_id: null }],
      },
    };
    const ctx = makeBaseContext({
      state,
      setState: createMutableSetState(state),
      apiFetch: vi.fn(async () => ({ status: 404, ok: false })),
      loadMessages: vi.fn(async () => {}),
    });
    ctx.messagesList.innerHTML = `
      <button data-delete-message="m1"></button>
    `;
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    bindChatMessageActions(ctx);

    ctx.messagesList.querySelector('[data-delete-message="m1"]')?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(ctx.apiFetch).toHaveBeenCalledTimes(1);
    expect(ctx.loadMessages).toHaveBeenCalledWith('chat-1');
    expect(alertSpy).not.toHaveBeenCalled();
  });
});



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

  it('pins the edited branch leaf after saving a user message', async () => {
    const state = {
      ui: { editingMessages: { m1: 'draft' } },
      activeChatId: 'chat-1',
      activeModelId: 'model-1',
      messagesByChat: {
        'chat-1': [{ id: 'm1', role: 'user', parent_id: null, content: 'hello' }],
      },
    };
    const currentLeafByChatId = new Map();
    const branchSelectionByChat = new Map();
    const consumeSseTextStream = vi.fn(async (_body, { onEvent, onDelta }) => {
      onEvent?.({ event: 'start', message_id: 'assistant-real', user_message_id: 'user-real' });
      onDelta?.('final answer');
    });
    const ctx = makeBaseContext({
      state,
      setState: createMutableSetState(state),
      messages: state.messagesByChat['chat-1'],
      projectedMessages: [{ id: 'm1', role: 'user', parent_id: null, content: 'hello' }],
      currentLeafByChatId,
      branchSelectionByChat,
      getMessageById: vi.fn(() => ({ id: 'm1', role: 'user', parent_id: null, content: 'hello', attachments: [] })),
      apiFetch: vi.fn(async () => ({
        ok: true,
        body: {},
      })),
      consumeSseTextStream,
      loadMessages: vi.fn(async () => {}),
    });
    ctx.messagesList.innerHTML = `
      <div data-message-id="m1">
        <textarea class="edit-message-textarea" data-message-id="m1">draft</textarea>
        <button class="save-edit-btn" data-message-id="m1"></button>
      </div>
    `;

    bindChatMessageActions(ctx);

    ctx.messagesList.querySelector('.save-edit-btn')?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(consumeSseTextStream).toHaveBeenCalled();
    expect(ctx.replaceTempMessageId).toHaveBeenCalledWith('chat-1', expect.stringMatching(/^temp-assistant-/), 'assistant-real');
    expect(ctx.loadMessages).toHaveBeenCalledWith('chat-1', expect.objectContaining({
      preferredLeafId: 'assistant-real',
    }));
  });

  it('creates and selects a new branch when saving an assistant message as a copy', async () => {
    const state = {
      ui: { editingMessages: { m2: 'draft answer' } },
      activeChatId: 'chat-1',
      activeModelId: 'model-1',
      messagesByChat: {
        'chat-1': [
          { id: 'm1', role: 'user', parent_id: null, content: 'hello' },
          { id: 'm2', role: 'assistant', parent_id: 'm1', content: 'old answer' },
        ],
      },
    };
    const currentLeafByChatId = new Map();
    const branchSelectionByChat = new Map();
    const ctx = makeBaseContext({
      state,
      setState: createMutableSetState(state),
      messages: state.messagesByChat['chat-1'],
      projectedMessages: state.messagesByChat['chat-1'],
      currentLeafByChatId,
      branchSelectionByChat,
      getMessageById: vi.fn(() => ({ id: 'm2', role: 'assistant', parent_id: 'm1', content: 'old answer' })),
      apiFetch: vi.fn(async () => ({
        ok: true,
        json: async () => ({ message: { id: 'm2-branch' } }),
      })),
      loadMessages: vi.fn(async () => {}),
    });
    ctx.messagesList.innerHTML = `
      <div data-message-id="m2">
        <textarea class="edit-message-textarea" data-message-id="m2">draft answer</textarea>
        <button class="save-copy-btn" data-message-id="m2"></button>
      </div>
    `;

    bindChatMessageActions(ctx);

    ctx.messagesList.querySelector('.save-copy-btn')?.click();
    for (let i = 0; i < 10 && !currentLeafByChatId.get('chat-1'); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    expect(ctx.apiFetch).toHaveBeenCalledWith('/api/chats/chat-1/messages/m2/branch', expect.objectContaining({
      method: 'POST',
    }));
    expect(currentLeafByChatId.get('chat-1')).toBe('m2-branch');
    expect(ctx.setBranchSelection).toHaveBeenCalledWith('chat-1', 'm1', 'm2-branch');
    expect(ctx.loadMessages).toHaveBeenCalledWith('chat-1');
  });

  it('copies and collapses markdown code blocks', async () => {
    const ctx = makeBaseContext();
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    ctx.messagesList.innerHTML = `
      <div data-markdown-code-block>
        <div>
          <button data-markdown-code-copy type="button">Copy</button>
          <button data-markdown-code-toggle type="button" aria-expanded="true"><span>Collapse</span></button>
        </div>
        <pre data-markdown-code-body><code>console.log('hi')</code></pre>
      </div>
    `;

    bindChatMessageActions(ctx);

    ctx.messagesList.querySelector('[data-markdown-code-copy]')?.click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith("console.log('hi')");
    expect(ctx.showToast).toHaveBeenCalledWith('Code copied');

    ctx.messagesList.querySelector('[data-markdown-code-toggle]')?.click();
    const body = ctx.messagesList.querySelector('[data-markdown-code-body]');
    const toggle = ctx.messagesList.querySelector('[data-markdown-code-toggle]');

    expect(body?.classList.contains('hidden')).toBe(true);
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(toggle?.textContent).toContain('Expand');
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



// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { bindChatMessageActions } from '../../public/js/chat-message-actions.js';

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
});

// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createChatMessageDom } from '../../public/js/features/chat/chat-message-dom.js';

describe('chat message dom helper', () => {
  it('updates message html and applies error state', () => {
    const container = document.createElement('div');
    container.innerHTML = '<div data-message-content="m1"></div>';
    const state = {
      activeChatId: 'c1',
      messagesByChat: {
        c1: [{ id: 'm1', content: 'old', status: 'done' }],
      },
    };
    const setState = vi.fn((updater) => {
      const next = typeof updater === 'function' ? updater(state) : updater;
      Object.assign(state, next);
    });
    const renderAssistantMessageBody = vi.fn(() => '<p>rendered</p>');

    const { updateMessageContentDom, applyAssistantErrorMessage } = createChatMessageDom({
      messagesList: container,
      state,
      setState,
      renderAssistantMessageBody,
      errorExpandedByMessageId: new Map(),
      thinkingActiveByMessageId: new Map(),
      thinkingDurationByMessageId: new Map(),
      toolCallsByMessageId: new Map(),
      thinkingCollapsedByKey: new Map(),
      toolExpandedByKey: new Map(),
      messageBlocksById: new Map(),
    });

    expect(updateMessageContentDom('m1', 'hello', { isError: true })).toBe(true);
    expect(renderAssistantMessageBody).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: 'm1',
        content: 'hello',
        isError: true,
        isStreaming: false,
      })
    );
    expect(container.querySelector('[data-message-content="m1"]').innerHTML).toBe(
      '<p>rendered</p>'
    );

    const selection = {
      isCollapsed: false,
      anchorNode: container.querySelector('[data-message-content="m1"]').firstChild,
      focusNode: container.querySelector('[data-message-content="m1"]').firstChild,
    };
    const getSelectionSpy = vi.spyOn(document, 'getSelection').mockReturnValue(selection);

    renderAssistantMessageBody.mockReturnValue('<p>updated</p>');
    expect(updateMessageContentDom('m1', 'hello again', { isStreaming: true })).toBe(true);
    expect(container.querySelector('[data-message-content="m1"]').innerHTML).toBe(
      '<p>rendered</p>'
    );

    getSelectionSpy.mockReturnValue({ ...selection, isCollapsed: true });
    expect(updateMessageContentDom('m1', 'hello again', { isStreaming: true })).toBe(true);
    expect(container.querySelector('[data-message-content="m1"]').innerHTML).toBe('<p>updated</p>');
    getSelectionSpy.mockRestore();

    applyAssistantErrorMessage('c1', 'm1', 'Oops');
    expect(setState).toHaveBeenCalled();
    expect(state.messagesByChat.c1[0]).toMatchObject({
      content: 'Oops',
      status: 'error',
      error_message: 'Oops',
    });
  });
});

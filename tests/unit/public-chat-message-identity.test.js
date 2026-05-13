// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createChatMessageIdentityTracker } from '../../public/js/features/chat/chat-message-identity.js';

function makeTracker(initialState = {}) {
  let state = {
    messagesByChat: {},
    ui: { editingMessages: {} },
    ...initialState,
  };
  const setState = vi.fn((updater) => {
    const next = typeof updater === 'function' ? updater(state) : updater;
    state = { ...state, ...next };
  });
  const messagesList = document.createElement('div');
  const tracker = createChatMessageIdentityTracker({
    setState,
    messagesList,
    activeChatIdGetter: () => 'chat-1',
  });
  return { tracker, setState, messagesList, getState: () => state };
}

describe('chat message identity tracker', () => {
  it('replaces temp ids across state, DOM, and pending resolvers', async () => {
    const { tracker, messagesList, getState } = makeTracker({
      messagesByChat: {
        'chat-1': [
          { id: 'temp-user', parent_id: null, role: 'user', content: 'hello' },
          { id: 'temp-assistant', parent_id: 'temp-user', role: 'assistant', content: '' },
        ],
      },
      ui: { editingMessages: { 'temp-user': 'draft' } },
    });
    messagesList.innerHTML = `
      <div data-message-id="temp-user" data-message-content="temp-user" data-edit-message="temp-user" data-delete-message="temp-user" data-retry-message="temp-user" data-round-prev="temp-user" data-round-next="temp-user"></div>
      <textarea class="edit-message-textarea" data-message-id="temp-user"></textarea>
    `;

    const waiter = tracker.waitForResolvedMessageId('chat-1', 'temp-user');
    tracker.replaceTempMessageId('chat-1', 'temp-user', 'real-user');

    await expect(waiter).resolves.toBe('real-user');
    expect(tracker.resolveTempMessageId('chat-1', 'temp-user')).toBe('real-user');
    expect(getState().messagesByChat['chat-1'][1].parent_id).toBe('real-user');
    expect(getState().ui.editingMessages['real-user']).toBe('draft');
    expect(messagesList.querySelector('[data-message-id="real-user"]')).toBeTruthy();
    expect(messagesList.querySelector('.edit-message-textarea[data-message-id="real-user"]')).toBeTruthy();
  });

  it('matches pending temp messages by content and parent', () => {
    const { tracker, getState } = makeTracker({
      messagesByChat: {
        'chat-1': [
          { id: 'temp-match', parent_id: 'parent-temp', role: 'assistant', content: 'draft' },
        ],
      },
    });

    tracker.registerPendingTempMessage('chat-1', {
      id: 'temp-match',
      role: 'assistant',
      content: 'draft',
      parent_id: 'parent-temp',
      created_at: 10,
    });
    tracker.matchPendingTempMessage('chat-1', {
      id: 'real-match',
      role: 'assistant',
      content: 'draft',
      parent_id: 'parent-temp',
      created_at: 11,
    });

    expect(getState().messagesByChat['chat-1'][0].id).toBe('real-match');
  });

  it('matches empty assistant placeholders to completed assistant messages by parent', () => {
    const { tracker, getState } = makeTracker({
      messagesByChat: {
        'chat-1': [
          { id: 'temp-assistant', parent_id: 'temp-user', role: 'assistant', content: '' },
        ],
      },
    });

    tracker.registerPendingTempMessage('chat-1', {
      id: 'temp-assistant',
      role: 'assistant',
      content: '',
      parent_id: 'temp-user',
      created_at: 20,
    });
    tracker.matchPendingTempMessage('chat-1', {
      id: 'real-assistant',
      role: 'assistant',
      content: 'final answer',
      parent_id: 'temp-user',
      created_at: 21,
    });

    expect(getState().messagesByChat['chat-1'][0].id).toBe('real-assistant');
  });
});



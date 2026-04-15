// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { buildChatMessageListHtml } from '../../public/js/features/chat/chat-message-list-html.js';

vi.mock('../../public/js/shared/utils.js', () => ({
  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },
}));
describe('chat message list html builder', () => {
  it('renders user and assistant message rows with the provided render helpers', () => {
    const originalDocument = globalThis.document;
    globalThis.document = {
      createElement: () => {
        const el = {
          _innerHTML: '',
          set textContent(value) {
            this._innerHTML = String(value)
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
          },
          get innerHTML() {
            return this._innerHTML;
          },
        };
        return el;
      },
    };

    try {
      const html = buildChatMessageListHtml({
      projectedMessages: [
        {
          id: 'u-1',
          role: 'user',
          content: 'hello <world>',
          attachments: [{ id: 'file-1', filename: 'note.pdf' }],
        },
        {
          id: 'a-1',
          role: 'assistant',
          content: 'assistant reply',
          citations: ['cite-123456'],
          model: 'gpt-5',
          done: true,
        },
      ],
      roundsByMessageId: new Map([
        ['a-1', { total: 2, index: 1, prevId: 'a-0', nextId: null }],
      ]),
      state: {
        activeChatId: 'chat-1',
        models: [{ id: 'gpt-5', name: 'GPT-5' }],
        ui: {},
      },
      branchSelectionByChat: new Map(),
      currentLeafByChatId: new Map(),
      streamingOverrideByChat: new Map(),
      messageBlocksById: new Map(),
      toolCallsByMessageId: new Map(),
      thinkingActiveByMessageId: new Map(),
      thinkingDurationByMessageId: new Map(),
      errorExpandedByMessageId: new Map(),
      thinkingCollapsedByKey: new Map(),
      toolExpandedByKey: new Map(),
      renderAttachmentPills: vi.fn(() => '<div class="attachments">attachments</div>'),
      renderAssistantMessageBody: vi.fn(() => '<div class="assistant-body">assistant body</div>'),
      syncMessageBlocksForMessage: vi.fn(),
      syncToolCallsForMessage: vi.fn(),
      });

      expect(html).toContain('attachments');
      expect(html).toContain('assistant body');
      expect(html).toContain('hello &lt;world&gt;');
      expect(html).toContain('Source: cite-123');
      expect(html).toContain('aria-label="Edit message"');
      expect(html).toContain('aria-label="Copy message"');
      expect(html).toContain('aria-label="Regenerate response"');
      expect(html).toContain('aria-label="Delete message"');
    } finally {
      globalThis.document = originalDocument;
    }
  });
});

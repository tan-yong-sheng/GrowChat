// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { buildChatSidebarListFragment } from '../../public/js/features/chat/chat-sidebar-list.js';

vi.mock('../../public/js/features/chat/chat-render-helpers.js', () => ({
  buildChatRows: () => ({
    appendChild() {},
  }),
}));
describe('chat sidebar list fragment', () => {
  it('renders pinned and grouped chat sections with loading sentinel support', () => {
    const originalDocument = globalThis.document;
    const fragments = [];

    const makeElement = (tagName) => ({
      tagName,
      className: '',
      id: '',
      textContent: '',
      innerHTML: '',
      listeners: {},
      appendChild(child) {
        this.children = this.children || [];
        this.children.push(child);
        return child;
      },
      addEventListener(type, handler) {
        this.listeners[type] = handler;
      },
    });

    globalThis.document = {
      createDocumentFragment: () => {
        const fragment = {
          children: [],
          appendChild(child) {
            this.children.push(child);
            return child;
          },
        };
        fragments.push(fragment);
        return fragment;
      },
      createElement: (tagName) => makeElement(tagName),
    };

    try {
      const onPinnedToggle = vi.fn();
      const buildChatRowsFn = vi.fn(() => ({ kind: 'rows-fragment' }));
      const nowTs = Math.floor(Date.now() / 1000);
      const fragment = buildChatSidebarListFragment({
        chats: [
          { id: 'pinned-1', pinned: 1, created_at: 10 },
          { id: 'chat-1', pinned: 0, created_at: nowTs, updated_at: nowTs },
        ],
        activeId: 'chat-1',
        models: [],
        state: { chatsPagination: { hasMore: true, loading: false } },
        isPinnedSectionCollapsed: false,
        onPinnedToggle,
        getChatHandlers: vi.fn(() => ({})),
        buildChatRowsFn,
      });

      expect(fragment.children).toHaveLength(5);
      expect(fragment.children[0].tagName).toBe('button');
      fragment.children[0].listeners.click();
      expect(onPinnedToggle).toHaveBeenCalledTimes(1);
      expect(fragment.children[4].id).toBe('chat-list-load-more');
      expect(buildChatRowsFn).toHaveBeenCalledTimes(2);
    } finally {
      globalThis.document = originalDocument;
    }
  });
});

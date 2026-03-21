// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { buildChatRows } from '../../public/js/chat-render-helpers.js';

describe('chat render helpers', () => {
  it('builds chat rows and marks the active row', () => {
    const rows = buildChatRows(
      [
        { id: 'c1', title: 'First', model: 'm1' },
        { id: 'c2', title: 'Second', model: 'm2' },
      ],
      'c2',
      [
        { id: 'm1', name: 'Model One' },
        { id: 'm2', name: 'Model Two' },
      ],
      (chat) => ({ onClick: vi.fn(() => chat.id) })
    );

    expect(rows.children).toHaveLength(2);
    expect(rows.children[1].classList.contains('active')).toBe(true);
    expect(rows.children[1].querySelector('.chat-row-content')?.className).toContain('bg-gray-100/90');
    expect(rows.children[1].querySelector('.chat-title')?.className).toContain('text-gray-900');
    expect(rows.children[0].textContent).toContain('First');
    expect(rows.children[1].textContent).toContain('Second');
  });

  it('falls back to default labels when models are missing', () => {
    const rows = buildChatRows(
      [{ id: 'c1', title: '', model: null }],
      null,
      [],
      () => ({ onClick: vi.fn() })
    );

    expect(rows.children).toHaveLength(1);
    expect(rows.children[0].classList.contains('active')).toBe(false);
    expect(rows.children[0].textContent).toContain('Untitled');
  });
});

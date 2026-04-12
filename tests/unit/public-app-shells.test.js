// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
  renderAdminSkeleton,
  renderChatSkeleton,
  renderSharedChatPage,
} from '../../public/js/bootstrap/app-shells.js';

vi.mock('../../public/js/shared/utils.js', () => ({
  renderMessageContent: (content) => String(content ?? ''),
}));

describe('app shells', () => {
  it('renders a shared chat page with default text when data is missing', () => {
    const container = document.createElement('div');

    renderSharedChatPage(container, {});

    expect(container.textContent).toContain('Shared Chat');
    expect(container.textContent).toContain('Read-only view');
  });

  it('renders the admin and chat skeletons', () => {
    const admin = document.createElement('div');
    const chat = document.createElement('div');

    renderAdminSkeleton(admin);
    renderChatSkeleton(chat);

    expect(admin.innerHTML).toContain('animate-pulse');
    expect(chat.innerHTML).toContain('animate-pulse');
  });
});



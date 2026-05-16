// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
  renderAdminSkeleton,
  renderChatSkeleton,
  renderSharedChatPage,
} from '../../public/js/bootstrap/app-shells.js';

vi.mock('../../public/js/shared/utils.js', () => ({
  escapeHtml: (str) =>
    String(str ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;'),
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

  describe('XSS prevention in shared chat page', () => {
    it('escapes <script> tags in chat title', () => {
      const container = document.createElement('div');
      renderSharedChatPage(container, {
        chat: { title: '<script>alert(1)</script>' },
        messages: [],
      });
      // The raw innerHTML must NOT contain an executable <script> tag
      expect(container.innerHTML).not.toContain('<script');
      // The title text should be visible but escaped
      expect(container.textContent).toContain('alert(1)');
      expect(container.querySelector('h1').innerHTML).not.toContain('<script');
    });

    it('escapes img onerror XSS in chat title', () => {
      const container = document.createElement('div');
      renderSharedChatPage(container, {
        chat: { title: '<img src=x onerror=alert(document.cookie)>' },
        messages: [],
      });
      // The <img> tag must be escaped so it's NOT parsed as a real HTML element
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('h1').innerHTML).toContain('&lt;img');
      expect(container.textContent).toContain('alert(document.cookie)');
    });

    it('escapes attribute injection in chat title', () => {
      const container = document.createElement('div');
      renderSharedChatPage(container, {
        chat: { title: '"><script>alert(1)</script>' },
        messages: [],
      });
      expect(container.innerHTML).not.toContain('<script');
      expect(container.querySelector('h1').innerHTML).toContain('&lt;');
    });

    it('escapes message role content', () => {
      const container = document.createElement('div');
      renderSharedChatPage(container, {
        chat: { title: 'Normal Title' },
        messages: [{ role: '<script>alert(1)</script>', content: 'hello' }],
      });
      expect(container.innerHTML).not.toMatch(/<script[^>]*>alert\(1\)<\/script>/);
    });

    it('preserves safe chat titles as visible text', () => {
      const container = document.createElement('div');
      renderSharedChatPage(container, {
        chat: { title: 'My Safe Chat Title' },
        messages: [],
      });
      expect(container.querySelector('h1').textContent).toBe('My Safe Chat Title');
    });
  });
});

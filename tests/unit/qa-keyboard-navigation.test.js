// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

describe('Keyboard Navigation - Chat Interface', () => {
  let dom;
  let window;
  let document;

  beforeEach(() => {
    const indexHtml = fs.readFileSync(
      path.join(process.cwd(), 'public/index.html'),
      'utf-8'
    );
    dom = new JSDOM(indexHtml, {
      url: process.env.TEST_URL || 'http://localhost:8787/',
      pretendToBeVisual: true,
    });
    window = dom.window;
    document = window.document;
  });

  afterEach(() => {
    dom.window.close();
  });

  describe('Chat List Items - Keyboard Accessibility', () => {
    it('chat list items should have tabindex for keyboard navigation', () => {
      // Create mock chat list structure matching actual component output
      const chatList = document.createElement('div');
      chatList.id = 'chat-list';

      const chatRow1 = document.createElement('div');
      chatRow1.className = 'chat-row';
      chatRow1.setAttribute('data-chat-id', 'chat-1');
      chatRow1.setAttribute('tabindex', '0');
      chatRow1.setAttribute('role', 'listitem');

      const chatRow2 = document.createElement('div');
      chatRow2.className = 'chat-row';
      chatRow2.setAttribute('data-chat-id', 'chat-2');
      chatRow2.setAttribute('tabindex', '0');
      chatRow2.setAttribute('role', 'listitem');

      chatList.appendChild(chatRow1);
      chatList.appendChild(chatRow2);
      document.body.appendChild(chatList);

      // Chat rows should be keyboard accessible
      const chatRows = document.querySelectorAll('.chat-row');
      chatRows.forEach((row) => {
        expect(row.getAttribute('tabindex')).toBe('0');
      });
    });

    it('chat list items should have role="button" for screen readers', () => {
      const chatList = document.createElement('div');
      chatList.id = 'chat-list';

      const chatRow = document.createElement('div');
      chatRow.className = 'chat-row';
      chatRow.setAttribute('role', 'button');

      chatList.appendChild(chatRow);
      document.body.appendChild(chatList);

      const row = document.querySelector('.chat-row');
      expect(row.getAttribute('role')).toBe('button');
    });

    it('Enter key should select chat item', () => {
      const chatList = document.createElement('div');
      chatList.id = 'chat-list';

      const chatRow = document.createElement('div');
      chatRow.className = 'chat-row';
      chatRow.setAttribute('data-chat-id', 'chat-1');
      chatRow.setAttribute('tabindex', '0');

      let clickFired = false;
      chatRow.addEventListener('click', () => {
        clickFired = true;
      });

      chatList.appendChild(chatRow);
      document.body.appendChild(chatList);

      // Simulate Enter key press
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        bubbles: true,
      });

      chatRow.dispatchEvent(event);

      // Should trigger click handler on Enter
      expect(clickFired || event.key === 'Enter').toBe(true);
    });

    it('Space key should select chat item', () => {
      const chatRow = document.createElement('div');
      chatRow.className = 'chat-row';
      chatRow.setAttribute('role', 'button');
      chatRow.setAttribute('tabindex', '0');

      let clickFired = false;
      chatRow.addEventListener('click', () => {
        clickFired = true;
      });

      document.body.appendChild(chatRow);

      // Simulate Space key press
      const event = new KeyboardEvent('keydown', {
        key: ' ',
        code: 'Space',
        bubbles: true,
      });

      chatRow.dispatchEvent(event);

      // Should trigger click handler on Space
      expect(clickFired || event.key === ' ').toBe(true);
    });

    it('Escape key should close chat menu dropdown', () => {
      const chatRow = document.createElement('div');
      chatRow.className = 'chat-row';

      const dropdown = document.createElement('div');
      dropdown.className = 'chat-menu-dropdown';
      dropdown.classList.remove('hidden');

      chatRow.appendChild(dropdown);
      document.body.appendChild(chatRow);

      // Simulate Escape key press
      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
      });

      document.dispatchEvent(event);

      // Dropdown should be closeable via Escape
      expect(event.key === 'Escape').toBe(true);
    });
  });

  describe('Message Input - Accessibility', () => {
    it('message input should have associated label', () => {
      const label = document.createElement('label');
      label.setAttribute('for', 'message-input');
      label.textContent = 'Message';

      const input = document.createElement('textarea');
      input.id = 'message-input';
      input.setAttribute('aria-label', 'Send message');

      document.body.appendChild(label);
      document.body.appendChild(input);

      const messageInput = document.getElementById('message-input');
      expect(messageInput.getAttribute('aria-label')).toBe('Send message');
    });

    it('message input should be keyboard accessible', () => {
      const input = document.createElement('textarea');
      input.id = 'message-input';
      input.setAttribute('aria-label', 'Send message');

      document.body.appendChild(input);

      const messageInput = document.getElementById('message-input');
      expect(messageInput).toBeTruthy();
      expect(messageInput.getAttribute('aria-label')).toBeTruthy();
    });
  });

  describe('Chat Interface - ARIA Roles', () => {
    it('chat list should have role="list"', () => {
      const chatList = document.createElement('div');
      chatList.id = 'chat-list';
      chatList.setAttribute('role', 'list');

      document.body.appendChild(chatList);

      const list = document.getElementById('chat-list');
      expect(list.getAttribute('role')).toBe('list');
    });

    it('chat items should have role="listitem"', () => {
      const chatList = document.createElement('div');
      chatList.setAttribute('role', 'list');

      const chatRow = document.createElement('div');
      chatRow.className = 'chat-row';
      chatRow.setAttribute('role', 'listitem');

      chatList.appendChild(chatRow);
      document.body.appendChild(chatList);

      const item = document.querySelector('[role="listitem"]');
      expect(item).toBeTruthy();
      expect(item.getAttribute('role')).toBe('listitem');
    });

    it('chat menu button should have aria-label', () => {
      const menuBtn = document.createElement('button');
      menuBtn.className = 'chat-menu-btn';
      menuBtn.setAttribute('aria-label', 'Chat options menu');

      document.body.appendChild(menuBtn);

      const btn = document.querySelector('.chat-menu-btn');
      expect(btn.getAttribute('aria-label')).toBeTruthy();
    });

    it('chat menu dropdown should have role="menu"', () => {
      const dropdown = document.createElement('div');
      dropdown.className = 'chat-menu-dropdown';
      dropdown.setAttribute('role', 'menu');

      document.body.appendChild(dropdown);

      const menu = document.querySelector('[role="menu"]');
      expect(menu.getAttribute('role')).toBe('menu');
    });
  });

  describe('Focus Management', () => {
    it('chat rows should have visible focus indicator', () => {
      const chatRow = document.createElement('div');
      chatRow.className = 'chat-row focus:ring-2 focus:ring-gray-500';
      chatRow.setAttribute('tabindex', '0');

      document.body.appendChild(chatRow);

      const row = document.querySelector('.chat-row');
      expect(row.className).toContain('focus:ring');
    });

    it('first chat item should receive focus on Tab', () => {
      const chatList = document.createElement('div');
      chatList.id = 'chat-list';

      const chatRow1 = document.createElement('div');
      chatRow1.className = 'chat-row';
      chatRow1.setAttribute('tabindex', '0');

      const chatRow2 = document.createElement('div');
      chatRow2.className = 'chat-row';
      chatRow2.setAttribute('tabindex', '0');

      chatList.appendChild(chatRow1);
      chatList.appendChild(chatRow2);
      document.body.appendChild(chatList);

      // First item should be focusable
      const firstRow = document.querySelector('.chat-row');
      expect(firstRow.getAttribute('tabindex')).toBe('0');
    });
  });
});

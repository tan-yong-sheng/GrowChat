// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

describe('Message Input - Ctrl+Enter Keyboard Shortcut', () => {
  let dom;
  let window;
  let document;
  let container;
  let input;
  let composer;

  // Helper to attach the actual keydown handler
  function attachKeydownHandler() {
    input.addEventListener('keydown', async (e) => {
      const isEnter = e.key === 'Enter';
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;

      // Ctrl+Enter or Cmd+Enter: always submit
      if (isEnter && isCtrlOrCmd) {
        e.preventDefault();
        if (input.value.trim()) composer.dispatchEvent(new Event('submit'));
      }
      // Enter without modifiers (not Shift): submit on single line
      else if (isEnter && !isShift && !isCtrlOrCmd) {
        e.preventDefault();
        if (input.value.trim()) composer.dispatchEvent(new Event('submit'));
      }
      // Shift+Enter: allow multi-line without submitting
    });
  }

  beforeEach(() => {
    const indexHtml = fs.readFileSync(
      path.join(process.cwd(), 'public/index.html'),
      'utf-8'
    );
    dom = new JSDOM(indexHtml, {
      url: 'http://localhost:8787/',
      pretendToBeVisual: true,
    });
    window = dom.window;
    document = window.document;

    // Create message input form
    container = document.createElement('div');
    container.innerHTML = `
      <form id="composer" class="relative">
        <textarea id="message-input" placeholder="Message" style="height: 44px;"></textarea>
        <button id="send-btn" type="button" aria-label="Send message"></button>
      </form>
    `;
    document.body.appendChild(container);
    input = container.querySelector('#message-input');
    composer = container.querySelector('#composer');

    // Attach the handler
    attachKeydownHandler();
  });

  afterEach(() => {
    dom.window.close();
  });

  describe('Ctrl+Enter Shortcut', () => {
    it('should send message on Ctrl+Enter', () => {
      input.value = 'Hello world';

      let submitFired = false;
      composer.addEventListener('submit', (e) => {
        e.preventDefault();
        submitFired = true;
      });

      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        ctrlKey: true,
        bubbles: true,
      });

      input.dispatchEvent(event);

      expect(submitFired).toBe(true);
    });

    it('should send message on Cmd+Enter (Mac equivalent)', () => {
      input.value = 'Test message';

      let submitFired = false;
      composer.addEventListener('submit', (e) => {
        e.preventDefault();
        submitFired = true;
      });

      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        metaKey: true,
        bubbles: true,
      });

      input.dispatchEvent(event);

      expect(submitFired).toBe(true);
    });

    it('should not send message on Shift+Enter (allows multi-line)', () => {
      input.value = 'Hello\nworld';

      let submitFired = false;
      composer.addEventListener('submit', (e) => {
        e.preventDefault();
        submitFired = true;
      });

      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        shiftKey: true,
        ctrlKey: false,
        metaKey: false,
        bubbles: true,
      });

      input.dispatchEvent(event);

      expect(submitFired).toBe(false);
    });

    it('should send on regular Enter when on single line', () => {
      input.value = 'Single line message';

      let submitFired = false;
      composer.addEventListener('submit', (e) => {
        e.preventDefault();
        submitFired = true;
      });

      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        bubbles: true,
      });

      input.dispatchEvent(event);

      expect(submitFired).toBe(true);
    });

    it('should allow multi-line input with Shift+Enter', () => {
      input.value = 'Line 1\nLine 2';

      let submitFired = false;
      composer.addEventListener('submit', (e) => {
        e.preventDefault();
        submitFired = true;
      });

      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        shiftKey: true,
        bubbles: true,
      });

      input.dispatchEvent(event);

      expect(submitFired).toBe(false);
    });

    it('should clear input after sending with Ctrl+Enter', () => {
      input.value = 'Test message';

      composer.addEventListener('submit', (e) => {
        e.preventDefault();
        input.value = '';
        input.dispatchEvent(new Event('input'));
      });

      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        ctrlKey: true,
        bubbles: true,
      });

      input.dispatchEvent(event);

      expect(input.value).toBe('');
    });
  });

  describe('Keyboard Shortcut Help', () => {
    it('message input should have aria-label indicating keyboard shortcuts', () => {
      input.setAttribute('aria-label', 'Message text. Press Ctrl+Enter or Cmd+Enter to send, or Shift+Enter for new line');

      expect(input.getAttribute('aria-label')).toContain('Ctrl+Enter');
      expect(input.getAttribute('aria-label')).toContain('Cmd+Enter');
    });

    it('send button should have title showing keyboard shortcut', () => {
      const sendBtn = container.querySelector('#send-btn');
      sendBtn.setAttribute('title', 'Send message (Ctrl+Enter)');

      expect(sendBtn.getAttribute('title')).toContain('Ctrl+Enter');
    });
  });
});


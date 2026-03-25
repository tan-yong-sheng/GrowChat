// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { setupEditTextarea } from '../../public/js/features/chat/edit-textarea.js';

describe('setupEditTextarea', () => {
  it('keeps the textarea height stable after the initial sizing pass', () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'Hello';
    const focus = vi.fn();
    textarea.focus = focus;
    Object.defineProperty(textarea, 'scrollHeight', {
      configurable: true,
      value: 180,
    });

    setupEditTextarea(textarea, { maxHeight: 240 });

    expect(textarea.style.height).toBe('180px');
    expect(textarea.style.overflowY).toBe('auto');
    expect(textarea.style.maxHeight).toBe('240px');
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });

    textarea.style.height = '180px';
    textarea.value = 'Hello world\nmore text\nmore text';
    Object.defineProperty(textarea, 'scrollHeight', {
      configurable: true,
      value: 260,
    });
    textarea.dispatchEvent(new Event('input'));

    expect(textarea.style.height).toBe('180px');
  });

  it('caps the height and preserves the caret at the end', () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'A long draft';
    const focus = vi.fn();
    textarea.focus = focus;
    textarea.setSelectionRange = vi.fn();
    Object.defineProperty(textarea, 'scrollHeight', {
      configurable: true,
      value: 480,
    });

    setupEditTextarea(textarea, { maxHeight: 240 });

    expect(textarea.style.height).toBe('240px');
    expect(textarea.style.overflowY).toBe('auto');
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(textarea.setSelectionRange).toHaveBeenCalledWith(12, 12);
  });
});

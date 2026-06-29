// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { setModalSaveButtonState } from '../../public/js/features/admin/modal-save-helpers.js';

describe('admin modal save helpers', () => {
  it('toggles the shared save button state', () => {
    const button = document.createElement('button');

    setModalSaveButtonState(button, { enabled: false });
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe('Save');
    expect(button.className).toContain('cursor-not-allowed');

    setModalSaveButtonState(button, { enabled: true });
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe('Save');
    expect(button.className).toContain('bg-primary');
  });

  it('supports compact custom button styles', () => {
    const button = document.createElement('button');

    setModalSaveButtonState(button, {
      enabled: true,
      enabledClass: 'rounded-full px-2.5 py-0.75 text-label-xs font-semibold transition bg-primary text-white hover:bg-gray-900',
      disabledClass: 'rounded-full px-2.5 py-0.75 text-label-xs font-semibold transition bg-gray-200 text-gray-400 cursor-not-allowed',
    });

    expect(button.disabled).toBe(false);
    expect(button.className).toContain('rounded-full');
    expect(button.className).toContain('text-label-xs');
  });
});

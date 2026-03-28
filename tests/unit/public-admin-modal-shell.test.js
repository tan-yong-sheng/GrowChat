// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { buildAdminModalShellMarkup, createAdminModalShell, getAdminModalPreset } from '../../public/js/features/admin/modal-shell.js';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('admin modal shell', () => {
  it('exposes named presets for common admin modal layouts', () => {
    expect(getAdminModalPreset('compact').shellClass).toContain('relative z-10');
    expect(getAdminModalPreset('compact').shellClass).toContain('max-w-lg');
    expect(getAdminModalPreset('userEditor').overlayClass).toContain('bg-black/80');
    expect(getAdminModalPreset('userEditor').shellClass).toContain('relative z-10');
    expect(getAdminModalPreset('access').shellClass).toContain('relative z-10');
    expect(getAdminModalPreset('access').widthClass).toBe('max-w-3xl');
    expect(getAdminModalPreset('roleEditor').shellClass).toContain('relative z-10');
    expect(getAdminModalPreset('roleEditor').shellClass).toContain('max-w-5xl');
    expect(getAdminModalPreset('groupEditor').shellClass).toContain('relative z-10');
    expect(getAdminModalPreset('groupEditor').shellClass).toContain('max-w-6xl');

    const markup = buildAdminModalShellMarkup({
      preset: 'compact',
      title: 'Preset Check',
      body: '<div>Body</div>',
      footer: '<button>Save</button>',
    });

    expect(markup).toContain('max-w-lg');
    expect(markup).not.toContain('max-w-3xl');
  });

  it('renders shared chrome and closes from the backdrop or close button', () => {
    const { modal, close, bodyEl, footerEl } = createAdminModalShell({
      title: 'Connection Access',
      subtitle: 'Shared shell',
      body: '<div id="shell-body">Body</div>',
      footer: '<button type="button">Save</button>',
      closeAttr: 'data-test-close',
    });

    expect(modal).not.toBeNull();
    expect(document.body.contains(modal)).toBe(true);
    expect(bodyEl?.querySelector('#shell-body')).not.toBeNull();
    expect(footerEl?.textContent).toContain('Save');
    expect(modal.textContent).toContain('Connection Access');
    expect(modal.textContent).toContain('Shared shell');

    modal.querySelector('[data-test-close]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.body.contains(modal)).toBe(false);

    close();
  });
});

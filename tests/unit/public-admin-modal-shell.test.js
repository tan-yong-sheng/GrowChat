// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildAdminModalShellMarkup,
  createAdminModalShell,
  getAdminModalPreset,
  Z_INDEX_CLASSES,
} from '../../public/js/features/admin/modal-shell.js';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Z_INDEX_CLASSES static mapping', () => {
  it('maps all known preset z-index values to Tailwind class names', () => {
    expect(Z_INDEX_CLASSES[140]).toBe('z-[140]');
    expect(Z_INDEX_CLASSES[150]).toBe('z-[150]');
    expect(Z_INDEX_CLASSES[250]).toBe('z-[250]');
  });

  it('covers every distinct zIndex used in admin modal presets', () => {
    const presetNames = [
      'standard',
      'compact',
      'userEditor',
      'access',
      'aclEditor',
      'wide',
      'roleEditor',
      'groupEditor',
    ];
    const zIndexValues = new Set(presetNames.map((name) => getAdminModalPreset(name).zIndex));
    for (const z of zIndexValues) {
      expect(Z_INDEX_CLASSES[z]).toBeDefined();
    }
  });

  it('emits correct z-index class in modal markup for each preset', () => {
    const presetZIndices = { compact: 140, standard: 150, aclEditor: 250 };
    for (const [preset, expectedZ] of Object.entries(presetZIndices)) {
      const markup = buildAdminModalShellMarkup({
        preset,
        title: 'Z-Index Test',
        body: '<div>Body</div>',
      });
      expect(markup).toContain(`z-[${expectedZ}]`);
    }
  });

  it('throws when an unmapped z-index value is used', () => {
    expect(() =>
      buildAdminModalShellMarkup({
        preset: 'standard',
        zIndex: 999,
        title: 'Unmapped Z',
        body: '<div>Body</div>',
      })
    ).toThrow(/Unsupported admin modal z-index: 999/);
  });
});

describe('admin modal shell', () => {
  it('exposes named presets for common admin modal layouts', () => {
    expect(getAdminModalPreset('standard').outerClass).toContain('items-start');
    expect(getAdminModalPreset('standard').outerClass).toContain('overflow-y-auto');
    expect(getAdminModalPreset('compact').shellClass).toContain('relative z-10');
    expect(getAdminModalPreset('compact').shellClass).toContain('max-w-lg');
    expect(getAdminModalPreset('compact').outerClass).toContain('items-start');
    expect(getAdminModalPreset('userEditor').overlayClass).toContain('backdrop-blur-sm');
    expect(getAdminModalPreset('userEditor').outerClass).toContain('overflow-y-auto');
    expect(getAdminModalPreset('userEditor').shellClass).toContain('relative z-10');
    expect(getAdminModalPreset('access').shellClass).toContain('relative z-10');
    expect(getAdminModalPreset('access').widthClass).toBe('max-w-3xl');
    expect(getAdminModalPreset('access').outerClass).toContain('items-start');
    expect(getAdminModalPreset('aclEditor').shellClass).toContain('max-w-4xl');
    expect(getAdminModalPreset('aclEditor').outerClass).toContain('items-start');
    expect(getAdminModalPreset('aclEditor').zIndex).toBe(250);
    expect(getAdminModalPreset('roleEditor').shellClass).toContain('relative z-10');
    expect(getAdminModalPreset('roleEditor').shellClass).toContain('max-w-5xl');
    expect(getAdminModalPreset('roleEditor').outerClass).toContain('items-start');
    expect(getAdminModalPreset('groupEditor').shellClass).toContain('relative z-10');
    expect(getAdminModalPreset('groupEditor').shellClass).toContain('max-w-6xl');
    expect(getAdminModalPreset('groupEditor').outerClass).toContain('overflow-y-auto');

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

    modal
      .querySelector('[data-test-close]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.body.contains(modal)).toBe(false);

    close();
  });

  it('invokes the onClose callback when the modal is dismissed', () => {
    const onClose = vi.fn();
    const { modal } = createAdminModalShell({
      title: 'Connection Access',
      body: '<div>Body</div>',
      closeAttr: 'data-test-close',
      onClose,
    });

    modal
      .querySelector('[data-test-close]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.body.contains(modal)).toBe(false);
  });
});

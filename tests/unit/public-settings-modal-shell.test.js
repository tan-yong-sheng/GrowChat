// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  buildSettingsModalShellMarkup,
  createSettingsModalShell,
} from '../../public/js/shared/components/settings-modal-shell.js';

describe('settings modal shell', () => {
  it('renders the shared admin-style modal shell markup', () => {
    const html = buildSettingsModalShellMarkup({
      rootId: 'settings-modal-root',
      title: 'Edit Connection',
      subtitle: 'Personal resource',
      body: '<form>body</form>',
      footer: '<div>footer</div>',
    });

    expect(html).toContain('id="settings-modal-root"');
    expect(html).toContain('data-settings-modal-header');
    expect(html).toContain('data-settings-modal-body');
    expect(html).toContain('data-settings-modal-footer');
    expect(html).toContain('text-lg font-semibold');
    expect(html).toContain('max-h-[90vh]');
    expect(html).toContain('rounded-lg');
    expect(html).toContain('backdrop-blur-sm');
  });

  it('creates a modal shell and exposes sections', () => {
    document.body.innerHTML = '';

    const { modal, closeBtn, bodyEl, footerEl } = createSettingsModalShell({
      rootId: 'settings-modal-root',
      title: 'Edit Connection',
      body: '<div data-body>body</div>',
      footer: '<div data-footer>footer</div>',
    });

    expect(modal.id).toBe('settings-modal-root');
    expect(closeBtn).not.toBeNull();
    expect(bodyEl?.querySelector('[data-body]')).not.toBeNull();
    expect(footerEl?.querySelector('[data-footer]')).not.toBeNull();
    expect(modal.querySelector('[class*="max-h-[90vh]"]')).not.toBeNull();
  });
});

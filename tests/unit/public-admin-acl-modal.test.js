// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createAdminAclModalShell } from '../../public/js/features/admin/acl-modal.js';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('admin acl modal shell', () => {
  it('renders the shared acl modal chrome with stable ids', () => {
    const { modal, close, elements, ids } = createAdminAclModalShell({
      idsPrefix: 'connection-acl',
      title: 'Connection Access',
      subtitle: 'Shared ACL modal',
      closeAttr: 'data-test-close',
    });

    expect(document.body.contains(modal)).toBe(true);
    expect(ids.summaryId).toBe('connection-acl-summary');
    expect(elements.summaryEl?.id).toBe('connection-acl-summary');
    expect(elements.countEl?.id).toBe('connection-acl-count');
    expect(elements.reasonEl?.id).toBe('connection-acl-reason');
    expect(elements.errorEl?.id).toBe('connection-acl-error');
    expect(elements.listEl?.id).toBe('connection-acl-list');
    expect(elements.saveErrorEl?.id).toBe('connection-acl-save-error');
    expect(elements.saveButton?.id).toBe('connection-acl-save-btn');
    expect(modal.className).toContain('items-start');
    expect(modal.querySelector('div.relative.z-10')?.className).toContain('max-w-4xl');
    expect(modal.querySelector('[data-admin-modal-body]')?.className).toContain('overflow-y-auto');
    expect(modal.textContent).toContain('Connection Access');
    expect(modal.textContent).toContain('Shared ACL modal');
    expect(modal.querySelector('[data-test-close]')).toBeTruthy();

    close();
    expect(document.body.contains(modal)).toBe(false);
  });
});

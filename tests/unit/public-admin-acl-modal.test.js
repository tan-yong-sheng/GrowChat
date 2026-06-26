// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminAclModalShell } from '../../public/js/features/admin/acl-modal.js';
import { renderAclGroupList } from '../../public/js/features/admin/settings/acl-modal-shared.js';

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

describe('renderAclGroupList change handler', () => {
  let listEl;
  let state;

  beforeEach(() => {
    document.body.innerHTML = '<div id="list"></div>';
    listEl = document.getElementById('list');
    state = {
      loading: false,
      error: null,
      groups: [
        { id: 'g1', name: 'Team Alpha', description: 'Engineering', is_system: false },
        { id: 'g2', name: 'Team Beta', description: 'Design', is_system: false },
      ],
      rulesByGroup: new Map(),
    };
  });

  it('invokes onChange when a rule effect is toggled, so the summary re-renders', () => {
    const onChange = vi.fn();
    renderAclGroupList({ listEl, state, effectClass: 'acl-effect', onChange });

    const select = listEl.querySelector('select[data-group-id="g1"]');
    expect(select).toBeTruthy();

    // Simulate the user changing the dropdown from "No access" to "Allow".
    select.value = 'allow';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(state.rulesByGroup.get('g1')).toBe('allow');
    expect(onChange).toHaveBeenCalledTimes(1);

    // Toggling back to "none" deletes the rule.
    select.value = 'none';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(state.rulesByGroup.has('g1')).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('does not throw when onChange is omitted (backwards compatible)', () => {
    renderAclGroupList({ listEl, state, effectClass: 'acl-effect' });
    const select = listEl.querySelector('select[data-group-id="g2"]');
    expect(() => {
      select.value = 'deny';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }).not.toThrow();
    expect(state.rulesByGroup.get('g2')).toBe('deny');
  });
});

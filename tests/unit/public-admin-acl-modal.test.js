// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminAclModalShell } from '../../public/js/features/admin/acl-modal.js';
import { renderAclGroupList } from '../../public/js/features/admin/settings/acl-modal-shared.js';

const modelsModalMocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  broadcastModelsInvalidation: vi.fn(),
}));

vi.mock('../../public/js/shared/api.js', () => ({
  apiFetch: (...args) => modelsModalMocks.apiFetch(...args),
}));

vi.mock('../../public/js/shared/utils/model-sync.js', () => ({
  broadcastModelsInvalidation: (...args) => modelsModalMocks.broadcastModelsInvalidation(...args),
}));

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
    expect(elements.summaryEl.id).toBe('connection-acl-summary');
    expect(elements.countEl.id).toBe('connection-acl-count');
    expect(elements.reasonEl.id).toBe('connection-acl-reason');
    expect(elements.errorEl.id).toBe('connection-acl-error');
    expect(elements.listEl.id).toBe('connection-acl-list');
    expect(elements.saveErrorEl.id).toBe('connection-acl-save-error');
    expect(elements.saveButton.id).toBe('connection-acl-save-btn');
    expect(modal.className).toContain('items-start');
    expect(modal.querySelector('div.relative.z-10').className).toContain('max-w-4xl');
    expect(modal.querySelector('[data-admin-modal-body]').className).toContain('overflow-y-auto');
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

describe('openModelAccessModal regression: live summary updates on toggle (#models-access-modal-onchange)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    modelsModalMocks.apiFetch.mockReset();
    modelsModalMocks.broadcastModelsInvalidation.mockReset();
    modelsModalMocks.apiFetch.mockImplementation(async (url) => {
      const target = String(url);
      if (target.includes('/api/admin/models/gpt-4/access')) {
        return new Response(
          JSON.stringify({
            groups: [
              { id: 'g1', name: 'Engineering', description: 'Eng team', is_system: false },
              { id: 'g2', name: 'Design', description: 'Design team', is_system: false },
            ],
            rules: [],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('updates the summary text immediately when a rule effect is toggled (no save/reopen required)', async () => {
    const { openModelAccessModal } =
      await import('../../public/js/features/admin/settings/models-access-modal.js');

    await openModelAccessModal({ id: 'gpt-4', name: 'GPT-4' });

    // Wait for the async load to populate the list with real selects.
    await vi.waitFor(() => {
      const list = document.getElementById('model-acl-list');
      expect(list?.querySelector('.animate-pulse')).toBeNull();
      expect(list?.querySelector('select[data-group-id="g1"]')).toBeTruthy();
    });

    const summaryEl = document.getElementById('model-acl-summary');
    const reasonEl = document.getElementById('model-acl-reason');
    const countEl = document.getElementById('model-acl-count');
    expect(summaryEl).toBeTruthy();

    // Initial state: no rules → "No access rules".
    expect(summaryEl.textContent).toBe('No access rules');
    expect(countEl.textContent).toBe('2 groups');
    expect(reasonEl.textContent).toContain('No explicit rules');

    // Toggle g1 from "none" to "allow" — the summary must update live
    // (this is the regression: previously the summary stayed stale until
    // the user saved or reopened the modal).
    const select = document
      .getElementById('model-acl-list')
      .querySelector('select[data-group-id="g1"]');
    expect(select).toBeTruthy();
    select.value = 'allow';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(summaryEl.textContent).toBe('1 allow');
    expect(reasonEl.textContent).toContain('shared with selected groups');

    // Toggle a second group to "deny" — summary must update to "1 allow, 1 deny".
    const select2 = document
      .getElementById('model-acl-list')
      .querySelector('select[data-group-id="g2"]');
    expect(select2).toBeTruthy();
    select2.value = 'deny';
    select2.dispatchEvent(new Event('change', { bubbles: true }));

    expect(summaryEl.textContent).toBe('1 allow, 1 deny');
    expect(reasonEl.textContent).toContain('Deny rules override allow rules');

    // Toggling back to "none" removes the rule and the summary must follow.
    select.value = 'none';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(summaryEl.textContent).toBe('1 deny');
    expect(reasonEl.textContent).toContain('explicitly blocked');
  });
});

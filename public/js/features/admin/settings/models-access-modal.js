/**
 * Model ACL access modal for the models settings view.
 */

import { apiFetch } from '../../../shared/api.js';
import { getAdminAclAccessPath } from '../../../shared/admin-acl.js';
import { createAdminAclModalShell } from '../acl-modal.js';
import { broadcastModelsInvalidation } from '../../../shared/utils/model-sync.js';
import {
  cloneAclRules,
  getAclRulesSignature,
  updateSaveButton,
  bindAclModalBodyRender,
} from './acl-modal-shared.js';

export async function openModelAccessModal(model, { onApply } = {}) {
  if (!model?.id) return;
  const { modal, close } = createAdminAclModalShell({
    idsPrefix: 'model-acl',
    title: 'Model Access',
    subtitle: model.name || model.id,
    closeAttr: 'data-close-model-access',
  });

  const listEl = modal.querySelector('#model-acl-list');
  const errorEl = modal.querySelector('#model-acl-error');
  const saveErrorEl = modal.querySelector('#model-acl-save-error');
  const summaryEl = modal.querySelector('#model-acl-summary');
  const countEl = modal.querySelector('#model-acl-count');
  const reasonEl = modal.querySelector('#model-acl-reason');
  const saveBtn = modal.querySelector('#model-acl-save-btn');
  let baseRules = [];

  const state = {
    loading: true,
    saving: false,
    error: null,
    groups: [],
    rulesByGroup: new Map(),
  };

  // Single source of truth for the modal's body render. Called on load and
  // again whenever a rule effect changes so the summary/count text stays
  // in sync with rulesByGroup (otherwise toggling a rule leaves the
  // visible summary stale until save or modal reopen).
  const renderAll = bindAclModalBodyRender({
    state,
    summaryEl,
    countEl,
    reasonEl,
    listEl,
    errorEl,
    effectClass: 'model-acl-effect',
    resourceLabel: 'model',
  });

  const loadAccess = async () => {
    state.loading = true;
    state.error = null;
    renderAll();
    try {
      const res = await apiFetch(getAdminAclAccessPath('models', { resourceId: model.id }));
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || 'Failed to load model access');
      }
      const payload = await res.json();
      state.groups = Array.isArray(payload.groups) ? payload.groups : [];
      baseRules = cloneAclRules(payload.rules || []);
      state.rulesByGroup = new Map(
        (Array.isArray(payload.rules) ? payload.rules : [])
          .filter((rule) => String(rule?.principal_type || '').toLowerCase() === 'group')
          .map((rule) => [
            String(rule.principal_id || '').trim(),
            String(rule.effect || 'allow')
              .trim()
              .toLowerCase() === 'deny'
              ? 'deny'
              : 'allow',
          ])
          .filter(([groupId]) => Boolean(groupId))
      );
    } catch (err) {
      state.error = err.message || 'Failed to load model access';
    } finally {
      state.loading = false;
      renderAll();
    }
  };

  saveBtn?.addEventListener('click', async () => {
    if (state.saving) return;
    if (saveErrorEl) saveErrorEl.textContent = '';
    state.saving = true;
    updateSaveButton(saveBtn, state);
    try {
      const rules = Array.from(state.rulesByGroup.entries()).map(([groupId, effect]) => ({
        principal_type: 'group',
        principal_id: groupId,
        effect,
        action: 'use',
      }));
      const sameAsBase = getAclRulesSignature(rules) === getAclRulesSignature(baseRules);
      if (!sameAsBase && typeof onApply === 'function') {
        await onApply(cloneAclRules(rules), model);
      } else if (sameAsBase) {
        broadcastModelsInvalidation();
      }
      close();
    } catch (err) {
      if (saveErrorEl) saveErrorEl.textContent = err.message || 'Failed to save model access';
    } finally {
      state.saving = false;
      updateSaveButton(saveBtn, state);
    }
  });

  updateSaveButton(saveBtn, state);
  renderAll();
  loadAccess();
  document.body.appendChild(modal);
}

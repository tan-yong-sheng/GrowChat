/**
 * Model ACL access modal for the models settings view.
 */

import { apiFetch } from '../../../shared/api.js';
import { getAdminAclAccessPath } from '../../../shared/admin-acl.js';
import { createAdminAclModalShell } from '../acl-modal.js';
import { broadcastModelsInvalidation } from '../../../shared/utils/model-sync.js';
import {
  bindAclModalBodyRender,
  buildAclSaveRules,
  buildRulesByGroup,
  cloneAclRules,
  createAclModalState,
  getAclRulesSignature,
  loadAdminAclModalAccess,
  queryAclModalElements,
  updateSaveButton,
  wrapAclSaveHandler,
} from './acl-modal-shared.js';

export async function openModelAccessModal(model, { onApply } = {}) {
  if (!model?.id) return;
  const { modal, close } = createAdminAclModalShell({
    idsPrefix: 'model-acl',
    title: 'Model Access',
    subtitle: model.name || model.id,
    closeAttr: 'data-close-model-access',
  });

  const { listEl, errorEl, saveErrorEl, summaryEl, countEl, reasonEl, saveBtn } =
    queryAclModalElements(modal, 'model-acl');
  let baseRules = [];

  const state = createAclModalState();

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
    const result = await loadAdminAclModalAccess({
      fetchAccess: async () => {
        const res = await apiFetch(getAdminAclAccessPath('models', { resourceId: model.id }));
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || err.message || 'Failed to load model access');
        }
        return res.json();
      },
      state,
      renderAll,
    });
    baseRules = cloneAclRules(result.rules || []);
    state.rulesByGroup = buildRulesByGroup(baseRules);
  };

  saveBtn?.addEventListener(
    'click',
    wrapAclSaveHandler({
      state,
      saveBtn,
      saveErrorEl,
      saveErrorMsg: 'Failed to save model access',
      onExecute: async ({ rules }) => {
        const sameAsBase = getAclRulesSignature(rules) === getAclRulesSignature(baseRules);
        if (!sameAsBase && typeof onApply === 'function') {
          await onApply(cloneAclRules(rules), model);
        } else if (sameAsBase) {
          broadcastModelsInvalidation();
        }
        close();
      },
    })
  );

  updateSaveButton(saveBtn, state);
  renderAll();
  loadAccess();
  document.body.appendChild(modal);
}

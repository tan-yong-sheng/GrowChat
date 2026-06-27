/**
 * Tool server ACL access modal for the integrations settings view.
 */

import { fetchAdminToolServerAccess } from '../../../shared/admin-access.js';
import { createAdminAclModalShell } from '../acl-modal.js';
import { broadcastToolServersInvalidation } from '../../../shared/utils/tool-server-sync.js';
import {
  cloneAclRules,
  getAclRulesSignature,
  updateSaveButton,
  bindAclModalBodyRender,
} from './acl-modal-shared.js';

export async function openToolServerAccessModal(server, { onApply } = {}) {
  const { modal, close } = createAdminAclModalShell({
    idsPrefix: 'tool-server-acl',
    title: 'MCP Server Access',
    subtitle: server.name || server.id,
    closeAttr: 'data-close-tool-server-access',
  });

  const listEl = modal.querySelector('#tool-server-acl-list');
  const errorEl = modal.querySelector('#tool-server-acl-error');
  const saveErrorEl = modal.querySelector('#tool-server-acl-save-error');
  const summaryEl = modal.querySelector('#tool-server-acl-summary');
  const countEl = modal.querySelector('#tool-server-acl-count');
  const reasonEl = modal.querySelector('#tool-server-acl-reason');
  const saveBtn = modal.querySelector('#tool-server-acl-save-btn');
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
  // in sync with rulesByGroup.
  const renderAll = bindAclModalBodyRender({
    state,
    summaryEl,
    countEl,
    reasonEl,
    listEl,
    errorEl,
    effectClass: 'tool-server-acl-effect',
    resourceLabel: 'MCP server',
  });

  const loadAccess = async () => {
    state.loading = true;
    state.error = null;
    renderAll();
    try {
      const payload = await fetchAdminToolServerAccess(server.id);
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
      state.error = err?.message || 'Failed to load MCP server access';
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
      if (sameAsBase) {
        broadcastToolServersInvalidation();
        close();
        return;
      }
      if (typeof onApply === 'function') {
        await onApply(cloneAclRules(rules), server);
      }
      close();
    } catch (err) {
      if (saveErrorEl) saveErrorEl.textContent = err.message || 'Failed to save MCP server access';
    } finally {
      state.saving = false;
      updateSaveButton(saveBtn, state);
    }
  });

  document.body.appendChild(modal);
  renderAll();
  updateSaveButton(saveBtn, state);
  await loadAccess();
}

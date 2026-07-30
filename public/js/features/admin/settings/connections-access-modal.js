/**
 * Connection ACL access modal for the connections settings view.
 *
 * Handles loading/saving group access rules per connection.
 *
 * + cloneAclRules + buildRulesByGroup) duplicates integrations-access-modal.js but
 * the onExecute callback is fundamentally different (full API connection save vs
 * simple close), making extraction into a shared wrapper overkill.
 */

import { apiFetch } from '../../../shared/api.js';
import { fetchAdminConnectionAccess } from '../../../shared/admin-access.js';
import { broadcastConnectionsInvalidation } from '../../../shared/utils/connection-sync.js';
import { createAdminAclModalShell } from '../acl-modal.js';
import { normalizeConnectionManualModels } from './connections-helpers.js';
import {
  bindAclModalBodyRender,
  buildRulesByGroup,
  cloneAclRules,
  createAclModalState,
  getAclRulesSignature,
  loadAdminAclModalAccess,
  queryAclModalElements,
  updateSaveButton,
  wrapAclSaveHandler,
} from './acl-modal-shared.js';

export async function openConnectionAccessModal(connection, { connectionsState, _onApply } = {}) {
  if (!connection?.id) return;

  const { modal, close } = createAdminAclModalShell({
    idsPrefix: 'connection-acl',
    title: 'Connection Access',
    subtitle: connection.name || connection.id,
    closeAttr: 'data-close-connection-access',
  });

  const { listEl, errorEl, saveErrorEl, summaryEl, countEl, reasonEl, saveBtn } =
    queryAclModalElements(modal, 'connection-acl');

  let baseRules = [];
  const state = createAclModalState();

  const renderAll = bindAclModalBodyRender({
    state,
    summaryEl,
    countEl,
    reasonEl,
    listEl,
    errorEl,
    effectClass: 'connection-acl-effect',
    resourceLabel: 'connection',
  });

  const loadAccess = async () => {
    const result = await loadAdminAclModalAccess({
      fetchAccess: () => fetchAdminConnectionAccess(connection.id),
      state,
      renderAll,
    });
    baseRules = cloneAclRules(result.rules || []);
    state.rulesByGroup = buildRulesByGroup(baseRules);
  };

  function buildConnectionAccessSavePayload(rules) {
    const sameAsBase = getAclRulesSignature(rules) === getAclRulesSignature(baseRules);
    return {
      enabled: connectionsState.openai.enabled,
      connections: connectionsState.openai.connections
        .filter((c) => !c.readOnly)
        .map((conn) => ({
          ...conn,
          manualModels: normalizeConnectionManualModels(conn.manualModels),
        })),
      model_updates: [],
      access_updates: sameAsBase
        ? []
        : [{ connection_id: connection.id, rules: cloneAclRules(rules) }],
    };
  }

  saveBtn?.addEventListener(
    'click',
    wrapAclSaveHandler({
      state,
      saveBtn,
      saveErrorEl,
      saveErrorMsg: 'Failed to save connection access',
      onExecute: async ({ rules }) => {
        const payload = buildConnectionAccessSavePayload(rules);
        const res = await apiFetch('/api/admin/openai/connections', {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || err.message || 'Failed to save connection access');
        }
        broadcastConnectionsInvalidation();
        close();
      },
    })
  );

  updateSaveButton(saveBtn, state);
  renderAll();
  loadAccess();
  document.body.appendChild(modal);
}

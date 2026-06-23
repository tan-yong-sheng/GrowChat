/**
 * Connection ACL access modal for the connections settings view.
 *
 * Handles loading/saving group access rules per connection.
 */

import { apiFetch } from '../../../shared/api.js';
import { fetchAdminConnectionAccess } from '../../../shared/admin-access.js';
import { broadcastConnectionsInvalidation } from '../../../shared/utils/connection-sync.js';
import { createAdminAclModalShell } from '../acl-modal.js';
import { normalizeConnectionManualModels } from './connections-helpers.js';
import {
  cloneAclRules,
  getAclRulesSignature,
  renderSummary,
  updateSaveButton,
  renderAclGroupList,
} from './acl-modal-shared.js';

export async function openConnectionAccessModal(connection, { connectionsState, _onApply } = {}) {
  if (!connection?.id) return;

  const { modal, close } = createAdminAclModalShell({
    idsPrefix: 'connection-acl',
    title: 'Connection Access',
    subtitle: connection.name || connection.id,
    closeAttr: 'data-close-connection-access',
  });

  const listEl = modal.querySelector('#connection-acl-list');
  const errorEl = modal.querySelector('#connection-acl-error');
  const saveErrorEl = modal.querySelector('#connection-acl-save-error');
  const summaryEl = modal.querySelector('#connection-acl-summary');
  const countEl = modal.querySelector('#connection-acl-count');
  const reasonEl = modal.querySelector('#connection-acl-reason');
  const saveBtn = modal.querySelector('#connection-acl-save-btn');

  let baseRules = [];
  const state = {
    loading: true,
    saving: false,
    error: null,
    groups: [],
    rulesByGroup: new Map(),
  };

  const loadAccess = async () => {
    state.loading = true;
    state.error = null;
    renderAclGroupList({ listEl, errorEl, state, effectClass: 'connection-acl-effect' });
    try {
      const payload = await fetchAdminConnectionAccess(connection.id);
      state.groups = Array.isArray(payload.groups) ? payload.groups : [];
      baseRules = cloneAclRules(payload.rules || []);
      state.rulesByGroup = new Map(
        (Array.isArray(baseRules) ? baseRules : [])
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
      state.error = err.message || 'Failed to load connection access';
    } finally {
      state.loading = false;
      renderSummary({ state, summaryEl, countEl, reasonEl, resourceLabel: 'connection' });
      renderAclGroupList({ listEl, errorEl, state, effectClass: 'connection-acl-effect' });
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
      const res = await apiFetch('/api/admin/openai/connections', {
        method: 'PUT',
        body: JSON.stringify({
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
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || 'Failed to save connection access');
      }
      broadcastConnectionsInvalidation();
      close();
    } catch (err) {
      if (saveErrorEl) saveErrorEl.textContent = err.message || 'Failed to save connection access';
    } finally {
      state.saving = false;
      updateSaveButton(saveBtn, state);
    }
  });

  updateSaveButton(saveBtn, state);
  renderSummary({ state, summaryEl, countEl, reasonEl, resourceLabel: 'connection' });
  renderAclGroupList({ listEl, errorEl, state, effectClass: 'connection-acl-effect' });
  loadAccess();
  document.body.appendChild(modal);
}

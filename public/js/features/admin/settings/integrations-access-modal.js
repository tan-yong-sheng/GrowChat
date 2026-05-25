/**
 * Tool server ACL access modal for the integrations settings view.
 */

import { fetchAdminToolServerAccess } from '../../../shared/admin-access.js';
import { createAdminAclModalShell } from '../acl-modal.js';
import { setModalSaveButtonState } from '../modal-save-helpers.js';
import { escapeHtml } from '../../../shared/utils/dom-escape.js';

function cloneAclRules(rules = [], normalizer = (rule) => rule) {
  if (!Array.isArray(rules)) return [];
  return rules.map((rule) => ({ ...normalizer(rule) }));
}

function getAclRulesSignature(rules = [], normalizer) {
  return cloneAclRules(rules, normalizer)
    .map((rule) => ({
      principal_type: String(rule?.principal_type || '')
        .trim()
        .toLowerCase(),
      principal_id: String(rule?.principal_id || '').trim(),
      effect: String(rule?.effect || '')
        .trim()
        .toLowerCase(),
      action: String(rule?.action || '')
        .trim()
        .toLowerCase(),
    }))
    .sort(
      (a, b) =>
        a.principal_type.localeCompare(b.principal_type) ||
        a.principal_id.localeCompare(b.principal_id) ||
        a.action.localeCompare(b.action) ||
        a.effect.localeCompare(b.effect)
    )
    .map((rule) => `${rule.principal_type}:${rule.principal_id}:${rule.action}:${rule.effect}`)
    .join('|');
}

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

  const renderSummary = () => {
    let reasonText = 'No explicit rules. Admin users can access by default.';
    if (summaryEl) {
      const allowCount = Array.from(state.rulesByGroup.values()).filter(
        (value) => value === 'allow'
      ).length;
      const denyCount = Array.from(state.rulesByGroup.values()).filter(
        (value) => value === 'deny'
      ).length;
      if (!allowCount && !denyCount) {
        summaryEl.textContent = 'No access rules';
        reasonText = 'No explicit rules. Admin users can access by default.';
      } else {
        const parts = [];
        if (allowCount) parts.push(`${allowCount} allow`);
        if (denyCount) parts.push(`${denyCount} deny`);
        summaryEl.textContent = parts.join(', ');
        if (allowCount && denyCount) {
          reasonText =
            'Explicit allow rules share this MCP server with selected groups. Deny rules override allow rules.';
        } else if (denyCount) {
          reasonText = 'This MCP server is explicitly blocked for selected groups.';
        } else {
          reasonText = 'This MCP server is shared with selected groups.';
        }
      }
    }
    if (countEl) {
      countEl.textContent = state.groups.length ? `${state.groups.length} groups` : '';
    }
    if (reasonEl) {
      reasonEl.textContent = reasonText;
    }
  };

  const updateSaveButton = () => {
    if (!saveBtn) return;
    setModalSaveButtonState(saveBtn, {
      enabled: true,
      saving: state.saving,
      label: 'Save',
      enabledClass:
        'px-5 py-2 text-sm font-semibold rounded-full bg-gray-900 text-white hover:bg-gray-800',
      disabledClass:
        'px-5 py-2 text-sm font-semibold rounded-full bg-gray-300 text-gray-500 cursor-not-allowed',
    });
  };

  const renderList = () => {
    if (!listEl) return;
    if (state.loading) {
      listEl.innerHTML = `
          <div class="space-y-2">
            ${Array.from({ length: 5 })
              .map(
                () => `
              <div class="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-3 py-2 animate-pulse">
                <div class="flex flex-col min-w-0 flex-1 space-y-2">
                  <div class="h-3.5 w-40 bg-gray-200 rounded-full"></div>
                  <div class="h-2.5 w-64 bg-gray-100 rounded-full"></div>
                </div>
                <div class="h-4 w-4 bg-gray-100 rounded border border-gray-200"></div>
              </div>
            `
              )
              .join('')}
          </div>
        `;
      return;
    }
    if (errorEl) {
      errorEl.textContent = state.error || '';
      errorEl.classList.toggle('hidden', !state.error);
    }
    if (!state.groups.length) {
      listEl.innerHTML =
        '<div class="text-sm text-gray-500 py-6 text-center">No resource teams available.</div>';
      return;
    }
    listEl.innerHTML = state.groups
      .map((group) => {
        const groupId = group.id;
        const effect = state.rulesByGroup.get(groupId) || 'none';
        const badge = group.is_system
          ? '<span class="text-[10px] font-semibold uppercase tracking-wide text-gray-400">System</span>'
          : '';
        return `
          <div class="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-3 py-2 hover:border-gray-300">
            <div class="flex flex-col min-w-0">
              <div class="flex items-center gap-2">
                <div class="text-sm font-semibold text-gray-900 truncate">${escapeHtml(group.name || group.id)}</div>
                ${badge}
              </div>
              <div class="text-[11px] text-gray-500 truncate">${escapeHtml(group.description || group.id)}</div>
            </div>
            <select class="tool-server-acl-effect rounded-2xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none focus:border-gray-400" data-group-id="${escapeHtml(groupId)}">
              <option value="none" ${effect === 'none' ? 'selected' : ''}>No access</option>
              <option value="allow" ${effect === 'allow' ? 'selected' : ''}>Allow</option>
              <option value="deny" ${effect === 'deny' ? 'selected' : ''}>Deny</option>
            </select>
          </div>
        `;
      })
      .join('');

    listEl.querySelectorAll('.tool-server-acl-effect').forEach((select) => {
      select.addEventListener('change', () => {
        const groupId = select.getAttribute('data-group-id');
        if (!groupId) return;
        const effect = String(select.value || 'none');
        if (effect === 'none') {
          state.rulesByGroup.delete(groupId);
        } else {
          state.rulesByGroup.set(groupId, effect === 'deny' ? 'deny' : 'allow');
        }
        renderSummary();
      });
    });
  };

  const loadAccess = async () => {
    state.loading = true;
    state.error = null;
    renderList();
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
      renderSummary();
      renderList();
    }
  };

  saveBtn?.addEventListener('click', async () => {
    if (state.saving) return;
    if (saveErrorEl) saveErrorEl.textContent = '';
    state.saving = true;
    updateSaveButton();
    try {
      const rules = Array.from(state.rulesByGroup.entries()).map(([groupId, effect]) => ({
        principal_type: 'group',
        principal_id: groupId,
        effect,
        action: 'use',
      }));
      const sameAsBase = getAclRulesSignature(rules) === getAclRulesSignature(baseRules);
      if (typeof onApply === 'function') {
        await onApply(sameAsBase ? null : cloneAclRules(rules), server);
      }
      close();
    } catch (err) {
      if (saveErrorEl) saveErrorEl.textContent = err.message || 'Failed to save MCP server access';
    } finally {
      state.saving = false;
      updateSaveButton();
    }
  });

  document.body.appendChild(modal);
  renderSummary();
  renderList();
  updateSaveButton();
  await loadAccess();
}

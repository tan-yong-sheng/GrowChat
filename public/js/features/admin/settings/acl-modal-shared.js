/**
 * Shared helpers for admin ACL group-access modals (models, connections, integrations).
 * Extracts duplicated pattern code to reduce jscpd clone clusters.
 */

import { setModalSaveButtonState } from '../modal-save-helpers.js';
import { escapeHtml } from '../../../shared/utils/dom-escape.js';

// ---------------------------------------------------------------------------
// ACL rule helpers
// ---------------------------------------------------------------------------

export function cloneAclRules(rules = [], normalizer = (rule) => rule) {
  if (!Array.isArray(rules)) return [];
  const result = [];
  for (const rule of rules) {
    const normalized = normalizer(rule);
    if (normalized != null) result.push({ ...normalized });
  }
  return result;
}

export function getAclRulesSignature(rules = [], normalizer) {
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

// ---------------------------------------------------------------------------
// Shared UI helpers
// ---------------------------------------------------------------------------

function computeRuleSummary(values, resourceLabel) {
  const allowCount = values.filter((v) => v === 'allow').length;
  const denyCount = values.filter((v) => v === 'deny').length;
  if (!allowCount && !denyCount) {
    return {
      summaryText: 'No access rules',
      reasonText: 'No explicit rules. Admin users can access by default.',
    };
  }
  const parts = [];
  if (allowCount) parts.push(`${allowCount} allow`);
  if (denyCount) parts.push(`${denyCount} deny`);
  const summaryText = parts.join(', ');
  let reasonText;
  if (allowCount && denyCount) {
    reasonText = `Explicit allow rules share this ${resourceLabel} with selected groups. Deny rules override allow rules.`;
  } else if (denyCount) {
    reasonText = `This ${resourceLabel} is explicitly blocked for selected groups.`;
  } else {
    reasonText = `This ${resourceLabel} is shared with selected groups.`;
  }
  return { summaryText, reasonText };
}

/**
 * Loading skeleton for integration/tool-server lists.
 * Used by both account-level (account-integrations) and admin-level (integrations-modal-ops).
 */
export function renderLoadingSkeleton() {
  return `
    <div class="space-y-2">
      ${Array.from({ length: 4 })
        .map(
          () => `
        <div class="border-b border-gray-50 last:border-0">
          <div class="py-2.5 flex items-center justify-between pr-2 animate-pulse">
            <div class="flex flex-col min-w-0 flex-1 space-y-2">
              <div class="h-3.5 w-40 bg-gray-200 rounded-full"></div>
              <div class="h-2.5 w-64 bg-gray-100 rounded-full"></div>
              <div class="h-2.5 w-56 bg-gray-100 rounded-full"></div>
            </div>
            <div class="flex items-center gap-3 shrink-0">
              <div class="h-6 w-12 rounded-full bg-gray-100 border border-gray-200"></div>
              <div class="h-6 w-6 rounded-full bg-gray-100 border border-gray-200"></div>
              <div class="h-5 w-9 rounded-full bg-gray-100 border border-gray-200"></div>
            </div>
          </div>
        </div>
      `
        )
        .join('')}
    </div>
  `;
}

export function updateSaveButton(saveBtn, state) {
  if (!saveBtn) return;
  setModalSaveButtonState(saveBtn, {
    enabled: true,
    saving: state.saving,
    label: 'Save',
    enabledClass:
      'px-5 py-2 text-sm font-semibold rounded-full bg-gray-900 text-white hover:bg-primary-hover',
    disabledClass:
      'px-5 py-2 text-sm font-semibold rounded-full bg-gray-300 text-gray-500 cursor-not-allowed',
  });
}

export function renderSummary({ state, summaryEl, countEl, reasonEl, resourceLabel }) {
  const { summaryText, reasonText } = computeRuleSummary(
    Array.from(state.rulesByGroup.values()),
    resourceLabel
  );
  if (summaryEl) summaryEl.textContent = summaryText;
  if (countEl) countEl.textContent = state.groups.length ? `${state.groups.length} groups` : '';
  if (reasonEl) reasonEl.textContent = reasonText;
}

/**
 * Bind a single body-render function for an ACL access modal: re-renders the
 * summary (count, allow/deny text) and the group list together. The group
 * list's change handler is wired to this same function so toggling a rule
 * updates the summary inline (instead of staying stale until save).
 *
 * Returns the bound renderAll function so the caller can invoke it
 * explicitly on initial mount and after async loads.
 */
export function bindAclModalBodyRender({
  state,
  summaryEl,
  countEl,
  reasonEl,
  listEl,
  errorEl,
  effectClass,
  resourceLabel,
}) {
  const renderAll = () => {
    renderSummary({ state, summaryEl, countEl, reasonEl, resourceLabel });
    renderAclGroupList({ listEl, errorEl, state, effectClass, onChange: renderAll });
  };
  return renderAll;
}

export function renderAclGroupList({ listEl, errorEl, state, effectClass, onChange }) {
  if (!listEl) return;
  if (state.loading) {
    listEl.innerHTML = `
        <div class="space-y-2">
          ${Array.from({ length: 5 })
            .map(
              () => `
            <div class="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 animate-pulse">
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
    listEl.innerHTML = `<div class="text-sm text-gray-500 py-6 text-center">No resource teams available.</div>`;
    return;
  }
  listEl.innerHTML = state.groups
    .map((group) => {
      const groupId = group.id;
      const effect = state.rulesByGroup.get(groupId) || 'none';
      const badge = group.is_system
        ? '<span class="text-label-sm font-semibold uppercase tracking-wide text-gray-400">System</span>'
        : '';
      return `
        <div class="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 hover:border-gray-300">
          <div class="flex flex-col min-w-0">
            <div class="flex items-center gap-2">
              <div class="text-sm font-semibold text-gray-900 truncate">${escapeHtml(group.name || group.id)}</div>
              ${badge}
            </div>
            <div class="text-label-sm text-gray-500 truncate">${escapeHtml(group.description || group.id)}</div>
          </div>
          <select class="${effectClass} rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none focus:border-gray-400" data-group-id="${escapeHtml(groupId)}">
            <option value="none" ${effect === 'none' ? 'selected' : ''}>No access</option>
            <option value="allow" ${effect === 'allow' ? 'selected' : ''}>Allow</option>
            <option value="deny" ${effect === 'deny' ? 'selected' : ''}>Deny</option>
          </select>
        </div>
      `;
    })
    .join('');

  listEl.querySelectorAll(`.${effectClass}`).forEach((select) => {
    select.addEventListener('change', () => {
      const groupId = select.getAttribute('data-group-id');
      if (!groupId) return;
      const effect = String(select.value || 'none');
      if (effect === 'none') {
        state.rulesByGroup.delete(groupId);
      } else {
        state.rulesByGroup.set(groupId, effect === 'deny' ? 'deny' : 'allow');
      }
      // Notify the caller so it can re-render the summary / counts.
      // Without this, the summary text stays stale until the user saves
      // or reopens the modal.
      if (typeof onChange === 'function') {
        onChange();
      }
    });
  });
}

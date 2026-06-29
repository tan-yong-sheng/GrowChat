/**
 * ACL API + access modal for the policies settings view.
 *
 * Handles loading/saving family access and rendering the
 * per-resource ACL editor modal.
 */

import { apiFetch } from '../../../shared/api.js';
import { getAdminAclAccessPath } from '../../../shared/admin-acl.js';
import { setModalSaveButtonState } from '../modal-save-helpers.js';
import { renderButton } from '../../../shared/components/button.js';
import {
  cloneAclRules,
  normalizeAclRule,
  getResourceNote,
  getResourceLabel,
  getFamilyBulkSummary,
  summarizeSelectedResources,
} from './policies-acl-helpers.js';
import { escapeHtml, createModal, buildAclRows } from './policies-rendering.js';

/**
 * Load ACL access rules for a family of resources.
 */
export async function loadFamilyAccess({ familyKey, resourceIds = [], signal } = {}) {
  const ids = Array.isArray(resourceIds)
    ? resourceIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  const query = ids.length ? `?ids=${encodeURIComponent(ids.join(','))}` : '';
  const endpoint = getAdminAclAccessPath(familyKey, { bulk: true, query });
  const res = await apiFetch(endpoint, { signal });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || 'Failed to load access');
  }
  return res.json();
}

/**
 * Save ACL access rules for a family of resources.
 */
export async function saveFamilyAccess({ familyKey, updates }) {
  const endpoint = getAdminAclAccessPath(familyKey, { bulk: true });
  const res = await apiFetch(endpoint, {
    method: 'PUT',
    body: JSON.stringify({ updates }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || 'Failed to save access');
  }
  return res.json();
}

/**
 * Open the per-resource ACL editor modal.
 *
 * @param {object}  opts
 * @param {string}  opts.familyKey       – 'models' | 'connections' | 'mcp-servers'
 * @param {object}  opts.resource        – Primary resource object
 * @param {object[]|null} opts.resources – Bulk resources array
 * @param {object[]} opts.groups         – Available groups
 * @param {string}  opts._selectedGroupId
 * @param {object|null} opts.resourceWarning
 * @param {function|null} opts.onSaved   – Async callback(rules, resources)
 */
export async function openAccessModal({
  familyKey,
  resource,
  resources = null,
  groups,
  _selectedGroupId = '',
  resourceWarning = null,
  onSaved = null,
}) {
  const targetResources =
    Array.isArray(resources) && resources.length ? resources : [resource].filter(Boolean);
  const resourceLabel = getResourceLabel(targetResources[0]);
  const bulkCount = targetResources.length;

  const body = `
  <div class="space-y-4">
    <div class="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
      <div class="text-sm font-semibold text-gray-900">${escapeHtml(resourceLabel)}</div>
      <div class="text-xs text-gray-500">${escapeHtml(getResourceNote(targetResources[0], familyKey))}</div>
      ${
        resourceWarning
          ? `
      <div class="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-label-sm text-amber-800">
        <div class="flex items-start gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="mt-0.5 size-5 shrink-0 text-amber-500">
            <path fill-rule="evenodd" d="M8.485 2.495c.673-1.164 2.357-1.164 3.03 0l6.518 11.27c.673 1.164-.17 2.62-1.515 2.62H3.482c-1.345 0-2.188-1.456-1.515-2.62l6.518-11.27Zm1.515 3.505a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5a.75.75 0 0 1 .75-.75Zm0 8.25a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clip-rule="evenodd" />
          </svg>
          <div class="min-w-0">
            <div class="text-sm font-semibold text-amber-900">${escapeHtml(resourceWarning.title)}</div>
            <div class="mt-1 leading-snug">${escapeHtml(resourceWarning.message)}</div>
            ${
              resourceWarning.linkHref
                ? `
            <a href="${escapeHtml(resourceWarning.linkHref)}"
              class="mt-2 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-white px-2.5 py-1 text-label-sm font-semibold text-amber-800 hover:bg-amber-100"
            >
              ${escapeHtml(resourceWarning.linkLabel || 'Open ACL')}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-5">
                <path fill-rule="evenodd" d="M5 10a.75.75 0 0 1 .75-.75h6.69L10.22 7.03a.75.75 0 1 1 1.06-1.06l3.72 3.72a.75.75 0 0 1 0 1.06l-3.72 3.72a.75.75 0 1 1-1.06-1.06l2.22-2.22H5.75A.75.75 0 0 1 5 10Z" clip-rule="evenodd" />
              </svg>
            </a>
            `
                : ''
            }
            ${resourceWarning.extra ? `<div class="mt-1 text-label-sm text-amber-700">${escapeHtml(resourceWarning.extra)}</div>` : ''}
          </div>
        </div>
      </div>
      `
          : ''
      }
      ${
        bulkCount > 1
          ? `
      <div class="mt-2 rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
        Bulk editing ${escapeHtml(String(bulkCount))} ${escapeHtml(getFamilyBulkSummary(familyKey, bulkCount).toLowerCase())}. Existing rules will be replaced on every selected resource.
      </div>
      <div class="mt-3 text-label-sm text-gray-500">
        ${escapeHtml(summarizeSelectedResources(targetResources))}
      </div>
      `
          : ''
      }
    </div>
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <div class="text-sm font-semibold text-gray-900">Group access</div>
        <div class="text-label-sm text-amber-600 font-medium">Deny overrides allow</div>
      </div>
      <div id="policy-acl-list" class="space-y-2"></div>
    </div>
    <div class="text-sm text-red-600 hidden" id="policy-acl-error"></div>
  </div>
  `;

  const modal = createModal({
    preset: 'access',
    title:
      bulkCount > 1
        ? `Bulk ${getFamilyBulkSummary(familyKey, bulkCount)} ACL`
        : `${familyKey === 'models' ? 'Model' : familyKey === 'connections' ? 'Connection' : 'MCP Server'} Access`,
    subtitle: 'Central ACL editor',
    body,
    footer: `
    <button type="button"
      class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/20 rounded transition"
      data-close-modal>Cancel</button>
    ${renderButton({ label: 'Save', variant: 'primary', id: 'policy-acl-save', className: 'px-5 py-2' })}
    `,
  });

  const listEl = modal.modal.querySelector('#policy-acl-list');
  const errorEl = modal.modal.querySelector('#policy-acl-error');
  const saveBtn = modal.modal.querySelector('#policy-acl-save');

  let rules = [];
  const initialRules = cloneAclRules(targetResources[0]?.rules || [], normalizeAclRule);
  rules = cloneAclRules(initialRules, normalizeAclRule);

  const rulesByGroup = new Map();
  for (const rule of rules) {
    if (String(rule?.principal_type || '').toLowerCase() !== 'group') continue;
    const groupId = String(rule.principal_id || '').trim();
    if (!groupId) continue;
    rulesByGroup.set(
      groupId,
      String(rule.effect || 'allow')
        .trim()
        .toLowerCase() === 'deny'
        ? 'deny'
        : 'allow'
    );
  }

  const renderList = () => {
    if (!listEl) return;
    if (!groups.length) {
      listEl.innerHTML =
        '<div class="text-sm text-gray-500 py-6 text-center">No groups available.</div>';
      return;
    }
    listEl.innerHTML = buildAclRows(groups, rules);
    listEl.querySelectorAll('.resource-acl-effect').forEach((select) => {
      select.addEventListener('change', () => {
        const groupId = select.getAttribute('data-group-id');
        if (!groupId) return;
        const effect = String(select.value || 'none');
        if (effect === 'none') {
          rulesByGroup.delete(groupId);
        } else {
          rulesByGroup.set(groupId, effect);
        }
      });
    });
  };

  saveBtn?.addEventListener('click', async () => {
    if (!saveBtn) return;
    setModalSaveButtonState(saveBtn, {
      enabled: true,
      saving: true,
      label: 'Save',
      enabledClass:
        'px-5 py-2 text-sm font-semibold rounded-full bg-gray-900 text-white hover:bg-primary-hover',
      disabledClass:
        'px-5 py-2 text-sm font-semibold rounded-full bg-gray-300 text-gray-500 cursor-not-allowed',
    });
    try {
      const nextRules = Array.from(rulesByGroup.entries()).map(([groupId, effect]) => ({
        principal_type: 'group',
        principal_id: groupId,
        effect,
        action: 'use',
      }));
      if (typeof onSaved === 'function') {
        await onSaved(nextRules, targetResources);
      }
      modal.close();
    } catch (err) {
      errorEl.textContent = err?.message || 'Failed to save access';
      errorEl.classList.remove('hidden');
    } finally {
      setModalSaveButtonState(saveBtn, {
        enabled: true,
        saving: false,
        label: 'Save',
        enabledClass:
          'px-5 py-2 text-sm font-semibold rounded-full bg-gray-900 text-white hover:bg-primary-hover',
        disabledClass:
          'px-5 py-2 text-sm font-semibold rounded-full bg-gray-300 text-gray-500 cursor-not-allowed',
      });
    }
  });

  renderList();
}

/**
 * Helper functions for the account models section.
 */
import { ATTACHMENT_CAP_TYPES } from '../admin/settings/models-helpers.js';
import { normalizeUserResourceOverrides } from '../../shared/utils/user-resource-overrides.js';
import { escapeHtml } from '../../shared/utils/dom-escape.js';
import { cloneAttachmentCaps } from '../../shared/utils/attachment-caps.js';
import { renderModelAccessBadgeForModel } from '../../shared/components/model-access-badge.js';

export function normalizeAttachmentCaps(attachments = {}) {
  const next = {};
  ATTACHMENT_CAP_TYPES.forEach(({ key }) => {
    next[key] = Boolean(attachments?.[key]);
  });
  return next;
}

export function normalizePersonalModelSettings(value = {}) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const source =
    raw.model_settings &&
    typeof raw.model_settings === 'object' &&
    !Array.isArray(raw.model_settings)
      ? raw.model_settings
      : raw;
  const resourceOverrides = normalizeUserResourceOverrides(
    raw.resource_overrides ? raw : { model_settings: source }
  );
  const disabledModelIds = Array.from(
    new Set(
      [
        ...(Array.isArray(source.disabled_model_ids) ? source.disabled_model_ids : []),
        ...(resourceOverrides.models.hidden_ids || []),
      ]
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    )
  );
  const attachmentCaps =
    source.attachment_caps &&
    typeof source.attachment_caps === 'object' &&
    !Array.isArray(source.attachment_caps)
      ? source.attachment_caps
      : {};
  return {
    disabled_model_ids: disabledModelIds,
    attachment_caps: cloneAttachmentCaps(attachmentCaps),
  };
}

export function normalizeModelRecord(model = {}) {
  const id = String(model?.id || model?.modelId || model?.name || '').trim();
  if (!id) return null;
  return {
    ...model,
    id,
    name: String(model?.name || model?.displayName || model?.id || id).trim() || id,
    enabled: model?.enabled !== false,
    attachments: normalizeAttachmentCaps(model?.attachments),
  };
}

export function renderLoadingRows() {
  return Array.from({ length: 5 })
    .map(
      () => `
    <tr class="bg-white text-xs animate-pulse">
      <td class="px-4 py-4"><div class="h-4 w-32 rounded bg-gray-100"></div></td>
      <td class="px-4 py-4"><div class="h-4 w-40 rounded bg-gray-100"></div></td>
      <td class="px-4 py-4">
        <div class="h-6 w-20 rounded-full bg-gray-100"></div>
      </td>
      <td class="px-4 py-4 text-right">
        <div class="ml-auto h-5 w-9 rounded-full bg-gray-100"></div>
      </td>
    </tr>
  `
    )
    .join('');
}

export function renderModelRow(model) {
  const enabled = model.enabled !== false;
  const toggleClass = `relative inline-flex h-5 w-9 items-center shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${enabled ? 'bg-black' : 'bg-gray-200'}`;
  return `
    <tr data-model-row="${escapeHtml(model.id)}" class="bg-white text-xs hover:bg-gray-50/50 transition-colors ${enabled ? '' : 'bg-gray-50/80 opacity-70'}">
      <td class="px-4 py-4 font-medium text-gray-900 truncate" title="${escapeHtml(model.name || model.id)}">${escapeHtml(model.name || model.id)}</td>
      <td class="px-4 py-4 text-gray-500 font-mono truncate ${enabled ? '' : 'text-gray-400'}" title="${escapeHtml(model.id)}">${escapeHtml(model.id)}</td>
      <td class="px-4 py-4">
        <div class="flex items-center gap-2">
          ${renderModelAccessBadgeForModel(model, {
            sharedLabel: 'Admin',
            sharedClassName: 'border-sky-100 bg-sky-50 text-sky-700',
          }).trim()}
        </div>
      </td>
      <td class="px-4 py-4 text-right">
        <div class="flex items-center justify-end gap-2">
          <button
            type="button"
            class="model-toggle ${toggleClass}"
            data-model-id="${escapeHtml(model.id)}"
            title="${enabled ? 'Model enabled' : 'Model disabled'}"
            aria-pressed="${enabled ? 'true' : 'false'}"
          >
            <span class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${enabled ? 'translate-x-4' : 'translate-x-0'}"></span>
          </button>
        </div>
      </td>
    </tr>
  `;
}

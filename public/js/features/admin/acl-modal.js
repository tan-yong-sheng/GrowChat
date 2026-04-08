import { createAdminModalShell } from './modal-shell.js';

function normalizePrefix(prefix) {
  return String(prefix || 'admin-acl')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-');
}

function buildAclModalIds(prefix) {
  const normalized = normalizePrefix(prefix);
  return {
    summaryId: `${normalized}-summary`,
    countId: `${normalized}-count`,
    reasonId: `${normalized}-reason`,
    errorId: `${normalized}-error`,
    listId: `${normalized}-list`,
    saveErrorId: `${normalized}-save-error`,
    saveButtonId: `${normalized}-save-btn`,
    cancelButtonId: `${normalized}-cancel-btn`,
  };
}

export function createAdminAclModalShell({
  idsPrefix,
  title = '',
  subtitle = '',
  closeAttr = 'data-admin-modal-close',
  closeLabel = 'Cancel',
  saveLabel = 'Save',
} = {}) {
  const ids = buildAclModalIds(idsPrefix);
  const { modal, close, bodyEl, footerEl } = createAdminModalShell({
    preset: 'aclEditor',
    title,
    subtitle,
    closeAttr,
    body: `
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div class="text-sm font-semibold text-gray-900" id="${ids.summaryId}"></div>
          <div class="text-xs text-gray-700" id="${ids.countId}"></div>
        </div>
        <div class="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-700" id="${ids.reasonId}"></div>
        <div id="${ids.errorId}" class="text-sm text-red-600 hidden"></div>
        <div id="${ids.listId}" class="space-y-2"></div>
      </div>
    `,
    footer: `
      <div class="text-sm text-red-600" id="${ids.saveErrorId}"></div>
      <div class="flex items-center gap-2">
        <button type="button" class="px-4 py-2 text-sm text-gray-700 hover:text-gray-900" ${closeAttr} id="${ids.cancelButtonId}">${closeLabel}</button>
        <button type="button" class="px-5 py-2 text-sm font-semibold rounded-full bg-gray-900 text-white hover:bg-gray-800" id="${ids.saveButtonId}">${saveLabel}</button>
      </div>
    `,
  });

  const elements = {
    summaryEl: modal.querySelector(`#${ids.summaryId}`),
    countEl: modal.querySelector(`#${ids.countId}`),
    reasonEl: modal.querySelector(`#${ids.reasonId}`),
    errorEl: modal.querySelector(`#${ids.errorId}`),
    listEl: modal.querySelector(`#${ids.listId}`),
    saveErrorEl: modal.querySelector(`#${ids.saveErrorId}`),
    saveButton: modal.querySelector(`#${ids.saveButtonId}`),
    cancelButton: modal.querySelector(`#${ids.cancelButtonId}`),
  };

  return {
    modal,
    close,
    bodyEl,
    footerEl,
    ids,
    elements,
  };
}

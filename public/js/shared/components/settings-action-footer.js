function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderSettingsActionFooter({
  footerId = '',
  dirtyId = '',
  saveId = '',
  dirtyLabel = 'Unsaved changes',
  buttonLabel = 'Save',
  dirty = false,
  saving = false,
  canSave = false,
  dataAttrName = 'data-settings-action-footer',
} = {}) {
  return `
    <div id="${escapeHtml(footerId)}" ${dataAttrName}="${escapeHtml(footerId)}" class="flex w-full items-center justify-between pt-4 pb-3 px-0.5 border-t border-gray-100 bg-white sticky bottom-0 z-10" style="z-index: 190;">
      <div id="${escapeHtml(dirtyId)}" class="text-xs text-amber-700 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-full ${dirty ? '' : 'invisible'}">${escapeHtml(dirtyLabel)}</div>
      <button id="${escapeHtml(saveId)}" type="button" aria-busy="${saving ? 'true' : 'false'}" class="ml-auto inline-flex min-h-11 items-center justify-center rounded-full px-5 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${canSave ? 'bg-black text-white hover:bg-gray-900' : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'} disabled:opacity-100 disabled:cursor-not-allowed" ${canSave ? '' : 'disabled'}>
        ${saving ? 'Saving...' : escapeHtml(buttonLabel)}
      </button>
    </div>
  `;
}

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
  dataAttrName = 'data-settings-action-footer',
  loading = false,
} = {}) {
  return `
    <div id="${escapeHtml(footerId)}" ${dataAttrName}="${escapeHtml(footerId)}" class="flex w-full items-center justify-between pt-4 pb-3 px-0.5 border-t border-gray-100 bg-white sticky bottom-0 z-10" style="z-index: 190;">
      ${loading ? `
        <div class="flex items-center gap-2">
          <div class="animate-spin h-4 w-4 border-2 border-gray-300 border-t-black rounded-full"></div>
          <span class="text-sm text-gray-600">Saving changes...</span>
        </div>
      ` : ''}
      <div id="settings-toast" class="fixed bottom-20 right-4 hidden"></div>
    </div>
  `;
}

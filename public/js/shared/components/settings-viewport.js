function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export const DEFAULT_SETTINGS_BODY_PADDING_CLASS = 'px-2 sm:px-3 md:px-0';
export const DEFAULT_SETTINGS_FOOTER_PADDING_CLASS = 'px-2 md:px-0';

export function renderSettingsViewport({
  contentHtml = '',
  viewportClass = 'w-full px-4 py-6 flex-1 min-h-0 overflow-hidden',
  innerClass = 'flex h-full min-h-0 flex-col overflow-hidden',
} = {}) {
  return `
    <div class="${escapeHtml(viewportClass)}">
      <div class="${escapeHtml(innerClass)}">
        ${contentHtml}
      </div>
    </div>
  `;
}

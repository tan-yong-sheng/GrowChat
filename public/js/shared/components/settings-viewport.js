import { escapeHtml } from '../utils/dom-escape.js';
export const DEFAULT_SETTINGS_BODY_PADDING_CLASS = 'px-2 sm:px-3 md:px-0';
export const DEFAULT_SETTINGS_FOOTER_PADDING_CLASS = 'px-2 md:px-0';

export function renderSettingsViewport({
  contentHtml = '',
  viewportClass = 'w-full px-4 py-6 flex-1 min-h-0 flex flex-col',
  innerClass = 'flex-1 min-h-0 flex flex-col',
} = {}) {
  return `
    <div class="${escapeHtml(viewportClass)}">
      <div class="${escapeHtml(innerClass)}">
        ${contentHtml}
      </div>
    </div>
  `;
}

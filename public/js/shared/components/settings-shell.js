import {
  DEFAULT_SETTINGS_BODY_PADDING_CLASS,
  DEFAULT_SETTINGS_FOOTER_PADDING_CLASS,
} from './settings-viewport.js';

export function renderSettingsShell({
  navPaneHtml = '',
  contentHtml = '',
  bodyId = 'settings-body',
  contentId = 'settings-content',
  footerId = null,
  bodyPaddingClass = DEFAULT_SETTINGS_BODY_PADDING_CLASS,
  footerPaddingClass = DEFAULT_SETTINGS_FOOTER_PADDING_CLASS,
} = {}) {
  return `
    <div class="flex flex-col md:flex-row min-h-0 w-full">
      ${navPaneHtml}
      <div class="flex-1 min-h-0 flex flex-col">
        <div id="${contentId}" class="flex-1 min-h-0 flex flex-col">
          <div id="${bodyId}" class="flex-1 min-h-0 overflow-auto scrollbar-thin-auto ${bodyPaddingClass}">
            ${contentHtml}
          </div>
          ${footerId ? `<div id="${footerId}" class="shrink-0 ${footerPaddingClass}" style="transform: translateY(-24px);"></div>` : ''}
        </div>
      </div>
    </div>
  `;
}

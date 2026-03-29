export function renderSettingsShell({
  navPaneHtml = '',
  contentHtml = '',
  bodyId = 'settings-body',
  contentId = 'settings-content',
  footerId = 'settings-footer',
  bodyPaddingClass = 'px-2 sm:px-3 md:px-0',
  footerPaddingClass = 'px-2 md:px-0',
} = {}) {
  return `
    <div class="flex flex-col md:flex-row h-full w-full">
      ${navPaneHtml}
      <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div id="${contentId}" class="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div id="${bodyId}" class="flex-1 min-h-0 flex flex-col overflow-hidden ${bodyPaddingClass}">
            ${contentHtml}
          </div>
          <div id="${footerId}" class="shrink-0 ${footerPaddingClass}" style="transform: translateY(-24px);"></div>
        </div>
      </div>
    </div>
  `;
}

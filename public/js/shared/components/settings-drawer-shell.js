import { escapeHtml } from '../utils/dom-escape.js';
import { renderButton } from './button.js';

export function renderSettingsDrawerShell({
  rootId = 'settings-drawer-root',
  title = 'My Settings',
  subtitle = 'Personal account preferences.',
  scopeLabel = 'Personal',
  body = '',
  overlayId = 'settings-drawer-overlay',
  closeId = 'settings-drawer-close',
} = {}) {
  return `
    <div id="${escapeHtml(rootId)}" class="fixed inset-0 z-[220]" role="dialog" aria-modal="true" aria-labelledby="${escapeHtml(`${rootId}-title`)}">
      <div id="${escapeHtml(overlayId)}" class="absolute inset-0 bg-black/25 backdrop-blur-sm" aria-hidden="true"></div>
      <div class="absolute inset-0 flex items-center justify-center p-3 sm:p-4 lg:p-5">
        <div class="flex h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-none flex-col overflow-hidden rounded-[1.2rem] border border-gray-200 bg-[#fafafa] text-gray-900 sm:h-[calc(100vh-2rem)] sm:w-[calc(100vw-2rem)] sm:rounded-[1.4rem] lg:h-[calc(100vh-2.5rem)] lg:w-[calc(100vw-2.5rem)]">
          <div class="shrink-0 border-b border-gray-100 bg-white/95 backdrop-blur-md px-4 py-3 sm:px-5 sm:py-4">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span class="inline-flex items-center rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                    ${escapeHtml(scopeLabel)}
                  </span>
                  <h2 id="${escapeHtml(`${rootId}-title`)}" class="truncate text-[1.05rem] font-semibold text-gray-900">${escapeHtml(title)}</h2>
                </div>
                <p class="mt-1 text-xs text-gray-500">${escapeHtml(subtitle)}</p>
              </div>
              ${renderButton({
                label: '×',
                type: 'button',
                variant: 'ghost',
                className:
                  'rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700',
                ariaLabel: 'Close settings',
              }).replace('<button ', `<button id="${escapeHtml(closeId)}" `)}
            </div>
          </div>
          <div class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2 py-2 sm:px-3 sm:py-3">
            ${body}
          </div>
        </div>
      </div>
    </div>
  `;
}

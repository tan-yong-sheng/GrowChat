import { escapeHtml, escapeSelector } from '../utils/dom-escape.js';

const DEFAULT_OUTER_CLASS = 'fixed inset-0 flex items-start justify-center overflow-y-auto p-3 sm:p-4';
const DEFAULT_OVERLAY_CLASS = 'absolute inset-0 bg-black/25 backdrop-blur-sm transition-opacity';
const DEFAULT_SHELL_CLASS = 'relative z-10 w-full bg-white text-gray-900 border border-gray-200 shadow-2xl rounded-[2.5rem] overflow-hidden flex flex-col max-h-[90vh]';
const DEFAULT_HEADER_CLASS = 'flex items-start justify-between gap-4 px-5 py-4 border-b border-gray-100 shrink-0';
const DEFAULT_BODY_CLASS = 'p-5 sm:p-6 overflow-y-auto flex-1 min-h-0';
const DEFAULT_FOOTER_CLASS = 'px-5 py-3 border-t border-gray-200 bg-white flex items-center justify-between shrink-0';
const DEFAULT_CLOSE_CLASS = 'inline-flex h-11 w-11 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white';

export function buildSettingsModalShellMarkup({
  rootId = 'settings-modal-root',
  title = '',
  subtitle = '',
  body = '',
  footer = '',
  ariaLabelledBy = 'settings-modal-title',
  outerClass = DEFAULT_OUTER_CLASS,
  overlayClass = DEFAULT_OVERLAY_CLASS,
  shellClass = DEFAULT_SHELL_CLASS,
  headerClass = DEFAULT_HEADER_CLASS,
  bodyClass = DEFAULT_BODY_CLASS,
  footerClass = DEFAULT_FOOTER_CLASS,
  closeClass = DEFAULT_CLOSE_CLASS,
  closeAriaLabel = 'Close',
  closeId = 'settings-modal-close',
  overlayId = 'settings-modal-overlay',
  closeAttr = 'data-settings-modal-close',
  rootAttrs = '',
  zIndex = 150,
} = {}) {
  return `
    <div id="${escapeHtml(rootId)}" class="${outerClass}" role="dialog" aria-modal="true" aria-labelledby="${escapeHtml(ariaLabelledBy)}" style="z-index: ${zIndex};" ${rootAttrs}>
      <div class="${overlayClass}" id="${escapeHtml(overlayId)}" aria-hidden="true"></div>
      <div class="${shellClass}">
        <div class="${headerClass}" data-settings-modal-header>
          <div>
            <div class="text-lg font-semibold" id="${escapeHtml(ariaLabelledBy)}">${escapeHtml(title)}</div>
            ${subtitle ? `<div class="text-[11px] text-gray-600 mt-1">${escapeHtml(subtitle)}</div>` : ''}
          </div>
          <button type="button" class="${closeClass}" ${closeAttr} aria-label="${escapeHtml(closeAriaLabel)}" id="${escapeHtml(closeId)}">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="${bodyClass}" data-settings-modal-body>
          ${body}
        </div>
        <div class="${footerClass}" data-settings-modal-footer>
          ${footer}
        </div>
      </div>
    </div>
  `;
}

export function createSettingsModalShell(options = {}) {
  const modal = document.createElement('div');
  modal.innerHTML = buildSettingsModalShellMarkup(options).trim();
  const rendered = modal.firstElementChild;
  const mountTarget = options.mountTarget || document.body;
  mountTarget.appendChild(rendered);
  return {
    modal: rendered,
    overlay: rendered.querySelector(`#${escapeSelector(options.overlayId || 'settings-modal-overlay')}`),
    closeBtn: rendered.querySelector(`#${escapeSelector(options.closeId || 'settings-modal-close')}`),
    bodyEl: rendered.querySelector('[data-settings-modal-body]'),
    footerEl: rendered.querySelector('[data-settings-modal-footer]'),
  };
}

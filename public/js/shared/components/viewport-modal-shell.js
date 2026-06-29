import { escapeHtml, escapeSelector } from '../utils/dom-escape.js';

const DEFAULT_OUTER_CLASS =
  'fixed inset-0 flex items-start justify-center overflow-y-auto p-3 sm:p-4 pointer-events-none';
const DEFAULT_OVERLAY_CLASS =
  'absolute inset-0 bg-primary/25 backdrop-blur-sm transition-opacity pointer-events-none';
const DEFAULT_SHELL_CLASS =
  'relative z-10 w-full bg-white text-gray-900 border border-gray-200 shadow-2xl rounded-lg overflow-hidden flex flex-col max-h-[90vh] pointer-events-auto';
const DEFAULT_HEADER_CLASS = 'shrink-0';
const DEFAULT_BODY_CLASS = 'overflow-y-auto flex-1 min-h-0';
const DEFAULT_FOOTER_CLASS = 'shrink-0';
const DEFAULT_CLOSE_CLASS =
  'inline-flex h-11 w-11 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white';

export function buildViewportModalShellMarkup({
  rootId = 'modal-root',
  title = '',
  subtitle = '',
  header = '',
  body = '',
  footer = '',
  ariaLabelledBy = 'modal-title',
  outerClass = DEFAULT_OUTER_CLASS,
  overlayClass = DEFAULT_OVERLAY_CLASS,
  shellClass = DEFAULT_SHELL_CLASS,
  headerClass = DEFAULT_HEADER_CLASS,
  bodyClass = DEFAULT_BODY_CLASS,
  footerClass = DEFAULT_FOOTER_CLASS,
  closeClass = DEFAULT_CLOSE_CLASS,
  closeAriaLabel = 'Close',
  closeId = 'close-modal',
  overlayId = 'modal-overlay',
  rootAttrs = '',
  zIndex = 100,
} = {}) {
  const headerMarkup =
    header ||
    `
    <div class="flex items-start justify-between gap-4 p-4 sm:p-5 border-b border-gray-100">
      <div class="flex flex-col min-w-0">
        ${title ? `<h2 class="text-xl font-bold text-gray-800 truncate" id="${escapeHtml(ariaLabelledBy)}">${escapeHtml(title)}</h2>` : ''}
        ${subtitle ? `<p class="text-xs text-gray-600">${escapeHtml(subtitle)}</p>` : ''}
      </div>
      <button id="${escapeHtml(closeId)}" class="${closeClass}" aria-label="${escapeHtml(closeAriaLabel)}">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
  `;

  return `
    <div id="${escapeHtml(rootId)}" class="${outerClass}" role="dialog" aria-modal="true" aria-labelledby="${escapeHtml(ariaLabelledBy)}" style="z-index: ${zIndex};" ${rootAttrs}>
      <div class="${overlayClass}" id="${escapeHtml(overlayId)}" aria-hidden="true"></div>
      <div class="${shellClass}">
        <div class="${headerClass}">${headerMarkup}</div>
        <div class="${bodyClass}" data-viewport-modal-body>${body}</div>
        ${footer ? `<div class="${footerClass}">${footer}</div>` : ''}
      </div>
    </div>
  `;
}

export function createViewportModalShell(options = {}) {
  const modal = document.createElement('div');
  modal.innerHTML = buildViewportModalShellMarkup(options).trim();
  const rendered = modal.firstElementChild;
  document.body.appendChild(rendered);
  return {
    modal: rendered,
    overlay: rendered.querySelector(`#${escapeSelector(options.overlayId || 'modal-overlay')}`),
    closeBtn: rendered.querySelector(`#${escapeSelector(options.closeId || 'close-modal')}`),
    bodyEl: rendered.querySelector('[data-viewport-modal-body]'),
  };
}

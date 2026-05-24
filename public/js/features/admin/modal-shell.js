import { escapeHtml } from '../../shared/utils/dom-escape.js';
import { clearModalHash, setModalHash } from '../../shared/utils/modal-hash.js';

const DEFAULT_OUTER_CLASS =
  'fixed inset-0 flex items-start justify-center overflow-y-auto p-3 sm:p-4';
const DEFAULT_OVERLAY_CLASS = 'absolute inset-0 bg-black/25 backdrop-blur-sm z-0';
const DEFAULT_SHELL_CLASS =
  'relative z-10 w-full bg-white text-gray-900 border border-gray-200 shadow-2xl rounded-[2.5rem] overflow-hidden flex flex-col max-h-[90vh]';
const DEFAULT_HEADER_CLASS =
  'flex items-start justify-between gap-4 px-5 py-4 border-b border-gray-100 shrink-0';
const DEFAULT_BODY_CLASS = 'p-5 sm:p-6 overflow-y-auto flex-1 min-h-0';
const DEFAULT_FOOTER_CLASS =
  'px-5 py-3 border-t border-gray-200 bg-white flex items-center justify-between shrink-0';
const DEFAULT_CLOSE_CLASS = 'p-2 rounded-full hover:bg-gray-100 transition';

const ADMIN_MODAL_PRESETS = {
  standard: {
    outerClass: DEFAULT_OUTER_CLASS,
    overlayClass: DEFAULT_OVERLAY_CLASS,
    shellClass: DEFAULT_SHELL_CLASS,
    headerClass: DEFAULT_HEADER_CLASS,
    bodyClass: DEFAULT_BODY_CLASS,
    footerClass: DEFAULT_FOOTER_CLASS,
    closeClass: DEFAULT_CLOSE_CLASS,
    closeAriaLabel: 'Close',
    widthClass: 'max-w-3xl',
    zIndex: 150,
  },
  compact: {
    outerClass: 'fixed inset-0 flex items-start justify-center overflow-y-auto p-3 sm:p-4',
    shellClass:
      'relative z-10 w-full max-w-lg rounded-[1.5rem] bg-white shadow-2xl border border-gray-100 overflow-hidden flex flex-col',
    headerClass: 'flex items-center justify-between px-5 pt-5 pb-3 shrink-0',
    bodyClass: 'p-0 overflow-y-auto flex-1 min-h-0',
    footerClass:
      'flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-4 bg-white sticky bottom-0 z-10',
    zIndex: 140,
    widthClass: '',
  },
  userEditor: {
    outerClass: 'fixed inset-0 flex items-start justify-center overflow-y-auto p-3 sm:p-4',
    overlayClass: DEFAULT_OVERLAY_CLASS,
    shellClass:
      'relative z-10 w-full max-w-lg rounded-[1.5rem] bg-white shadow-2xl border border-gray-200 overflow-hidden flex flex-col',
    headerClass: 'flex items-center justify-between px-5 pt-5 pb-3 shrink-0 bg-white',
    bodyClass: 'p-5 sm:p-6 overflow-y-auto flex-1 min-h-0 bg-white',
    footerClass:
      'flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-4 bg-white sticky bottom-0 z-10',
    zIndex: 140,
    widthClass: '',
  },
  access: {
    shellClass:
      'relative z-10 w-full bg-white text-gray-900 border border-gray-200 shadow-2xl rounded-[2.5rem] overflow-hidden flex flex-col max-h-[90vh]',
    headerClass:
      'flex items-start justify-between gap-4 px-5 py-4 border-b border-gray-100 shrink-0',
    bodyClass: 'p-5 sm:p-6 overflow-y-auto flex-1 min-h-0',
    footerClass:
      'px-5 py-3 border-t border-gray-200 bg-white flex items-center justify-between shrink-0',
    zIndex: 150,
    widthClass: 'max-w-3xl',
  },
  aclEditor: {
    outerClass: DEFAULT_OUTER_CLASS,
    overlayClass: DEFAULT_OVERLAY_CLASS,
    shellClass:
      'relative z-10 w-full max-w-4xl bg-white text-gray-900 border border-gray-200 shadow-2xl rounded-[2.5rem] overflow-hidden flex flex-col max-h-[90vh]',
    headerClass: DEFAULT_HEADER_CLASS,
    bodyClass: DEFAULT_BODY_CLASS,
    footerClass: DEFAULT_FOOTER_CLASS,
    zIndex: 250,
    widthClass: '',
  },
  wide: {
    shellClass:
      'relative z-10 w-full max-w-6xl bg-white text-gray-900 border border-gray-200 shadow-2xl rounded-[2.5rem] overflow-hidden flex flex-col max-h-[90vh]',
    headerClass:
      'flex items-center justify-between px-4 sm:px-5 py-4 border-b border-gray-100 shrink-0',
    bodyClass: 'p-0 overflow-y-auto flex-1 min-h-0',
    footerClass:
      'px-5 py-3 border-t border-gray-200 bg-white flex items-center justify-between shrink-0',
    zIndex: 140,
    widthClass: '',
  },
  roleEditor: {
    outerClass: 'fixed inset-0 flex items-start justify-center overflow-y-auto p-3 sm:p-4',
    overlayClass: 'absolute inset-0 bg-black/25 backdrop-blur-sm z-0',
    shellClass:
      'relative z-10 w-full max-w-5xl max-h-[84vh] overflow-hidden bg-white text-gray-900 shadow-2xl flex flex-col rounded-[2rem] border border-gray-200',
    headerClass:
      'flex items-center justify-between gap-3 border-b border-gray-100 px-3 sm:px-4 py-1.5 shrink-0 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 sticky top-0 z-10',
    bodyClass: 'min-h-0 flex-1 overflow-y-auto p-0',
    footerClass:
      'flex items-center justify-between gap-2 border-t border-gray-200 bg-white px-3 sm:px-4 py-1.5 shrink-0 sticky bottom-0 z-10',
    zIndex: 140,
    widthClass: '',
  },
  groupEditor: {
    shellClass:
      'relative z-10 w-full max-w-6xl bg-white text-gray-900 border border-gray-200 shadow-2xl rounded-[2.5rem] overflow-hidden flex flex-col max-h-[90vh]',
    headerClass:
      'flex items-center justify-between px-4 sm:px-5 py-4 border-b border-gray-100 shrink-0',
    bodyClass: 'p-0 overflow-y-auto flex-1 min-h-0',
    footerClass:
      'px-5 py-3 border-t border-gray-200 bg-white flex items-center justify-between shrink-0',
    zIndex: 140,
    widthClass: '',
  },
};

function resolveAdminModalPreset(preset = 'standard', overrides = {}) {
  const resolved = {
    ...ADMIN_MODAL_PRESETS.standard,
    ...(ADMIN_MODAL_PRESETS[preset] || {}),
  };
  for (const [key, value] of Object.entries(overrides || {})) {
    if (value !== undefined) {
      resolved[key] = value;
    }
  }
  return resolved;
}

function normalizeModalHashSource(value) {
  return String(value || '')
    .trim()
    .replace(/^#+/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function resolveModalHash({ modalHash, rootAttrs, title } = {}) {
  const explicit = normalizeModalHashSource(modalHash);
  if (explicit) return explicit;
  const rootIdMatch = String(rootAttrs || '').match(/\bid\s*=\s*["']([^"']+)["']/i);
  if (rootIdMatch?.[1]) return normalizeModalHashSource(rootIdMatch[1]);
  return normalizeModalHashSource(title);
}

export function createAdminModalShell({
  preset = 'standard',
  title = '',
  subtitle = '',
  body = '',
  footer = '',
  onClose = null,
  widthClass,
  zIndex,
  outerClass,
  overlayClass,
  shellClass,
  headerClass,
  bodyClass,
  footerClass,
  closeClass,
  closeAriaLabel,
  closeAttr = 'data-admin-modal-close',
  rootAttrs = '',
  modalHash = '',
} = {}) {
  const markup = buildAdminModalShellMarkup({
    preset,
    title,
    subtitle,
    body,
    footer,
    widthClass,
    zIndex,
    outerClass,
    overlayClass,
    shellClass,
    headerClass,
    bodyClass,
    footerClass,
    closeClass,
    closeAriaLabel,
    closeAttr,
    rootAttrs,
  });
  const modal = document.createElement('div');
  modal.innerHTML = markup.trim();
  const rendered = modal.firstElementChild;
  const resolvedModalHash = resolveModalHash({ modalHash, rootAttrs, title });
  let closed = false;
  const close = (reason = 'dismiss') => {
    if (closed) return;
    closed = true;
    rendered.remove();
    if (resolvedModalHash) {
      clearModalHash(resolvedModalHash);
    }
    if (typeof onClose === 'function') {
      onClose(reason);
    }
  };
  rendered.addEventListener('click', (event) => {
    if (event.target === rendered || event.target.closest(`[${closeAttr}]`)) {
      close('dismiss');
    }
  });
  document.body.appendChild(rendered);
  if (resolvedModalHash) {
    setModalHash(resolvedModalHash);
  }
  return {
    modal: rendered,
    close,
    headerEl: rendered.querySelector('[data-admin-modal-header]'),
    bodyEl: rendered.querySelector('[data-admin-modal-body]'),
    footerEl: rendered.querySelector('[data-admin-modal-footer]'),
  };
}

export function buildAdminModalShellMarkup({
  preset = 'standard',
  title = '',
  subtitle = '',
  body = '',
  footer = '',
  widthClass,
  zIndex,
  outerClass,
  overlayClass,
  shellClass,
  headerClass,
  bodyClass,
  footerClass,
  closeClass,
  closeAriaLabel,
  closeAttr = 'data-admin-modal-close',
  rootAttrs = '',
} = {}) {
  const config = resolveAdminModalPreset(preset, {
    title,
    subtitle,
    body,
    footer,
    widthClass,
    zIndex,
    outerClass,
    overlayClass,
    shellClass,
    headerClass,
    bodyClass,
    footerClass,
    closeClass,
    closeAriaLabel,
    closeAttr,
    rootAttrs,
  });
  const zIndexClass = typeof config.zIndex === 'number' ? `z-[${config.zIndex}]` : '';
  return `
    <div class="${config.outerClass} ${zIndexClass}" ${config.rootAttrs}>
      <div class="${config.overlayClass}"></div>
      <div class="${config.shellClass} ${config.widthClass}">
        <div class="${config.headerClass}" data-admin-modal-header>
          <div>
            <div class="text-lg font-semibold">${escapeHtml(config.title)}</div>
            ${config.subtitle ? `<div class="text-[11px] text-gray-700 mt-1">${escapeHtml(config.subtitle)}</div>` : ''}
          </div>
          <button type="button" class="${config.closeClass}" ${config.closeAttr} aria-label="${escapeHtml(config.closeAriaLabel)}">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="${config.bodyClass}" data-admin-modal-body>
          ${config.body}
        </div>
        <div class="${config.footerClass}" data-admin-modal-footer>
          ${config.footer}
        </div>
      </div>
    </div>
  `;
}

export function getAdminModalPreset(name = 'standard') {
  return resolveAdminModalPreset(name);
}

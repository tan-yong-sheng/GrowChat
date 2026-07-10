import { clearModalHash, setModalHash } from '../../shared/utils/modal-hash.js';
import { escapeHtml } from '../../shared/utils/dom-escape.js';

const Z_INDEX_CLASSES = {
  140: 'z-[140]',
  150: 'z-[150]',
  250: 'z-[250]',
};

const DEFAULT_OUTER_CLASS =
  'fixed inset-0 flex items-start justify-center overflow-y-auto p-3 sm:p-4';
const DEFAULT_OVERLAY_CLASS = 'absolute inset-0 bg-primary/25 backdrop-blur-sm z-0';
const DEFAULT_SHELL_CLASS =
  'relative z-10 w-full bg-white text-gray-900 border border-gray-200 shadow-2xl rounded-lg overflow-hidden flex flex-col max-h-[90vh]';
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
      'relative z-10 w-full max-w-lg rounded-lg bg-white shadow-2xl border border-gray-100 overflow-hidden flex flex-col',
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
      'relative z-10 w-full max-w-lg rounded-lg bg-white shadow-2xl border border-gray-200 overflow-hidden flex flex-col',
    headerClass: 'flex items-center justify-between px-5 pt-5 pb-3 shrink-0 bg-white',
    bodyClass: 'p-5 sm:p-6 overflow-y-auto flex-1 min-h-0 bg-white',
    footerClass:
      'flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-4 bg-white sticky bottom-0 z-10',
    zIndex: 140,
    widthClass: '',
  },
  access: {
    shellClass: DEFAULT_SHELL_CLASS,
    headerClass: DEFAULT_HEADER_CLASS,
    bodyClass: DEFAULT_BODY_CLASS,
    footerClass: DEFAULT_FOOTER_CLASS,
    zIndex: 150,
    widthClass: 'max-w-3xl',
  },
  aclEditor: {
    outerClass: DEFAULT_OUTER_CLASS,
    overlayClass: DEFAULT_OVERLAY_CLASS,
    shellClass:
      'relative z-10 w-full max-w-4xl bg-white text-gray-900 border border-gray-200 shadow-2xl rounded-lg overflow-hidden flex flex-col max-h-[90vh]',
    headerClass: DEFAULT_HEADER_CLASS,
    bodyClass: DEFAULT_BODY_CLASS,
    footerClass: DEFAULT_FOOTER_CLASS,
    zIndex: 250,
    widthClass: '',
  },
  wide: {
    shellClass:
      'relative z-10 w-full max-w-6xl bg-white text-gray-900 border border-gray-200 shadow-2xl rounded-lg overflow-hidden flex flex-col max-h-[90vh]',
    headerClass:
      'flex items-center justify-between px-4 sm:px-5 py-4 border-b border-gray-100 shrink-0',
    bodyClass: 'p-0 overflow-y-auto flex-1 min-h-0',
    footerClass: DEFAULT_FOOTER_CLASS,
    zIndex: 140,
    widthClass: '',
  },
  roleEditor: {
    outerClass: 'fixed inset-0 flex items-start justify-center overflow-y-auto p-3 sm:p-4',
    overlayClass: 'absolute inset-0 bg-primary/25 backdrop-blur-sm z-0',
    shellClass:
      'relative z-10 w-full max-w-5xl max-h-[84vh] overflow-hidden bg-white text-gray-900 shadow-2xl flex flex-col rounded-lg border border-gray-200',
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
      'relative z-10 w-full max-w-6xl bg-white text-gray-900 border border-gray-200 shadow-2xl rounded-lg overflow-hidden flex flex-col max-h-[90vh]',
    headerClass:
      'flex items-center justify-between px-4 sm:px-5 py-4 border-b border-gray-100 shrink-0',
    bodyClass: 'p-0 overflow-y-auto flex-1 min-h-0',
    footerClass: DEFAULT_FOOTER_CLASS,
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

function pickAdminModalShellConfig(o) {
  return {
    title: o.title,
    subtitle: o.subtitle,
    body: o.body,
    footer: o.footer,
    widthClass: o.widthClass,
    zIndex: o.zIndex,
    outerClass: o.outerClass,
    overlayClass: o.overlayClass,
    shellClass: o.shellClass,
    headerClass: o.headerClass,
    bodyClass: o.bodyClass,
    footerClass: o.footerClass,
    closeClass: o.closeClass,
    closeAriaLabel: o.closeAriaLabel,
    closeAttr: o.closeAttr,
    rootAttrs: o.rootAttrs,
  };
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

function attachModalCloseHandlers(rendered, closeAttr, closeFn) {
  rendered.addEventListener('click', (event) => {
    if (event.target === rendered || event.target.closest(`[${closeAttr}]`)) {
      closeFn('dismiss');
    }
  });
}

function createCloseFn(rendered, onClose, resolvedModalHash) {
  let closed = false;
  return (reason = 'dismiss') => {
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
}

export function createAdminModalShell(options = {}) {
  const o = Object.assign(
    {
      preset: 'standard',
      title: '',
      subtitle: '',
      body: '',
      footer: '',
      onClose: null,
      closeAttr: 'data-admin-modal-close',
      rootAttrs: '',
      modalHash: '',
    },
    options || {}
  );
  const markup = buildAdminModalShellMarkup({ ...pickAdminModalShellConfig(o), preset: o.preset });
  const modal = document.createElement('div');
  modal.innerHTML = markup.trim();
  const rendered = modal.firstElementChild;
  const resolvedModalHash = resolveModalHash({
    modalHash: o.modalHash,
    rootAttrs: o.rootAttrs,
    title: o.title,
  });
  const close = createCloseFn(rendered, o.onClose, resolvedModalHash);
  attachModalCloseHandlers(rendered, o.closeAttr, close);
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

function buildZIndexClass(configZIndex) {
  const predefined = Z_INDEX_CLASSES[configZIndex];
  if (predefined) return predefined;
  if (typeof configZIndex === 'number') {
    console.error(
      `[modal-shell] Unmapped z-index ${configZIndex}; add it to Z_INDEX_CLASSES so Tailwind JIT generates the CSS. Falling back to z-[${configZIndex}].`
    );
    return `z-[${configZIndex}]`;
  }
  return '';
}

function buildModalHeader(config, closeAttr) {
  const subtitleHtml = config.subtitle
    ? `<div class="text-label-sm text-gray-700 mt-1">${escapeHtml(config.subtitle)}</div>`
    : '';
  return `
    <div class="${config.headerClass}" data-admin-modal-header>
      <div>
        <div class="text-lg font-semibold">${escapeHtml(config.title)}</div>
        ${subtitleHtml}
      </div>
      <button type="button" class="${config.closeClass}" ${closeAttr} aria-label="${escapeHtml(config.closeAriaLabel)}">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  `;
}

function buildModalBody(config) {
  return `<div class="${config.bodyClass}" data-admin-modal-body>${config.body}</div>`;
}

function buildModalFooter(config) {
  return `<div class="${config.footerClass}" data-admin-modal-footer>${config.footer}</div>`;
}

function buildModalShellInner(config, closeAttr) {
  return `
    <div class="${config.shellClass} ${config.widthClass}">
      ${buildModalHeader(config, closeAttr)}
      ${buildModalBody(config)}
      ${buildModalFooter(config)}
    </div>
  `;
}

export function buildAdminModalShellMarkup(options = {}) {
  const o = Object.assign(
    {
      preset: 'standard',
      title: '',
      subtitle: '',
      body: '',
      footer: '',
      closeAttr: 'data-admin-modal-close',
      rootAttrs: '',
    },
    options || {}
  );
  const config = resolveAdminModalPreset(o.preset, pickAdminModalShellConfig(o));
  const zIndexClass = buildZIndexClass(config.zIndex);
  return `
    <div class="${config.outerClass} ${zIndexClass}" ${config.rootAttrs}>
      <div class="${config.overlayClass}"></div>
      ${buildModalShellInner(config, o.closeAttr)}
    </div>
  `;
}

export function getAdminModalPreset(name = 'standard') {
  return resolveAdminModalPreset(name);
}

export { Z_INDEX_CLASSES };

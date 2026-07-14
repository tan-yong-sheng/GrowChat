/**
 * Special block UI state management for markdown code blocks (KaTeX, Mermaid, Graphviz).
 * Handles mode toggling (preview/code), collapse state, error display, and action binding.
 */

import { showToast } from './utils/toast.js';
import {
  escapeHtml,
  normalizeSpecialBlockMode,
  normalizeSpecialBlockScope,
} from './markdown-shared.js';

export function getSpecialBlockKind(lang) {
  const value = String(lang || '')
    .trim()
    .toLowerCase();
  if (!value) return null;
  if (value === 'katex' || value === 'math' || value === 'latex') return 'katex';
  if (value === 'mermaid') return 'mermaid';
  if (value === 'graphviz' || value === 'dot' || value === 'gv') return 'graphviz';
  return null;
}

export function getSpecialBlockLabel(kind) {
  switch (kind) {
    case 'katex':
      return 'KaTeX';
    case 'mermaid':
      return 'Mermaid';
    case 'graphviz':
      return 'Graphviz';
    default:
      return 'Preview';
  }
}

export function getSpecialCodeLanguage(kind) {
  switch (kind) {
    case 'katex':
      return 'math';
    case 'graphviz':
      return 'dot';
    default:
      return kind || 'text';
  }
}

export function getSpecialPreviewPlaceholder(kind) {
  switch (kind) {
    case 'katex':
      return 'Preview';
    case 'mermaid':
    case 'graphviz':
      return 'Preview';
    default:
      return 'Preview';
  }
}

export function renderPlainCodeBlock(
  token,
  { interactive = true, langLabel = 'text', sourceLanguage = langLabel } = {}
) {
  const code = escapeHtml(token?.text ?? '');
  const languageClass = sourceLanguage ? `language-${escapeHtml(sourceLanguage)}` : '';
  if (!interactive) {
    return `<pre class="gc-markdown-code-block" data-markdown-code-body><code class="${languageClass}">${code}</code></pre>`;
  }
  return `<div class="gc-markdown-code-shell" data-markdown-code-block data-code-lang="${escapeHtml(langLabel)}"><div class="gc-markdown-code-toolbar"><div class="gc-markdown-code-lang">${escapeHtml(langLabel)}</div><div class="gc-markdown-code-actions"><button type="button" class="gc-markdown-code-action" data-markdown-code-copy title="Copy code" aria-label="Copy code"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-3.5"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg><span>Copy</span></button><button type="button" class="gc-markdown-code-action" data-markdown-code-toggle title="Collapse code" aria-label="Collapse code" aria-expanded="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" class="size-3.5"><path stroke-linecap="round" stroke-linejoin="round" d="m6 15 6-6 6 6"></path></svg><span>Collapse</span></button></div></div><pre class="gc-markdown-code-block" data-markdown-code-body><code class="${languageClass}">${code}</code></pre></div>`;
}

export function showSpecialCopyToast(message, duration = 1800) {
  return showToast(message, duration);
}

export async function copyMarkdownText(text) {
  const value = String(text ?? '');
  if (!value) return false;
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the legacy fallback.
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand?.('copy');
    document.body.removeChild(textarea);
    if (copied) return true;
  } catch {
    // Final fallback below.
  }
  window.prompt('Copy code', value);
  return false;
}

export function updateSpecialBlockCollapseState(block) {
  if (!block) return;
  const collapsed = block.dataset.markdownSpecialCollapsed === '1';
  const collapseBtn = block.querySelector('[data-markdown-special-collapse]');
  const collapseLabel = block.querySelector('[data-markdown-special-collapse-label]');
  if (collapseBtn) collapseBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  if (collapseLabel) collapseLabel.textContent = collapsed ? 'Expand' : 'Collapse';
}

export function ensureSpecialBlockErrorElement(block) {
  if (!block) return null;
  let errorEl = block.querySelector('[data-markdown-special-error]');
  if (errorEl) return errorEl;
  const codeShell = block.querySelector('[data-markdown-special-code-shell]');
  if (!codeShell) return null;
  errorEl = document.createElement('div');
  errorEl.className = 'gc-markdown-special-error hidden';
  errorEl.setAttribute('data-markdown-special-error', '');
  errorEl.setAttribute('aria-live', 'polite');
  errorEl.innerHTML = `
    <div class="gc-markdown-special-error-title">Preview unavailable</div>
    <div class="gc-markdown-special-error-body" data-markdown-special-error-body></div>
  `;
  codeShell.insertAdjacentElement('afterend', errorEl);
  return errorEl;
}

function updateErrorElementVisibility(errorEl, hasError) {
  if (errorEl && !hasError) errorEl.remove();
  if (errorEl && hasError) errorEl.classList.remove('hidden');
}

function disablePreviewButton(block, hasError) {
  const previewBtn = block.querySelector('[data-markdown-special-mode-btn="preview"]');
  if (previewBtn) previewBtn.disabled = hasError || block.dataset.markdownSpecialStreaming === '1';
  return previewBtn;
}

function applyCodeModeToBlock(block) {
  block.dataset.markdownSpecialMode = 'code';
  const codeBtn = block.querySelector('[data-markdown-special-mode-btn="code"]');
  if (codeBtn) codeBtn.setAttribute('aria-pressed', 'true');
  const previewBtn = block.querySelector('[data-markdown-special-mode-btn="preview"]');
  if (previewBtn) previewBtn.setAttribute('aria-pressed', 'false');
}

export function setSpecialBlockError(block, message) {
  if (!block) return;
  const hasError = Boolean(message);
  const errorEl = hasError
    ? ensureSpecialBlockErrorElement(block)
    : block.querySelector('[data-markdown-special-error]');
  const errorBody = errorEl?.querySelector('[data-markdown-special-error-body]');
  block.dataset.markdownSpecialHasError = hasError ? '1' : '0';
  block.dataset.markdownSpecialErrorMessage = hasError ? String(message) : '';
  if (errorBody) errorBody.textContent = hasError ? String(message) : '';
  updateErrorElementVisibility(errorEl, hasError);
  disablePreviewButton(block, hasError);
  if (hasError) applyCodeModeToBlock(block);
  updateSpecialBlockVisibility(block);
}

export function applySpecialBlockMode(block, mode) {
  if (!block) return;
  const nextMode = normalizeSpecialBlockMode(mode);
  if (nextMode === 'preview' && block.dataset.markdownSpecialHasError === '1') {
    return;
  }
  const previewBtn = block.querySelector('[data-markdown-special-mode-btn="preview"]');
  const codeBtn = block.querySelector('[data-markdown-special-mode-btn="code"]');
  block.dataset.markdownSpecialMode = nextMode;
  if (block.dataset.markdownSpecialCollapsed === '1') {
    block.dataset.markdownSpecialCollapsed = '0';
  }
  updateSpecialBlockVisibility(block);
  if (previewBtn)
    previewBtn.setAttribute('aria-pressed', nextMode === 'preview' ? 'true' : 'false');
  if (codeBtn) codeBtn.setAttribute('aria-pressed', nextMode === 'code' ? 'true' : 'false');
  if (previewBtn)
    previewBtn.disabled =
      block.dataset.markdownSpecialHasError === '1' ||
      block.dataset.markdownSpecialStreaming === '1';
}

export function applySpecialBlockModeToScope(scope, mode) {
  const nextScope = normalizeSpecialBlockScope(scope);
  if (!nextScope || typeof document === 'undefined') return;
  const blocks = document.querySelectorAll?.('[data-markdown-special-block]') || [];
  for (const block of blocks) {
    if (!block || block.dataset.markdownSpecialScope !== nextScope) continue;
    applySpecialBlockMode(block, normalizeSpecialBlockMode(mode));
  }
}

function getSpecialBlockMode(block) {
  return block.dataset.markdownSpecialMode === 'code' ? 'code' : 'preview';
}

function isSpecialBlockCollapsed(block) {
  return block.dataset.markdownSpecialCollapsed === '1';
}

function isSpecialBlockStreaming(block) {
  return block.dataset.markdownSpecialStreaming === '1';
}

function isSpecialBlockErrored(block) {
  return block.dataset.markdownSpecialHasError === '1';
}

function updateElementVisibility(el, hidden) {
  if (el) el.classList.toggle('hidden', hidden);
}

function shouldHidePreview(collapsed, mode, streaming) {
  return collapsed || mode === 'code' || streaming;
}

function shouldHideCode(collapsed, mode) {
  return collapsed || mode !== 'code';
}

function shouldHideError(collapsed, hasError, mode) {
  return collapsed || !hasError || mode !== 'code';
}

export function updateSpecialBlockVisibility(block) {
  if (!block) return;
  const mode = getSpecialBlockMode(block);
  const collapsed = isSpecialBlockCollapsed(block);
  const streaming = isSpecialBlockStreaming(block);
  const hasError = isSpecialBlockErrored(block);
  updateElementVisibility(
    block.querySelector('[data-markdown-special-preview]'),
    shouldHidePreview(collapsed, mode, streaming)
  );
  updateElementVisibility(
    block.querySelector('[data-markdown-special-code-shell]'),
    shouldHideCode(collapsed, mode)
  );
  updateElementVisibility(
    block.querySelector('[data-markdown-special-error]'),
    shouldHideError(collapsed, hasError, mode)
  );
  updateSpecialBlockCollapseState(block);
}

export function setSpecialBlockMode(block, mode) {
  if (!block) return;
  const scope = block.dataset.markdownSpecialScope;
  if (scope) {
    applySpecialBlockModeToScope(scope, mode);
    return;
  }
  applySpecialBlockMode(block, mode);
}

export function setSpecialBlockCollapsed(block, collapsed) {
  if (!block) return;
  block.dataset.markdownSpecialCollapsed = collapsed ? '1' : '0';
  updateSpecialBlockVisibility(block);
}

export function bindSpecialBlockActions(block) {
  if (!block || block.dataset.markdownSpecialBound === '1') return;
  block.dataset.markdownSpecialBound = '1';
  block.querySelectorAll('[data-markdown-special-mode-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const btnMode = btn.getAttribute('data-markdown-special-mode-btn');
      const scope = block.dataset.markdownSpecialScope;
      if (scope) {
        applySpecialBlockModeToScope(scope, btnMode);
        return;
      }
      setSpecialBlockMode(block, btnMode);
    });
  });
  const copyBtn = block.querySelector('[data-markdown-special-copy]');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const code = block.querySelector('[data-markdown-special-code] code');
      const text = code?.textContent || '';
      const copied = await copyMarkdownText(text);
      if (copied) showSpecialCopyToast('Copied');
    });
  }
  const collapseBtn = block.querySelector('[data-markdown-special-collapse]');
  if (collapseBtn) {
    collapseBtn.addEventListener('click', () => {
      const collapsed = block.dataset.markdownSpecialCollapsed === '1';
      setSpecialBlockCollapsed(block, !collapsed);
    });
  }
}

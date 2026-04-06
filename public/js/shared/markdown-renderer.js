import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.6/dist/purify.es.mjs';

const MARKDOWN_CACHE_LIMIT = 200;
const markdownCache = new Map();
let markedReadyPromise = null;
let markdownEnhancementPending = false;
let graphvizRendererPromise = null;
let mermaidInitialized = false;
let specialBlockScopeKey = '';
let specialBlockMode = 'preview';

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function decodeHtmlEntities(content) {
  if (typeof document === 'undefined') return String(content ?? '');
  const textarea = document.createElement('textarea');
  textarea.innerHTML = String(content ?? '');
  return textarea.value;
}

function normalizeMessageContent(content) {
  const normalized = String(content ?? '').replace(/\r\n?/g, '\n');
  return convertDisplayMathBlocks(decodeHtmlEntities(decodeHtmlEntities(normalized)));
}

function normalizeSpecialBlockScope(scope) {
  return String(scope ?? '').trim();
}

function normalizeSpecialBlockMode(mode) {
  return mode === 'code' ? 'code' : 'preview';
}

function resolveSpecialBlockSession(scope) {
  const nextScope = normalizeSpecialBlockScope(scope);
  if (!nextScope) {
    return { scope: '', mode: 'preview' };
  }
  if (specialBlockScopeKey !== nextScope) {
    specialBlockScopeKey = nextScope;
    specialBlockMode = 'preview';
  }
  return { scope: specialBlockScopeKey, mode: specialBlockMode };
}

const DISPLAY_MATH_DELIMITERS = [
  { open: '$$', close: '$$', kind: 'katex' },
  { open: '\\[', close: '\\]', kind: 'katex' },
  { open: '\\begin{equation}', close: '\\end{equation}', kind: 'katex' },
];

const FULL_LATEX_DOCUMENT_PATTERNS = [
  /\\documentclass\b/i,
  /\\begin\{document\}/i,
  /\\end\{document\}/i,
];

function isFullLatexDocument(content) {
  const text = String(content ?? '');
  return FULL_LATEX_DOCUMENT_PATTERNS.some((pattern) => pattern.test(text));
}

function matchDisplayMathDelimiter(trimmedLine) {
  return DISPLAY_MATH_DELIMITERS.find((delimiter) => (
    trimmedLine === delimiter.open
    || (
      trimmedLine.startsWith(delimiter.open)
      && trimmedLine.endsWith(delimiter.close)
      && trimmedLine.length > delimiter.open.length + delimiter.close.length
    )
  )) || null;
}

function convertDisplayMathBlocks(content) {
  const lines = String(content ?? '').split('\n');
  const out = [];
  let inFence = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      inFence = !inFence;
      out.push(line);
      continue;
    }

    if (!inFence) {
      const delimiter = matchDisplayMathDelimiter(trimmed);
      if (delimiter) {
        if (trimmed === delimiter.open) {
          const body = [];
          let j = i + 1;
          while (j < lines.length && lines[j].trim() !== delimiter.close) {
            body.push(lines[j]);
            j += 1;
          }
          if (j < lines.length) {
            out.push('```katex');
            out.push(...body);
            out.push('```');
            i = j;
            continue;
          }
        } else {
          out.push('```katex');
          out.push(trimmed.slice(delimiter.open.length, -delimiter.close.length).trim());
          out.push('```');
          continue;
        }
      }
    }

    out.push(line);
  }

  return out.join('\n');
}

function getSpecialBlockKind(lang) {
  const value = String(lang || '').trim().toLowerCase();
  if (!value) return null;
  if (value === 'katex' || value === 'math' || value === 'latex') return 'katex';
  if (value === 'mermaid') return 'mermaid';
  if (value === 'graphviz' || value === 'dot' || value === 'gv') return 'graphviz';
  return null;
}

function getSpecialBlockLabel(kind) {
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

function getSpecialCodeLanguage(kind) {
  switch (kind) {
    case 'katex':
      return 'math';
    case 'graphviz':
      return 'dot';
    default:
      return kind || 'text';
  }
}

function getSpecialPreviewPlaceholder(kind) {
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

function renderPlainCodeBlock(token, { interactive = true, streaming = false, langLabel = 'text', sourceLanguage = langLabel } = {}) {
  const code = escapeHtml(token?.text ?? '');
  const languageClass = sourceLanguage ? `language-${escapeHtml(sourceLanguage)}` : '';
  const isStreaming = Boolean(streaming);

  if (!interactive) {
    return `<pre class="gc-markdown-code-block" data-markdown-code-body><code class="${languageClass}">${code}</code></pre>`;
  }

  return `<div class="gc-markdown-code-shell" data-markdown-code-block data-code-lang="${escapeHtml(langLabel)}"><div class="gc-markdown-code-toolbar"><div class="gc-markdown-code-lang">${escapeHtml(langLabel)}</div><div class="gc-markdown-code-actions"><button type="button" class="gc-markdown-code-action" data-markdown-code-copy title="Copy code" aria-label="Copy code"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-3.5"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg><span>Copy</span></button><button type="button" class="gc-markdown-code-action" data-markdown-code-toggle title="Collapse code" aria-label="Collapse code" aria-expanded="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" class="size-3.5"><path stroke-linecap="round" stroke-linejoin="round" d="m6 15 6-6 6 6"></path></svg><span>Collapse</span></button></div></div><pre class="gc-markdown-code-block" data-markdown-code-body><code class="${languageClass}">${code}</code></pre></div>`;
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function showSpecialCopyToast(message, duration = 1800) {
  if (typeof document === 'undefined') return null;
  const toast = document.createElement('div');
  toast.className = 'fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 bg-black text-white text-sm font-medium rounded-full shadow-lg z-[99999] transition-opacity duration-300 opacity-0';
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.remove('opacity-0'));
  setTimeout(() => {
    toast.classList.add('opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, duration);
  return toast;
}

async function copyMarkdownText(text) {
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

function updateSpecialBlockCollapseState(block) {
  if (!block) return;
  const collapsed = block.dataset.markdownSpecialCollapsed === '1';
  const collapseBtn = block.querySelector('[data-markdown-special-collapse]');
  const collapseLabel = block.querySelector('[data-markdown-special-collapse-label]');
  if (collapseBtn) collapseBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  if (collapseLabel) collapseLabel.textContent = collapsed ? 'Expand' : 'Collapse';
}

function ensureSpecialBlockErrorElement(block) {
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

function setSpecialBlockError(block, message) {
  if (!block) return;
  const hasError = Boolean(message);
  const errorEl = hasError ? ensureSpecialBlockErrorElement(block) : block.querySelector('[data-markdown-special-error]');
  const errorBody = errorEl?.querySelector('[data-markdown-special-error-body]');
  block.dataset.markdownSpecialHasError = hasError ? '1' : '0';
  block.dataset.markdownSpecialErrorMessage = hasError ? String(message) : '';
  if (errorBody) errorBody.textContent = hasError ? String(message) : '';
  if (errorEl && !hasError) errorEl.remove();
  if (errorEl && hasError) errorEl.classList.remove('hidden');
  const previewBtn = block.querySelector('[data-markdown-special-mode-btn="preview"]');
  if (previewBtn) previewBtn.disabled = hasError || block.dataset.markdownSpecialStreaming === '1';
  if (hasError) {
    block.dataset.markdownSpecialMode = 'code';
    const codeBtn = block.querySelector('[data-markdown-special-mode-btn="code"]');
    if (codeBtn) codeBtn.setAttribute('aria-pressed', 'true');
    if (previewBtn) previewBtn.setAttribute('aria-pressed', 'false');
  }
  updateSpecialBlockVisibility(block);
}

function applySpecialBlockMode(block, mode) {
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
  if (previewBtn) previewBtn.setAttribute('aria-pressed', nextMode === 'preview' ? 'true' : 'false');
  if (codeBtn) codeBtn.setAttribute('aria-pressed', nextMode === 'code' ? 'true' : 'false');
  if (previewBtn) previewBtn.disabled = block.dataset.markdownSpecialHasError === '1' || block.dataset.markdownSpecialStreaming === '1';
}

function applySpecialBlockModeToScope(scope, mode) {
  const nextScope = normalizeSpecialBlockScope(scope);
  if (!nextScope || typeof document === 'undefined') return;
  specialBlockScopeKey = nextScope;
  specialBlockMode = normalizeSpecialBlockMode(mode);
  const blocks = document.querySelectorAll?.('[data-markdown-special-block]') || [];
  for (const block of blocks) {
    if (!block || block.dataset.markdownSpecialScope !== nextScope) continue;
    applySpecialBlockMode(block, specialBlockMode);
  }
}

function updateSpecialBlockVisibility(block) {
  if (!block) return;
  const nextMode = block.dataset.markdownSpecialMode === 'code' ? 'code' : 'preview';
  const collapsed = block.dataset.markdownSpecialCollapsed === '1';
  const streaming = block.dataset.markdownSpecialStreaming === '1';
  const hasError = block.dataset.markdownSpecialHasError === '1';
  const preview = block.querySelector('[data-markdown-special-preview]');
  const code = block.querySelector('[data-markdown-special-code-shell]');
  const error = block.querySelector('[data-markdown-special-error]');

  if (preview) preview.classList.toggle('hidden', collapsed || nextMode === 'code' || streaming);
  if (code) code.classList.toggle('hidden', collapsed || nextMode !== 'code');
  if (error) error.classList.toggle('hidden', collapsed || !hasError || nextMode !== 'code');
  updateSpecialBlockCollapseState(block);
}

function setSpecialBlockMode(block, mode) {
  if (!block) return;
  const scope = block.dataset.markdownSpecialScope || specialBlockScopeKey;
  if (scope) {
    applySpecialBlockModeToScope(scope, mode);
    return;
  }
  applySpecialBlockMode(block, mode);
}

function setSpecialBlockCollapsed(block, collapsed) {
  if (!block) return;
  block.dataset.markdownSpecialCollapsed = collapsed ? '1' : '0';
  updateSpecialBlockVisibility(block);
}

function bindSpecialBlockActions(block) {
  if (!block || block.dataset.markdownSpecialBound === '1') return;
  block.dataset.markdownSpecialBound = '1';
  block.querySelectorAll('[data-markdown-special-mode-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-markdown-special-mode-btn');
      const scope = block.dataset.markdownSpecialScope || specialBlockScopeKey;
      if (scope) {
        applySpecialBlockModeToScope(scope, mode);
        return;
      }
      setSpecialBlockMode(block, mode);
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

function loadGraphvizRenderer() {
  if (graphvizRendererPromise) return graphvizRendererPromise;
  const globalGraphviz = globalThis?.window?.Graphviz
    || globalThis?.Graphviz
    || globalThis?.window?.graphviz
    || globalThis?.graphviz
    || globalThis?.window?.['@hpcc-js/wasm']?.Graphviz
    || globalThis?.['@hpcc-js/wasm']?.Graphviz
    || globalThis?.window?.['@hpcc-js/wasm']?.graphviz
    || globalThis?.['@hpcc-js/wasm']?.graphviz;
  const graphvizFactory = globalGraphviz?.Graphviz || globalGraphviz;
  if (graphvizFactory?.dot) {
    graphvizRendererPromise = Promise.resolve(graphvizFactory);
    return graphvizRendererPromise;
  }
  if (graphvizFactory?.load) {
    graphvizRendererPromise = graphvizFactory.load()
      .then((renderer) => renderer || graphvizFactory)
      .catch((err) => {
        graphvizRendererPromise = null;
        throw err;
      });
    return graphvizRendererPromise;
  }
  return Promise.reject(new Error('Graphviz renderer unavailable'));
}

async function renderSpecialPreview(kind, source, previewEl, block) {
  if (!previewEl) return false;
  const text = String(source ?? '').trim();
  if (!text) {
    previewEl.innerHTML = `<div class="gc-markdown-special-placeholder">${escapeHtml(getSpecialPreviewPlaceholder(kind))}</div>`;
    if (block) setSpecialBlockError(block, '');
    return false;
  }

  try {
    if (kind === 'katex') {
      const katex = globalThis?.window?.katex || globalThis?.katex;
      if (!katex || typeof katex.renderToString !== 'function') throw new Error('KaTeX unavailable');
      previewEl.innerHTML = katex.renderToString(text, {
        displayMode: true,
        throwOnError: true,
        output: 'html',
      });
      if (block) setSpecialBlockError(block, '');
      return true;
    }

    if (kind === 'mermaid') {
      const mermaid = globalThis?.window?.mermaid || globalThis?.mermaid;
      if (!mermaid || (typeof mermaid.run !== 'function' && typeof mermaid.render !== 'function')) throw new Error('Mermaid unavailable');
      if (!mermaidInitialized && typeof mermaid.initialize === 'function') {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'default',
        });
        mermaidInitialized = true;
      }

      const renderId = `gc-mermaid-${block?.dataset?.markdownSpecialId || crypto.randomUUID()}`;
      previewEl.innerHTML = `<div class="mermaid" data-markdown-special-diagram="${renderId}">${escapeHtml(text)}</div>`;
      const diagramEl = previewEl.querySelector('[data-markdown-special-diagram]');
      if (typeof mermaid.run === 'function') {
        await Promise.resolve(mermaid.run({ nodes: [diagramEl] }));
      } else {
        const svg = await new Promise((resolve, reject) => {
          try {
            const maybe = mermaid.render(renderId, text, (svgCode) => resolve(svgCode));
            if (typeof maybe?.then === 'function') {
              maybe.then((result) => resolve(result?.svg || result || '')).catch(reject);
            } else if (typeof maybe === 'string') {
              resolve(maybe);
            }
          } catch (err) {
            reject(err);
          }
        });
        previewEl.innerHTML = String(svg || '');
      }
      if (block) setSpecialBlockError(block, '');
      return true;
    }

    if (kind === 'graphviz') {
      const renderer = await loadGraphvizRenderer();
      if (!renderer || typeof renderer.dot !== 'function') throw new Error('Graphviz unavailable');
      const svg = await Promise.resolve(renderer.dot(text));
      previewEl.innerHTML = String(svg || '');
      if (block) setSpecialBlockError(block, '');
      return true;
    }
  } catch (err) {
    previewEl.innerHTML = '';
    if (block) applySpecialBlockMode(block, 'code');
    if (block) setSpecialBlockError(block, err?.message || String(err) || 'Unable to render preview.');
    return false;
  }

  return false;
}

export async function enhanceMarkdownSpecialBlocks(root = document) {
  if (typeof document === 'undefined' || !root) return 0;
  const blocks = root.querySelectorAll?.('[data-markdown-special-block]') || [];
  let enhanced = 0;

  for (const block of blocks) {
    const kind = block.getAttribute('data-markdown-special-kind');
    if (!kind) continue;
    if (block.dataset.markdownSpecialStreaming === '1') continue;
    bindSpecialBlockActions(block);
    const previewEl = block.querySelector('[data-markdown-special-preview]');
    const codeEl = block.querySelector('[data-markdown-special-code] code');
    const source = String(codeEl?.textContent || '').trim();
    const ready = await renderSpecialPreview(kind, source, previewEl, block);
    if (ready) {
      block.dataset.markdownSpecialReady = '1';
      block.dataset.markdownSpecialState = 'preview';
      block.dataset.markdownSpecialCollapsed = '0';
      setSpecialBlockError(block, '');
      applySpecialBlockMode(block, block.dataset.markdownSpecialMode === 'code' ? 'code' : specialBlockMode);
      enhanced += 1;
      continue;
    }
    block.dataset.markdownSpecialState = 'code';
  }

  return enhanced;
}

function scheduleMarkdownEnhancement(root = document) {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !root) return;
  if (markdownEnhancementPending) return;
  markdownEnhancementPending = true;
  const run = async () => {
    markdownEnhancementPending = false;
    await enhanceMarkdownSpecialBlocks(root);
  };
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => { void run(); });
  } else {
    setTimeout(() => { void run(); }, 0);
  }
}

if (typeof window !== 'undefined' && !window.__growchatMarkdownSpecialBootstrap) {
  window.__growchatMarkdownSpecialBootstrap = true;
  window.addEventListener('load', () => {
    scheduleMarkdownEnhancement(document);
  }, { once: true });
}

function touchMarkdownCache(key, value) {
  markdownCache.delete(key);
  markdownCache.set(key, value);
  if (markdownCache.size <= MARKDOWN_CACHE_LIMIT) return;
  const firstKey = markdownCache.keys().next().value;
  if (firstKey) markdownCache.delete(firstKey);
}

function configureMarked() {
  const marked = globalThis?.window?.marked || globalThis?.marked;
  if (!marked || typeof marked.setOptions !== 'function') return;
  if (marked.__growchatConfigured) return;
  marked.setOptions({
    gfm: true,
    breaks: false,
    mangle: false,
    headerIds: false,
  });
  marked.__growchatConfigured = true;
}

function renderInlineTokens(tokens = []) {
  return (Array.isArray(tokens) ? tokens : []).map((token) => renderInlineToken(token)).join('');
}

function renderInlineToken(token) {
  if (!token) return '';
  const type = String(token.type || '');
  switch (type) {
    case 'escape':
    case 'text':
      return escapeHtml(decodeHtmlEntities(token.text ?? token.raw ?? '')).replace(/\n/g, ' ');
    case 'strong':
      return `<strong>${renderInlineTokens(token.tokens)}</strong>`;
    case 'em':
      return `<em>${renderInlineTokens(token.tokens)}</em>`;
    case 'del':
      return `<del>${renderInlineTokens(token.tokens)}</del>`;
    case 'codespan':
      return `<code class="gc-inline-code" data-markdown-inline-code>${escapeHtml(token.text ?? '')}</code>`;
    case 'br':
      return '<br />';
    case 'link': {
      const href = escapeHtml(token.href ?? '');
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
      return `<a href="${href}" target="_blank" rel="noopener noreferrer"${title}>${renderInlineTokens(token.tokens || []) || escapeHtml(token.text ?? '')}</a>`;
    }
    case 'image':
      return `<img src="${escapeHtml(token.href ?? '')}" alt="${escapeHtml(token.text ?? '')}" loading="lazy" />`;
    case 'html':
      return token.raw ?? token.text ?? '';
    default:
      if (Array.isArray(token.tokens)) {
        return renderInlineTokens(token.tokens);
      }
      return escapeHtml(token.text ?? token.raw ?? '');
  }
}

function renderCodeBlock(token, { interactive = true, streaming = false, specialBlockScope = '' } = {}) {
  const lang = String(token?.lang || '').trim();
  const kind = getSpecialBlockKind(lang);
  const langLabel = kind ? getSpecialBlockLabel(kind) : (lang || 'text');
  const isStreaming = Boolean(streaming);
  const sourceText = String(token?.text ?? '');
  const specialSession = resolveSpecialBlockSession(specialBlockScope);
  const specialMode = isStreaming ? 'code' : specialSession.mode;

  if (kind && isFullLatexDocument(sourceText)) {
    return renderPlainCodeBlock(token, {
      interactive,
      streaming,
      langLabel: lang || 'text',
      sourceLanguage: lang || 'text',
    });
  }

  if (kind) {
    const code = escapeHtml(sourceText);
    const sourceLanguage = getSpecialCodeLanguage(kind);
    const languageClass = sourceLanguage ? `language-${escapeHtml(sourceLanguage)}` : '';
    const scopeAttr = specialSession.scope ? ` data-markdown-special-scope="${escapeHtml(specialSession.scope)}"` : '';
    const codeHtml = `
      <div class="gc-markdown-special-code-shell ${specialMode === 'code' ? '' : 'hidden'}" data-markdown-special-code-shell>
        <pre class="gc-markdown-code-block" data-markdown-special-code><code class="${languageClass}">${code}</code></pre>
      </div>`;
    if (!interactive) {
      return `<div class="gc-markdown-special-shell gc-markdown-special-static" data-markdown-special-block${scopeAttr} data-markdown-special-kind="${escapeHtml(kind)}" data-markdown-special-mode="preview" data-markdown-special-streaming="${isStreaming ? '1' : '0'}"><div class="gc-markdown-special-preview" data-markdown-special-preview><div class="gc-markdown-special-placeholder">${escapeHtml(getSpecialPreviewPlaceholder(kind))}</div></div></div>`;
    }
    return `
      <div class="gc-markdown-special-shell" data-markdown-special-block${scopeAttr} data-markdown-special-kind="${escapeHtml(kind)}" data-markdown-special-mode="${escapeHtml(specialMode)}" data-markdown-special-streaming="${isStreaming ? '1' : '0'}" data-markdown-special-collapsed="0">
        <div class="gc-markdown-special-toolbar">
          <div class="gc-markdown-special-title">${escapeHtml(langLabel)}</div>
          <div class="gc-markdown-special-toolbar-actions">
            <div class="gc-markdown-special-tabs" role="tablist" aria-label="${escapeHtml(langLabel)} view mode">
              <button type="button" class="gc-markdown-special-tab" data-markdown-special-mode-btn="preview" aria-pressed="${specialMode === 'preview' ? 'true' : 'false'}" ${isStreaming ? 'disabled aria-disabled="true"' : ''}>Preview</button>
              <button type="button" class="gc-markdown-special-tab" data-markdown-special-mode-btn="code" aria-pressed="${specialMode === 'code' ? 'true' : 'false'}">Code</button>
            </div>
            <div class="gc-markdown-code-actions">
              <button type="button" class="gc-markdown-code-action" data-markdown-special-copy title="Copy code" aria-label="Copy code">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-3.5">
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
                </svg>
                <span>Copy</span>
              </button>
              <button type="button" class="gc-markdown-code-action" data-markdown-special-collapse title="Collapse code" aria-label="Collapse code" aria-expanded="true">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" class="size-3.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m6 15 6-6 6 6"></path>
                </svg>
                <span data-markdown-special-collapse-label>Collapse</span>
              </button>
            </div>
          </div>
        </div>
        ${codeHtml}
        <div class="gc-markdown-special-preview ${specialMode === 'code' ? 'hidden' : ''}" data-markdown-special-preview>
          <div class="gc-markdown-special-placeholder">${escapeHtml(getSpecialPreviewPlaceholder(kind))}</div>
        </div>
      </div>
    `; 
  }

  return renderPlainCodeBlock(token, {
    interactive,
    streaming,
    langLabel,
    sourceLanguage: lang || 'text',
  });
}

function renderTable(token, options = {}) {
  const header = (token.header || []).map((cell, idx) => {
    const align = token.align?.[idx] ? ` style="text-align:${token.align[idx]}"` : '';
    return `<th${align}>${renderInlineTokens(cell.tokens || [])}</th>`;
  }).join('');
  const rows = (token.rows || []).map((row) => {
    const cells = (row || []).map((cell, idx) => {
      const align = token.align?.[idx] ? ` style="text-align:${token.align[idx]}"` : '';
      return `<td${align}>${renderInlineTokens(cell.tokens || [])}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  return `
    <div class="gc-markdown-table-wrap">
      <table class="gc-markdown-table" dir="auto">
        <thead><tr>${header}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderListItem(item, options = {}) {
  const content = renderMarkdownTokens(item.tokens || [], options);
  const task = item.task ? `<input type="checkbox" disabled ${item.checked ? 'checked' : ''} />` : '';
  return `<li>${task}${content}</li>`;
}

function renderBlockquote(token, options = {}) {
  const content = renderMarkdownTokens(token.tokens || [], options);
  return `<blockquote dir="auto">${content}</blockquote>`;
}

function renderMarkdownToken(token, options = {}) {
  if (!token) return '';
  const type = String(token.type || '');
  switch (type) {
    case 'space':
      return '';
    case 'hr':
      return '<hr />';
    case 'heading':
      return `<h${token.depth || 1} dir="auto">${renderInlineTokens(token.tokens || [])}</h${token.depth || 1}>`;
    case 'paragraph':
      return `<p dir="auto">${renderInlineTokens(token.tokens || [])}</p>`;
    case 'text':
      return token.tokens ? renderInlineTokens(token.tokens) : `<p dir="auto">${escapeHtml(token.text ?? token.raw ?? '').replace(/\n/g, ' ')}</p>`;
    case 'code':
      return renderCodeBlock(token, options);
    case 'blockquote':
      return renderBlockquote(token, options);
    case 'list': {
      const listTag = token.ordered ? 'ol' : 'ul';
      const startAttr = token.ordered && token.start ? ` start="${token.start}"` : '';
      const items = (token.items || []).map((item) => renderListItem(item, options)).join('');
      return `<${listTag}${startAttr} dir="auto">${items}</${listTag}>`;
    }
    case 'table':
      return renderTable(token, options);
    case 'html':
      return token.raw ?? token.text ?? '';
    default:
      if (Array.isArray(token.tokens)) {
        return renderMarkdownTokens(token.tokens, options);
      }
      return escapeHtml(token.text ?? token.raw ?? '');
  }
}

export function renderMarkdownTokens(tokens = [], options = {}) {
  return (Array.isArray(tokens) ? tokens : []).map((token) => renderMarkdownToken(token, options)).join('');
}

function fallbackMarkdown(content) {
  const blocks = String(content ?? '').split(/(```[\s\S]*?```)/g);
  const parts = blocks.map((block) => {
    const trimmedBlock = block.trim();
    if (trimmedBlock.startsWith('```')) {
      const stripped = trimmedBlock.replace(/^```[^\n]*\n?/, '').replace(/```$/, '');
      const code = escapeHtml(stripped);
      return `<pre><code>${code}</code></pre>`;
    }
    const escaped = escapeHtml(block).trim();
    if (!escaped) return '';
    const paragraphs = escaped
      .split(/\n{2,}/)
      .map((part) => part.replace(/\n/g, ' ').trim())
      .filter(Boolean);
    return paragraphs.map((part) => `<p>${part}</p>`).join('');
  });
  return parts.join('');
}

/**
 * Sanitize HTML using DOMPurify
 * Allows markdown-safe tags while preventing XSS attacks
 */
function sanitizeHtml(html) {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'b', 'i', 'em', 'strong', 'a', 'code', 'pre', 'p', 'br',
      'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'blockquote', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'img', 'div', 'span', 'section', 'article', 'button',
      // Special blocks for markdown rendering
      'input', // for task checkboxes
      // Mermaid diagram support
      'svg', 'g', 'text', 'path', 'rect', 'circle', 'line', 'polyline', 'polygon',
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel', 'title', 'alt', 'src', 'width', 'height',
      'class', 'id', 'data-*', 'disabled', 'checked', 'type',
      // SVG attributes
      'viewBox', 'xmlns', 'fill', 'stroke', 'stroke-width', 'd', 'x', 'y', 'cx', 'cy', 'r', 'x1', 'y1', 'x2', 'y2',
    ],
    KEEP_CONTENT: true,
  });
}

function renderWithMarked(marked, content, options = {}) {
  if (!marked || typeof marked.lexer !== 'function') return fallbackMarkdown(content);
  try {
    const tokens = marked.lexer(content);
    const html = renderMarkdownTokens(tokens, options);
    // FIX: Sanitize rendered HTML to prevent XSS attacks
    return sanitizeHtml(html);
  } catch {
    return fallbackMarkdown(content);
  }
}

export function ensureMarkedReady({ timeoutMs = 1200, pollMs = 25 } = {}) {
  if (typeof window === 'undefined') return Promise.resolve(false);
  const hasMarked = () => Boolean(window.marked && typeof window.marked.lexer === 'function');
  if (hasMarked()) {
    configureMarked();
    return Promise.resolve(true);
  }
  if (markedReadyPromise) return markedReadyPromise;
  markedReadyPromise = new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (hasMarked()) {
        configureMarked();
        resolve(true);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        markedReadyPromise = null;
        resolve(false);
        return;
      }
      setTimeout(tick, pollMs);
    };
    tick();
  });
  return markedReadyPromise;
}

export function renderMarkdownContent(content, options = {}) {
  const normalized = normalizeMessageContent(content);
  const specialSession = resolveSpecialBlockSession(options.specialBlockScope || options.chatId || options.threadId || '');
  const marked = globalThis?.window?.marked || globalThis?.marked;
  if (marked && typeof marked.lexer === 'function') {
    configureMarked();
    const cacheKey = `${options.interactive === false ? '0' : '1'}:${options.streaming ? '1' : '0'}:${specialSession.scope}:${specialSession.mode}:${normalized}`;
    const cached = markdownCache.get(cacheKey);
    if (cached) {
      touchMarkdownCache(cacheKey, cached);
      if (!options.streaming && cached.includes('data-markdown-special-block')) scheduleMarkdownEnhancement(typeof document !== 'undefined' ? document : null);
      return cached;
    }
    const html = renderWithMarked(marked, normalized, options);
    touchMarkdownCache(cacheKey, html);
    if (!options.streaming && html.includes('data-markdown-special-block')) scheduleMarkdownEnhancement(typeof document !== 'undefined' ? document : null);
    return html;
  }
  const fallback = fallbackMarkdown(normalized);
  if (!options.streaming && fallback.includes('data-markdown-special-block')) scheduleMarkdownEnhancement(typeof document !== 'undefined' ? document : null);
  return fallback;
}

export function resetMarkdownSpecialBlockState() {
  specialBlockScopeKey = '';
  specialBlockMode = 'preview';
}

export {
  convertDisplayMathBlocks,
  isFullLatexDocument,
  applySpecialBlockModeToScope,
};

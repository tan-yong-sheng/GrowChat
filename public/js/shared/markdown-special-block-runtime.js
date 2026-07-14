/**
 * External runtime loaders and special block preview rendering for
 * KaTeX, Mermaid, and Graphviz code blocks.
 */

import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.6/dist/purify.es.mjs';

import { escapeHtml, normalizeSpecialBlockMode } from './markdown-shared.js';

import {
  getSpecialPreviewPlaceholder,
  setSpecialBlockError,
  applySpecialBlockMode,
  bindSpecialBlockActions,
} from './markdown-special-block-ui.js';

/**
 * Safely insert HTML into an element using DOMPurify.
 *
 * Library-generated output (KaTeX, Mermaid, Graphviz) is treated as untrusted
 * because it is produced from user-provided source and rendered into the DOM.
 * DOMPurify is the same sanitizer used by markdown-renderer.js and is kept
 * up to date with browser-specific parsing quirks that are unsafe to replicate
 * in a custom regex-based sanitizer.
 * @param {HTMLElement} el - Target element
 * @param {string} html - HTML string from a trusted library (KaTeX, Mermaid, etc.)
 */
export function setSafeHtml(el, html) {
  el.innerHTML = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, svg: true },
    ALLOW_DATA_ATTR: false,
  });
}

const externalScriptPromises = new Map();
const externalStylesheetPromises = new Map();
let graphvizRendererPromise = null;
let mermaidInitialized = false;
let katexRuntimePromise = null;
let mermaidRuntimePromise = null;
let graphvizRuntimePromise = null;

export function loadExternalScript(src) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(false);
  }
  const absoluteSrc = new URL(src, window.location.href).href;
  if (externalScriptPromises.has(absoluteSrc)) {
    return externalScriptPromises.get(absoluteSrc);
  }
  const existingScript = Array.from(document.querySelectorAll('script[src]')).find(
    (script) => script.src === absoluteSrc
  );
  const script = existingScript || document.createElement('script');
  if (!existingScript) {
    script.src = absoluteSrc;
    script.async = true;
    script.defer = true;
    script.dataset.growchatRuntime = '1';
  }
  const promise = new Promise((resolve, reject) => {
    if (script.dataset.growchatLoaded === '1') {
      resolve(true);
      return;
    }
    const onLoad = () => {
      script.dataset.growchatLoaded = '1';
      resolve(true);
    };
    const onError = () => {
      externalScriptPromises.delete(absoluteSrc);
      reject(new Error(`Failed to load runtime: ${absoluteSrc}`));
    };
    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });
  });
  externalScriptPromises.set(absoluteSrc, promise);
  if (!existingScript) {
    document.head.appendChild(script);
  }
  return promise;
}

export function loadExternalStylesheet(href) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(false);
  }
  const absoluteHref = new URL(href, window.location.href).href;
  if (externalStylesheetPromises.has(absoluteHref)) {
    return externalStylesheetPromises.get(absoluteHref);
  }
  const existingLink = Array.from(document.querySelectorAll('link[rel="stylesheet"][href]')).find(
    (link) => link.href === absoluteHref
  );
  const link = existingLink || document.createElement('link');
  if (!existingLink) {
    link.rel = 'stylesheet';
    link.href = absoluteHref;
    link.dataset.growchatRuntime = '1';
  }
  const promise = new Promise((resolve, reject) => {
    if (link.dataset.growchatLoaded === '1' || link.sheet) {
      link.dataset.growchatLoaded = '1';
      resolve(true);
      return;
    }
    const onLoad = () => {
      link.dataset.growchatLoaded = '1';
      resolve(true);
    };
    const onError = () => {
      externalStylesheetPromises.delete(absoluteHref);
      reject(new Error(`Failed to load stylesheet: ${absoluteHref}`));
    };
    link.addEventListener('load', onLoad, { once: true });
    link.addEventListener('error', onError, { once: true });
  });
  externalStylesheetPromises.set(absoluteHref, promise);
  if (!existingLink) {
    document.head.appendChild(link);
  }
  return promise;
}

function getGlobalGraphviz() {
  return (
    globalThis?.window?.Graphviz ||
    globalThis?.Graphviz ||
    globalThis?.window?.graphviz ||
    globalThis?.graphviz ||
    globalThis?.window?.['@hpcc-js/wasm']?.Graphviz ||
    globalThis?.['@hpcc-js/wasm']?.Graphviz ||
    globalThis?.window?.['@hpcc-js/wasm']?.graphviz ||
    globalThis?.['@hpcc-js/wasm']?.graphviz
  );
}

export async function ensureKatexRuntime() {
  const existing = globalThis?.window?.katex || globalThis?.katex;
  if (existing && typeof existing.renderToString === 'function') return true;
  if (!katexRuntimePromise) {
    katexRuntimePromise = Promise.all([
      loadExternalStylesheet('https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css'),
      loadExternalScript('https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js'),
    ])
      .then(() => {
        const katex = globalThis?.window?.katex || globalThis?.katex;
        if (!katex || typeof katex.renderToString !== 'function') {
          throw new Error('KaTeX unavailable');
        }
        return true;
      })
      .catch((err) => {
        katexRuntimePromise = null;
        throw err;
      });
  }
  return katexRuntimePromise;
}

export async function ensureMermaidRuntime() {
  const existing = globalThis?.window?.mermaid || globalThis?.mermaid;
  if (existing && (typeof existing.run === 'function' || typeof existing.render === 'function'))
    return true;
  if (!mermaidRuntimePromise) {
    mermaidRuntimePromise = loadExternalScript(
      'https://cdn.jsdelivr.net/npm/mermaid@11.0.2/dist/mermaid.min.js'
    )
      .then(() => {
        const mermaid = globalThis?.window?.mermaid || globalThis?.mermaid;
        if (
          !mermaid ||
          (typeof mermaid.run !== 'function' && typeof mermaid.render !== 'function')
        ) {
          throw new Error('Mermaid unavailable');
        }
        return true;
      })
      .catch((err) => {
        mermaidRuntimePromise = null;
        throw err;
      });
  }
  return mermaidRuntimePromise;
}

async function ensureGraphvizRuntime() {
  if (getGlobalGraphviz()) return true;
  if (!graphvizRuntimePromise) {
    graphvizRuntimePromise = loadExternalScript(
      'https://cdn.jsdelivr.net/npm/@hpcc-js/wasm@1.12.8/dist/index.js'
    )
      .then(() => {
        if (!getGlobalGraphviz()) {
          throw new Error('Graphviz renderer unavailable');
        }
        return true;
      })
      .catch((err) => {
        graphvizRuntimePromise = null;
        throw err;
      });
  }
  return graphvizRuntimePromise;
}

function loadGraphvizRenderer() {
  if (graphvizRendererPromise) return graphvizRendererPromise;
  graphvizRendererPromise = (async () => {
    await ensureGraphvizRuntime();
    const globalGraphviz = getGlobalGraphviz();
    const graphvizFactory = globalGraphviz?.Graphviz || globalGraphviz;
    if (graphvizFactory?.dot) {
      return graphvizFactory;
    }
    if (graphvizFactory?.load) {
      const renderer = await graphvizFactory.load();
      return renderer || graphvizFactory;
    }
    throw new Error('Graphviz renderer unavailable');
  })().catch((err) => {
    graphvizRendererPromise = null;
    throw err;
  });
  return graphvizRendererPromise;
}

function setPreviewEmpty(previewEl, block, kind) {
  previewEl.innerHTML = `<div class="gc-markdown-special-placeholder">${escapeHtml(getSpecialPreviewPlaceholder(kind))}</div>`;
  if (block) setSpecialBlockError(block, '');
}

function handlePreviewError(previewEl, block, err) {
  previewEl.innerHTML = '';
  if (block) applySpecialBlockMode(block, 'code');
  if (block)
    setSpecialBlockError(block, err?.message || String(err) || 'Unable to render preview.');
}

async function renderKatexPreview(text, previewEl, block) {
  await ensureKatexRuntime();
  const katex = globalThis?.window?.katex || globalThis?.katex;
  if (!katex || typeof katex.renderToString !== 'function') {
    throw new Error('KaTeX unavailable');
  }
  setSafeHtml(
    previewEl,
    katex.renderToString(text, {
      displayMode: true,
      throwOnError: true,
      output: 'html',
    })
  );
  if (block) setSpecialBlockError(block, '');
}

function initMermaidIfNeeded(mermaid) {
  if (!mermaidInitialized && typeof mermaid.initialize === 'function') {
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default' });
    mermaidInitialized = true;
  }
}

async function renderMermaidWithRun(mermaid, text, previewEl, renderId) {
  previewEl.innerHTML = `<div class="mermaid" data-markdown-special-diagram="${renderId}">${escapeHtml(text)}</div>`;
  const diagramEl = previewEl.querySelector('[data-markdown-special-diagram]');
  await Promise.resolve(mermaid.run({ nodes: [diagramEl] }));
}

function invokeMermaidRender(mermaid, renderId, text, resolve, reject) {
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
}

async function renderMermaidWithLegacy(mermaid, text, renderId) {
  const svg = await new Promise((resolve, reject) =>
    invokeMermaidRender(mermaid, renderId, text, resolve, reject)
  );
  return String(svg || '');
}

async function runMermaidRender(mermaid, text, previewEl, renderId) {
  if (typeof mermaid.run === 'function') {
    await renderMermaidWithRun(mermaid, text, previewEl, renderId);
    return;
  }
  const svg = await renderMermaidWithLegacy(mermaid, text, renderId);
  setSafeHtml(previewEl, svg);
}

async function renderMermaidPreview(text, previewEl, block) {
  await ensureMermaidRuntime();
  const mermaid = globalThis?.window?.mermaid || globalThis?.mermaid;
  if (!mermaid || (typeof mermaid.run !== 'function' && typeof mermaid.render !== 'function')) {
    throw new Error('Mermaid unavailable');
  }
  initMermaidIfNeeded(mermaid);
  const renderId = `gc-mermaid-${block?.dataset?.markdownSpecialId || crypto.randomUUID()}`;
  await runMermaidRender(mermaid, text, previewEl, renderId);
  if (block) setSpecialBlockError(block, '');
}

async function renderGraphvizPreview(text, previewEl, block) {
  const renderer = await loadGraphvizRenderer();
  if (!renderer || typeof renderer.dot !== 'function') throw new Error('Graphviz unavailable');
  const svg = await Promise.resolve(renderer.dot(text));
  setSafeHtml(previewEl, String(svg || ''));
  if (block) setSpecialBlockError(block, '');
}

export async function renderSpecialPreview(kind, source, previewEl, block) {
  if (!previewEl) return false;
  const text = String(source ?? '').trim();
  if (!text) {
    setPreviewEmpty(previewEl, block, kind);
    return false;
  }
  try {
    if (kind === 'katex') {
      await renderKatexPreview(text, previewEl, block);
      return true;
    }
    if (kind === 'mermaid') {
      await renderMermaidPreview(text, previewEl, block);
      return true;
    }
    if (kind === 'graphviz') {
      await renderGraphvizPreview(text, previewEl, block);
      return true;
    }
  } catch (err) {
    handlePreviewError(previewEl, block, err);
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
      applySpecialBlockMode(
        block,
        block.dataset.markdownSpecialMode === 'code' ? 'code' : normalizeSpecialBlockMode(null)
      );
      enhanced += 1;
      continue;
    }
    block.dataset.markdownSpecialState = 'code';
  }
  return enhanced;
}

let markdownEnhancementPending = false;

export function scheduleMarkdownEnhancement(root = document) {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !root) return;
  if (markdownEnhancementPending) return;
  markdownEnhancementPending = true;
  const run = async () => {
    markdownEnhancementPending = false;
    await enhanceMarkdownSpecialBlocks(root);
  };
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => {
      void run();
    });
  } else {
    setTimeout(() => {
      void run();
    }, 0);
  }
}

export function getMarkdownEnhancementPending() {
  return markdownEnhancementPending;
}

export function setMarkdownEnhancementPending(value) {
  markdownEnhancementPending = value;
}

if (typeof window !== 'undefined' && !window.__growchatMarkdownSpecialBootstrap) {
  window.__growchatMarkdownSpecialBootstrap = true;
  window.addEventListener(
    'load',
    () => {
      scheduleMarkdownEnhancement(document);
    },
    { once: true }
  );
}

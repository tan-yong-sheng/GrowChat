import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.6/dist/purify.es.mjs';
import { applySpecialBlockModeToScope } from './markdown-special-block-ui.js';
import {
  scheduleMarkdownEnhancement,
  enhanceMarkdownSpecialBlocks,
} from './markdown-special-block-runtime.js';
import { renderMarkdownTokens } from './markdown-token-renderer.js';
import {
  escapeHtml,
  decodeHtmlEntities,
  convertDisplayMathBlocks,
  resolveSpecialBlockSession,
  resetSpecialBlockState,
} from './markdown-shared.js';

const MARKDOWN_CACHE_LIMIT = 200;
const markdownCache = new Map();
let markedReadyPromise = null;

// Re-export shared utilities for backward compatibility
export {
  escapeHtml,
  decodeHtmlEntities,
  normalizeSpecialBlockScope,
  normalizeSpecialBlockMode,
  isFullLatexDocument,
  convertDisplayMathBlocks,
  resolveSpecialBlockSession,
  resetSpecialBlockState,
} from './markdown-shared.js';

export function normalizeMessageContent(content) {
  const normalized = String(content ?? '').replace(/\r\n?/g, '\n');
  return convertDisplayMathBlocks(decodeHtmlEntities(decodeHtmlEntities(normalized)));
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
      'b',
      'i',
      'em',
      'strong',
      'a',
      'code',
      'pre',
      'p',
      'br',
      'ul',
      'ol',
      'li',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'blockquote',
      'hr',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'img',
      'div',
      'span',
      'section',
      'article',
      'button',
      // Special blocks for markdown rendering
      'input', // for task checkboxes
      // Mermaid diagram support
      'svg',
      'g',
      'text',
      'path',
      'rect',
      'circle',
      'line',
      'polyline',
      'polygon',
    ],
    ALLOWED_ATTR: [
      'href',
      'target',
      'rel',
      'title',
      'alt',
      'src',
      'width',
      'height',
      'class',
      'id',
      'data-*',
      'disabled',
      'checked',
      'type',
      // SVG attributes
      'viewBox',
      'xmlns',
      'fill',
      'stroke',
      'stroke-width',
      'd',
      'x',
      'y',
      'cx',
      'cy',
      'r',
      'x1',
      'y1',
      'x2',
      'y2',
    ],
    KEEP_CONTENT: true,
  });
}

function renderWithMarked(marked, content, options = {}) {
  if (!marked || typeof marked.lexer !== 'function') return fallbackMarkdown(content);
  try {
    const tokens = marked.lexer(content);
    const html = renderMarkdownTokens(tokens, options);
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
  const specialSession = resolveSpecialBlockSession(
    options.specialBlockScope || options.chatId || options.threadId || ''
  );
  const marked = globalThis?.window?.marked || globalThis?.marked;
  if (marked && typeof marked.lexer === 'function') {
    configureMarked();
    const cacheKey = `${options.interactive === false ? '0' : '1'}:${options.streaming ? '1' : '0'}:${specialSession.scope}:${specialSession.mode}:${normalized}`;
    const cached = markdownCache.get(cacheKey);
    if (cached) {
      touchMarkdownCache(cacheKey, cached);
      if (!options.streaming && cached.includes('data-markdown-special-block'))
        scheduleMarkdownEnhancement(typeof document !== 'undefined' ? document : null);
      return cached;
    }
    const html = renderWithMarked(marked, normalized, options);
    touchMarkdownCache(cacheKey, html);
    if (!options.streaming && html.includes('data-markdown-special-block'))
      scheduleMarkdownEnhancement(typeof document !== 'undefined' ? document : null);
    return html;
  }
  const fallback = fallbackMarkdown(normalized);
  if (!options.streaming && fallback.includes('data-markdown-special-block'))
    scheduleMarkdownEnhancement(typeof document !== 'undefined' ? document : null);
  return fallback;
}

export function resetMarkdownSpecialBlockState() {
  resetSpecialBlockState();
}

export { applySpecialBlockModeToScope, enhanceMarkdownSpecialBlocks };

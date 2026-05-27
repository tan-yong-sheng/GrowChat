import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.6/dist/purify.es.mjs';
import { applySpecialBlockModeToScope } from './markdown-special-block-ui.js';
import {
  scheduleMarkdownEnhancement,
  enhanceMarkdownSpecialBlocks,
} from './markdown-special-block-runtime.js';
import { renderMarkdownTokens } from './markdown-token-renderer.js';

const MARKDOWN_CACHE_LIMIT = 200;
const markdownCache = new Map();
let markedReadyPromise = null;
let specialBlockScopeKey = '';
let specialBlockMode = 'preview';

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function decodeHtmlEntities(content) {
  if (typeof document === 'undefined') return String(content ?? '');
  const textarea = document.createElement('textarea');
  textarea.innerHTML = String(content ?? '');
  return textarea.value;
}

export function normalizeMessageContent(content) {
  const normalized = String(content ?? '').replace(/\r\n?/g, '\n');
  return convertDisplayMathBlocks(decodeHtmlEntities(decodeHtmlEntities(normalized)));
}

export function normalizeSpecialBlockScope(scope) {
  return String(scope ?? '').trim();
}

export function normalizeSpecialBlockMode(mode) {
  return mode === 'code' ? 'code' : 'preview';
}

export function resolveSpecialBlockSession(scope) {
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

export function isFullLatexDocument(content) {
  const text = String(content ?? '');
  return FULL_LATEX_DOCUMENT_PATTERNS.some((pattern) => pattern.test(text));
}

function matchDisplayMathDelimiter(trimmedLine) {
  return (
    DISPLAY_MATH_DELIMITERS.find(
      (delimiter) =>
        trimmedLine === delimiter.open ||
        (trimmedLine.startsWith(delimiter.open) &&
          trimmedLine.endsWith(delimiter.close) &&
          trimmedLine.length > delimiter.open.length + delimiter.close.length)
    ) || null
  );
}

export function convertDisplayMathBlocks(content) {
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
  specialBlockScopeKey = '';
  specialBlockMode = 'preview';
}

export { applySpecialBlockModeToScope, enhanceMarkdownSpecialBlocks };

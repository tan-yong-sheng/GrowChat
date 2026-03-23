export function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

const MARKDOWN_CACHE_LIMIT = 200;
const markdownCache = new Map();
let markedReadyPromise = null;

function normalizeMessageContent(content) {
  return String(content ?? '').replace(/\r\n?/g, '\n');
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

export function ensureMarkedReady({ timeoutMs = 1200, pollMs = 25 } = {}) {
  if (typeof window === 'undefined') return Promise.resolve(false);
  const hasMarked = () => Boolean(window.marked && typeof window.marked.parse === 'function');
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

export function renderMessageContent(content) {
  if (!content) return '<span class="inline-block w-2 h-4 bg-gray-400 animate-pulse rounded-sm"></span>';
  const normalized = normalizeMessageContent(content);
  const marked = globalThis?.window?.marked || globalThis?.marked;
  if (marked && typeof marked.parse === 'function') {
    configureMarked();
    const cached = markdownCache.get(normalized);
    if (cached) {
      touchMarkdownCache(normalized, cached);
      return cached;
    }
    try {
      const html = marked.parse(normalized);
      touchMarkdownCache(normalized, html);
      return html;
    } catch {
      return fallbackMarkdown(normalized);
    }
  }
  return fallbackMarkdown(normalized);
}

export class SseLineParser {
  constructor(onEvent = null) {
    this._buf = '';
    this._onEvent = typeof onEvent === 'function' ? onEvent : null;
  }

  push(rawText) {
    this._buf += rawText;
    let text = '';
    let newlineIdx;
    while ((newlineIdx = this._buf.indexOf('\n')) !== -1) {
      const line = this._buf.slice(0, newlineIdx).replace(/\r$/, '');
      this._buf = this._buf.slice(newlineIdx + 1);

      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (!payload || payload === '[DONE]') continue;

      try {
        const parsed = JSON.parse(payload);
        if (this._onEvent) this._onEvent(parsed);
        text += parsed.response || parsed.choices?.[0]?.delta?.content || '';
      } catch {
        // Incomplete JSON
      }
    }
    return text;
  }

  flush() {
    const line = this._buf.replace(/\r$/, '');
    this._buf = '';
    if (!line.startsWith('data: ')) return '';
    const payload = line.slice(6).trim();
    if (!payload || payload === '[DONE]') return '';
    try {
      const parsed = JSON.parse(payload);
      if (this._onEvent) this._onEvent(parsed);
      return parsed.response || parsed.choices?.[0]?.delta?.content || '';
    } catch {
      return '';
    }
  }
}

export function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;
  
  const day = 24 * 60 * 60 * 1000;
  
  if (diff < day && now.getDate() === date.getDate()) {
    return 'Today';
  } else if (diff < 2 * day) {
    return 'Yesterday';
  } else if (diff < 7 * day) {
    return 'Previous 7 days';
  } else if (diff < 30 * day) {
    return 'Previous 30 days';
  } else {
    return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
}

export function formatTimestamp(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exp = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const num = value / Math.pow(1024, exp);
  return `${num >= 10 ? num.toFixed(0) : num.toFixed(1)} ${units[exp]}`;
}

export function showToast(message, duration = 3000) {
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

export function showToastProgress(initialMessage) {
  const toast = document.createElement('div');
  toast.className = 'fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 bg-black text-white text-sm font-medium rounded-full shadow-lg z-[99999] transition-opacity duration-300 opacity-0';
  toast.textContent = initialMessage;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.remove('opacity-0'));

  let closeTimeout = null;
  let removed = false;

  const close = () => {
    if (removed) return;
    removed = true;
    toast.classList.add('opacity-0');
    setTimeout(() => toast.remove(), 300);
  };

  const update = (message, duration = 3000) => {
    if (removed) return;
    toast.textContent = message;
    if (closeTimeout) clearTimeout(closeTimeout);
    if (duration > 0) {
      closeTimeout = setTimeout(close, duration);
    }
  };

  return { update, close, element: toast };
}

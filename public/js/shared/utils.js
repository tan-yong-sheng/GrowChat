import { ensureMarkedReady, renderMarkdownContent } from './markdown-renderer.js';

export { ensureMarkedReady } from './markdown-renderer.js';

export function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function renderMessageContent(content, options = {}) {
  if (!content) return '<span class="inline-block w-2 h-4 bg-gray-400 animate-pulse rounded-sm"></span>';
  return renderMarkdownContent(content, options);
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
  if (Number.isNaN(date.getTime())) return '';
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

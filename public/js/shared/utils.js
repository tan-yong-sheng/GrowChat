// fallow-ignore-file code-duplication: parallel cross-boundary helper, intentional
const SSE_PREFIX_LENGTH = 6;
const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;
const MS_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND;

/* eslint-disable-next-line no-magic-numbers -- 7-day week is a standard named constant */
const DAYS_7_MS = 7 * MS_DAY;
/* eslint-disable-next-line no-magic-numbers -- 30-day month threshold is a standard named constant */
const DAYS_30_MS = 30 * MS_DAY;

const KILOBYTE = 1024;
const BYTE_DISPLAY_THRESHOLD = 10;

import { renderMarkdownContent } from './markdown-renderer.js';

export { ensureMarkedReady } from './markdown-renderer.js';

export { escapeHtml, escapeHtmlLoose } from './utils/dom-escape.js';

export function renderMessageContent(content, options = {}) {
  if (!content)
    return '<span class="inline-block w-2 h-4 bg-gray-400 animate-pulse rounded-sm"></span>';
  return renderMarkdownContent(content, options);
}

function pickSseText(parsed) {
  return parsed.response || parsed.choices?.[0]?.delta?.content || '';
}

function extractSseDelta(line, onEvent) {
  if (!line.startsWith('data: ')) return null;
  const payload = line.slice(SSE_PREFIX_LENGTH).trim();
  if (!payload || payload === '[DONE]') return null;
  let parsed;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }
  if (onEvent) onEvent(parsed);
  return pickSseText(parsed);
}

export class SseLineParser {
  constructor(onEvent = null) {
    this._buf = '';
    this._onEvent = typeof onEvent === 'function' ? onEvent : null;
  }

  // fallow-ignore-next-line code-duplication
  push(rawText) {
    this._buf += rawText;
    let text = '';
    let newlineIdx;
    while ((newlineIdx = this._buf.indexOf('\n')) !== -1) {
      const line = this._buf.slice(0, newlineIdx).replace(/\r$/, '');
      this._buf = this._buf.slice(newlineIdx + 1);
      const delta = extractSseDelta(line, this._onEvent);
      if (delta) text += delta;
    }
    return text;
  }

  flush() {
    const line = this._buf.replace(/\r$/, '');
    this._buf = '';
    return extractSseDelta(line, this._onEvent) ?? '';
  }
}

export function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const diff = now - date;

  if (diff < MS_DAY && now.getDate() === date.getDate()) {
    return 'Today';
  } else if (diff < 2 * MS_DAY) {
    return 'Yesterday';
  } else if (diff < DAYS_7_MS) {
    return 'Previous 7 days';
  } else if (diff < DAYS_30_MS) {
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
  const exp = Math.min(Math.floor(Math.log(value) / Math.log(KILOBYTE)), units.length - 1);
  const num = value / Math.pow(KILOBYTE, exp);
  return `${num >= BYTE_DISPLAY_THRESHOLD ? num.toFixed(0) : num.toFixed(1)} ${units[exp]}`;
}

export { showToast, showToastProgress } from './utils/toast.js';

/**
 * Normalize a tool's name, title, and description fields by trimming whitespace.
 * Shared pattern used by both frontend tool selection and backend tool serialization.
 *
 * @param {object} tool - The tool object to normalize
 * @returns {object} A new object with name, title, description trimmed
 */
export function normalizeToolNames(tool = {}) {
  return {
    ...tool,
    name: String(tool.name || '').trim(),
    title: String(tool.title || '').trim(),
    description: String(tool.description || '').trim(),
  };
}

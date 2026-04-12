import { escapeHtml } from './dom-escape.js';

function normalizeTraceValue(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry || '').trim())
      .filter(Boolean)
      .join(' | ');
  }
  return String(value || '').trim();
}

export function buildTraceAttrs(attrs = {}) {
  const entries = [];
  const add = (key, value) => {
    const normalized = normalizeTraceValue(value);
    if (!normalized) return;
    entries.push(`data-trace-${key}="${escapeHtml(normalized)}"`);
  };

  add('route', attrs.route);
  add('scope', attrs.scope);
  add('family', attrs.family);
  add('owner', attrs.owner);
  add('action', attrs.action);
  add('target', attrs.target);
  add('read', attrs.read);
  add('write', attrs.write);
  add('invalidation', attrs.invalidation);
  add('note', attrs.note);

  return entries.length ? ` ${entries.join(' ')}` : '';
}

import { TEXT_LIKE_ACCEPT_TYPES, getAllowedAttachmentKinds, getAllowedNonLocalKinds } from '../../shared/utils/attachment-types.js';

export function getAttachmentAcceptTypes(currentState) {
  const allowedKinds = getAllowedAttachmentKinds(currentState, { localTextLabel: 'text-local' });
  const accepts = [];
  if (allowedKinds.includes('image')) accepts.push('image/*');
  if (allowedKinds.includes('pdf')) accepts.push('application/pdf');
  if (allowedKinds.includes('text-local')) accepts.push(...TEXT_LIKE_ACCEPT_TYPES);
  return {
    allowedKinds,
    allowedNonLocalKinds: getAllowedNonLocalKinds(currentState),
    accepts,
  };
}

export function extractPromptVariables(text) {
  const matches = String(text).match(/\{\{([a-zA-Z0-9_ -]+)\}\}/g) || [];
  return [...new Set(matches.map((m) => m.slice(2, -2).trim()).filter(Boolean))];
}

export function applyPromptVariables(text, resolveValue) {
  let output = String(text || '');
  const vars = extractPromptVariables(output);
  vars.forEach((variable) => {
    const resolver = typeof resolveValue === 'function' ? resolveValue : () => '';
    const value = resolver(variable) ?? '';
    output = output.replaceAll(`{{${variable}}}`, String(value));
  });
  return output;
}

export function filterPromptsByQuery(prompts = [], query = '') {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) return Array.isArray(prompts) ? prompts : [];
  return (Array.isArray(prompts) ? prompts : []).filter((prompt) => {
    const cmd = String(prompt?.command || '').toLowerCase();
    const title = String(prompt?.title || '').toLowerCase();
    return cmd.includes(normalizedQuery) || title.includes(normalizedQuery);
  });
}

export function moveQueueItem(queue, id, direction) {
  const list = Array.isArray(queue) ? [...queue] : [];
  const idx = list.findIndex((item) => item.id === id);
  if (idx < 0) return Array.isArray(queue) ? queue : list;
  if (direction === 'up' && idx > 0) {
    [list[idx - 1], list[idx]] = [list[idx], list[idx - 1]];
  } else if (direction === 'down' && idx < list.length - 1) {
    [list[idx], list[idx + 1]] = [list[idx + 1], list[idx]];
  } else {
    return Array.isArray(queue) ? queue : list;
  }
  return list;
}

export function promoteQueueItem(queue, id) {
  const list = Array.isArray(queue) ? [...queue] : [];
  const idx = list.findIndex((item) => item.id === id);
  if (idx <= 0) return Array.isArray(queue) ? queue : list;
  const [item] = list.splice(idx, 1);
  list.unshift(item);
  return list;
}

export function removeQueueItem(queue, id) {
  return (Array.isArray(queue) ? queue : []).filter((item) => item.id !== id);
}

function escapeHtml(value) {
  return String(value ?? '').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function renderAttachmentListMarkup(list = []) {
  if (!Array.isArray(list) || list.length === 0) return '';
  return list.map((file) => {
    const label = String(file?.filename || file?.name || 'Attachment');
    const id = String(file?.id || '');
    return `
      <div class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 text-xs text-gray-700 border border-gray-200">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <span class="max-w-[160px] truncate">${escapeHtml(label)}</span>
        <button type="button" data-attachment-remove="${id}" class="text-gray-400 hover:text-gray-700 transition">✕</button>
      </div>
    `;
  }).join('');
}

export function renderPendingQueueMarkup(pendingQueue = []) {
  if (!Array.isArray(pendingQueue) || !pendingQueue.length) return '';
  return pendingQueue.map((item, idx) => `
    <div class="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm">
      <span class="text-[11px] text-gray-400 font-semibold">#${idx + 1}</span>
      <span class="flex-1 truncate text-gray-700">${escapeHtml(item.text)}</span>
      <button type="button" data-q-send-now="${item.id}" class="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded" title="Send next">
        ↟
      </button>
      <button type="button" data-q-up="${item.id}" class="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded ${idx === 0 ? 'opacity-30 pointer-events-none' : ''}" title="Move up">
        ↑
      </button>
      <button type="button" data-q-down="${item.id}" class="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded ${idx === pendingQueue.length - 1 ? 'opacity-30 pointer-events-none' : ''}" title="Move down">
        ↓
      </button>
      <button type="button" data-q-edit="${item.id}" class="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded" title="Edit">
        ✎
      </button>
      <button type="button" data-q-delete="${item.id}" class="p-1 text-red-500 hover:text-red-600 hover:bg-red-50 rounded" title="Delete">
        ✕
      </button>
    </div>
  `).join('');
}

export function renderPromptPickerMarkup(promptOptions = [], promptIndex = 0) {
  if (!Array.isArray(promptOptions) || !promptOptions.length) {
    return '<div class="px-3 py-2 text-xs text-gray-500">No matching prompts</div>';
  }
  return promptOptions.slice(0, 8).map((item, idx) => `
    <button data-prompt-idx="${idx}" class="w-full text-left px-3 py-2 border-b border-gray-100 last:border-b-0 ${idx === promptIndex ? 'bg-gray-100' : 'hover:bg-gray-50'}">
      <div class="text-sm font-medium text-gray-800">/${item.command || 'prompt'}</div>
      <div class="text-xs text-gray-500 truncate">${item.title || ''}</div>
    </button>
  `).join('');
}


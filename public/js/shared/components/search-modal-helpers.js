import { formatDate } from '../utils.js';

function escapeHtml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function highlightText(text, query) {
  if (!query) return escapeHtml(text);
  const pureQuery = query.replace(/(pinned|shared|archived):\S*/gi, '').trim();
  if (!pureQuery) return escapeHtml(text);
  const regex = new RegExp(`(${pureQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return escapeHtml(text).replace(
    regex,
    '<span class="bg-yellow-200 text-yellow-900 rounded-sm">$1</span>'
  );
}

export function normalizeBackendQuery(query) {
  return String(query || '')
    .replace(/(pinned|shared|archived):\S*/gi, '')
    .trim();
}

export function getSearchChatDateLabel(dateString) {
  if (!dateString) return 'Unknown date';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime()) || date.getFullYear() <= 1970) return 'Unknown date';
  const label = formatDate(dateString);
  return label || 'Unknown date';
}

export function groupChatsByDate(chats) {
  const groups = {};
  chats.forEach((chat) => {
    const dateLabel = getSearchChatDateLabel(chat.updated_at || chat.created_at);
    if (!groups[dateLabel]) groups[dateLabel] = [];
    groups[dateLabel].push(chat);
  });
  return groups;
}

export function renderSearchEmptyStateMarkup(query = '') {
  return `
    <div class="px-3 py-12 text-center">
      <div class="text-gray-300 mb-3 flex justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      </div>
      <p class="text-xs text-gray-400 font-medium">${query ? 'No results found' : 'No recent chats'}</p>
    </div>
  `;
}

export function renderSearchResultsMarkup(results = [], query = '') {
  const groups = groupChatsByDate(results);
  return Object.entries(groups)
    .map(
      ([label, groupChats]) => `
    <div class="mt-4 first:mt-0">
      <div class="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">${label}</div>
      <div class="space-y-1.5">
        ${groupChats
          .map((c) => {
            const idx = results.findIndex((rc) => rc.id === c.id);
            const dateLabel = getSearchChatDateLabel(c.updated_at || c.created_at);
            return `
            <button data-search-chat="${c.id}" data-index="${idx}" class="search-item w-full text-left px-3 py-3 rounded-2xl transition flex items-center gap-3 text-sm group outline-none focus:bg-gray-100 hover:bg-gray-50" role="option">
              <div class="flex-shrink-0 w-8 h-8 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400 group-hover:bg-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </div>
              <div class="flex-grow min-w-0 flex flex-col">
                <span class="truncate font-medium text-gray-700 group-hover:text-gray-900">${highlightText(c.title, query)}</span>
                ${dateLabel === 'Unknown date' ? '' : `<span class="text-[10px] text-gray-400">${dateLabel}</span>`}
              </div>
            </button>
          `;
          })
          .join('')}
      </div>
    </div>
  `
    )
    .join('');
}

import { groupChatsByTime } from '../../shared/utils/time-grouping.js';
import { buildChatRows } from './chat-render-helpers.js';
import { appendEmptyChatStateItem } from './chat-sidebar-helpers.js';

export function buildChatSidebarListFragment({
  chats = [],
  activeId = null,
  models = [],
  state,
  isPinnedSectionCollapsed = false,
  onPinnedToggle = () => {},
  getChatHandlers = () => () => ({}),
  buildChatRowsFn = buildChatRows,
} = {}) {
  const mainListChats = chats;
  const pinnedChats = mainListChats.filter((c) => Number(c.pinned) === 1);
  const regularChats = mainListChats.filter((c) => Number(c.pinned) !== 1);
  const groups = groupChatsByTime(regularChats);
  const groupLabels = {
    today: 'Today',
    yesterday: 'Yesterday',
    lastWeek: 'Last 7 Days',
    older: 'Older',
  };

  const fragment = document.createDocumentFragment();

  if (mainListChats.length === 0 && !state?.chatsPagination?.loading) {
    appendEmptyChatStateItem(fragment);
  }

  if (pinnedChats.length > 0) {
    const pinnedHeader = document.createElement('button');
    pinnedHeader.type = 'button';
    pinnedHeader.className =
      'chat-group-header sidebar-full-only pinned flex items-center gap-1.5 cursor-pointer select-none hover:text-gray-600 transition-colors';
    pinnedHeader.innerHTML =
      '<svg class="w-3.5 h-3.5 transition-transform ' +
      (isPinnedSectionCollapsed ? '-rotate-90' : '') +
      '" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.1 1.02l-4.25 4.5a.75.75 0 0 1-1.1 0l-4.25-4.5a.75.75 0 0 1 .02-1.04Z" clip-rule="evenodd" /></svg><span>Pinned</span>';
    pinnedHeader.addEventListener('click', onPinnedToggle);
    fragment.appendChild(pinnedHeader);

    if (!isPinnedSectionCollapsed) {
      const pinnedContainer = document.createElement('div');
      pinnedContainer.className = 'chat-group-items';
      pinnedContainer.appendChild(buildChatRowsFn(pinnedChats, activeId, models, getChatHandlers));
      fragment.appendChild(pinnedContainer);
    }
  }

  Object.entries(groups).forEach(([key, groupChats]) => {
    if (groupChats.length === 0) return;

    const header = document.createElement('div');
    header.className = 'chat-group-header sidebar-full-only ' + key;
    header.textContent = groupLabels[key];
    fragment.appendChild(header);

    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'chat-group-items';
    itemsContainer.appendChild(buildChatRowsFn(groupChats, activeId, models, getChatHandlers));
    fragment.appendChild(itemsContainer);
  });

  if (state?.chatsPagination?.loading) {
    const loadingRow = document.createElement('li');
    loadingRow.className = 'px-3 py-3 text-xs text-gray-600';
    loadingRow.textContent = 'Loading more chats...';
    fragment.appendChild(loadingRow);
  } else if (state?.chatsPagination?.hasMore) {
    const sentinel = document.createElement('li');
    sentinel.id = 'chat-list-load-more';
    sentinel.className = 'h-6';
    fragment.appendChild(sentinel);
  }

  return fragment;
}

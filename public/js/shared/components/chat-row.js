import { formatRelativeTime } from '../utils/time-grouping.js';
import { escapeHtml } from '../utils.js';
import { setupDropdownKeyboard } from '../utils/dropdown-keyboard.js';

// ── Dropdown positioning constants ──
const DROPDOWN_SPACING_PX = 4;
const MIN_EDGE_MARGIN_PX = 8;
const DROPDOWN_WIDTH_OFFSET_PX = 180;

function positionDropdown(dropdown, menuBtn, content) {
  let rect = menuBtn.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    rect = content.getBoundingClientRect();
  }
  dropdown.style.position = 'fixed';
  dropdown.style.top = `${rect.bottom + DROPDOWN_SPACING_PX}px`;
  dropdown.style.left = `${Math.max(MIN_EDGE_MARGIN_PX, rect.right - DROPDOWN_WIDTH_OFFSET_PX)}px`;

  requestAnimationFrame(() => {
    const dropRect = dropdown.getBoundingClientRect();
    if (dropRect.bottom > window.innerHeight) {
      dropdown.style.top = `${rect.top - dropRect.height - DROPDOWN_SPACING_PX}px`;
    }
  });
}

function handleChatRowKeydown(e, dropdown, handlers, chatId) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    if (handlers.onClick) handlers.onClick(chatId);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    if (!dropdown.classList.contains('hidden')) {
      dropdown.classList.add('hidden');
    }
  }
}

function toggleChatMenu(e, dropdown, menuBtn, content) {
  e.stopPropagation();

  document.querySelectorAll('.chat-menu-dropdown:not(.hidden)').forEach((el) => {
    if (el !== dropdown) el.classList.add('hidden');
  });

  if (dropdown.classList.contains('hidden')) {
    dropdown.classList.remove('hidden');
    positionDropdown(dropdown, menuBtn, content);
  } else {
    dropdown.classList.add('hidden');
  }
}

function setupCloseOnOutsideClick(dropdown, element) {
  const closeDropdown = (e) => {
    if (!dropdown.classList.contains('hidden') && !element.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  };
  document.addEventListener('click', closeDropdown);
  document.querySelector('#chat-list')?.parentElement?.addEventListener('scroll', () => {
    if (!dropdown.classList.contains('hidden')) {
      dropdown.classList.add('hidden');
    }
  });
}

function handleChatRowClick(chat, handlers) {
  if (handlers.onClick) handlers.onClick(chat.id);
}

async function handleDropdownClick(e, dropdown, chat, handlers) {
  const actionBtn = e.target.closest('button[data-action]');
  if (!actionBtn) return;

  e.stopPropagation();
  const action = actionBtn.dataset.action;

  const CHAT_ROW_ACTIONS = ['share', 'rename', 'pin', 'duplicate', 'archive', 'delete'];
  for (const key of CHAT_ROW_ACTIONS) {
    if (action === key && handlers[key]) {
      await handlers[key](chat.id);
      break;
    }
  }

  dropdown.classList.add('hidden');
}

function buildChatRowHtml(chat, isActive, pinnedGlyph, menuItems) {
  return `
    <div class="chat-row relative group px-2 w-full ${isActive ? 'active' : ''}" data-chat-id="${chat.id}" tabindex="0" role="listitem">
      <div class="chat-row-content relative flex items-center justify-between rounded-xl px-3 py-1.5 transition-colors cursor-pointer focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:outline-none ${isActive ? 'bg-gray-100/90 shadow-sm ring-1 ring-gray-200' : 'group-hover:bg-gray-100/80'}">
        <div class="flex items-center gap-3 min-w-0 flex-1">
          <div class="sidebar-full-only flex-1 min-w-0 pr-2">
            <span class="chat-title flex items-center gap-1.5 text-sm truncate font-primary ${isActive ? 'text-gray-900 font-semibold' : 'text-gray-700'}">
              ${pinnedGlyph}
              <span class="truncate">${escapeHtml(chat.title || 'Untitled')}</span>
            </span>
          </div>
        </div>
        <div class="chat-time shrink-0 text-[10px] text-gray-600 group-hover:hidden sidebar-full-only">
          ${formatRelativeTime(chat.updated_at)}
        </div>
      </div>

      <div class="absolute right-3 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1 bg-gradient-to-l from-gray-100/80 from-80% to-transparent pl-4 sidebar-full-only">
        <button class="chat-menu-btn p-1 hover:bg-surface rounded transition text-gray-500" title="More options" aria-label="Chat options menu">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4">
            <path d="M2 8a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0ZM6.5 8a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0ZM12.5 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />
          </svg>
        </button>
      </div>

      <!-- Dropdown menu (hidden by default) -->
      <div class="chat-menu-dropdown hidden fixed mt-1 bg-surface border border-gray-100 rounded-2xl shadow-xl z-50 min-w-[140px] w-fit p-1 overflow-hidden font-primary" role="menu">
        ${menuItems}
      </div>
    </div>
  `;
}

export function createChatRow(chat, handlers) {
  const isPinned = Number(chat.pinned) === 1;
  const isActive = chat.isActive === true;
  const isTempChat = String(chat.id || '').startsWith('temp-');
  const pinLabel = isPinned ? 'Unpin' : 'Pin';
  const pinnedGlyph = isPinned
    ? `<span class="inline-flex items-center text-gray-600" title="Pinned">
         <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
           <line x1="12" y1="2" x2="12" y2="22"></line>
           <path d="M17 10H7a2 2 0 0 0-2 2v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1a2 2 0 0 0-2-2Z"></path>
         </svg>
       </span>`
    : '';

  const menuItems = isTempChat
    ? `
        <button data-action="delete" class="menu-item flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-xl transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          Delete
        </button>
      `
    : `
        <button data-action="share" class="menu-item flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm hover:bg-neutral-bg rounded-xl transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          Share
        </button>
        <button data-action="rename" class="menu-item flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm hover:bg-neutral-bg rounded-xl transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
          Rename
        </button>
        <button data-action="pin" class="menu-item flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm hover:bg-neutral-bg rounded-xl transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 10H7a2 2 0 0 0-2 2v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1a2 2 0 0 0-2-2Z"/></svg>
          ${pinLabel}
        </button>
        <button data-action="duplicate" class="menu-item flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm hover:bg-neutral-bg rounded-xl transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          Duplicate
        </button>
        <hr class="border-gray-50 my-1">
        <button data-action="archive" class="menu-item flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm hover:bg-neutral-bg rounded-xl transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect width="22" height="5" x="1" y="3"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
          Archive
        </button>
        <button data-action="delete" class="menu-item flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-xl transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          Delete
        </button>
      `;

  const htmlTemplate = buildChatRowHtml(chat, isActive, pinnedGlyph, menuItems);

  const container = document.createElement('div');
  container.innerHTML = htmlTemplate.trim();
  const element = container.firstChild;

  const menuBtn = element.querySelector('.chat-menu-btn');
  const dropdown = element.querySelector('.chat-menu-dropdown');
  const content = element.querySelector('.chat-row-content');

  // Handle row click
  content.addEventListener('click', () => handleChatRowClick(chat, handlers));

  // Handle keyboard navigation
  element.addEventListener('keydown', (e) => handleChatRowKeydown(e, dropdown, handlers, chat.id));

  // Toggle menu on button click
  menuBtn.addEventListener('click', (e) => toggleChatMenu(e, dropdown, menuBtn, content));

  // Close menu on outside click or scroll
  setupCloseOnOutsideClick(dropdown, element);

  // Handle menu actions
  dropdown.addEventListener('click', (e) => handleDropdownClick(e, dropdown, chat, handlers));

  setupDropdownKeyboard(dropdown, 'button[data-action]');

  return element;
}

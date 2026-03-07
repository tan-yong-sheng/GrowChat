function safeTitle(chat) {
  return String(chat?.title || 'New Chat');
}

export function createChatRow(chat, handlers = {}) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 transition text-sm text-gray-700';
  row.innerHTML = `
    <div class="truncate font-medium">${safeTitle(chat)}</div>
  `;
  row.addEventListener('click', () => {
    if (typeof handlers.onClick === 'function') {
      handlers.onClick(chat.id);
    }
  });
  return row;
}

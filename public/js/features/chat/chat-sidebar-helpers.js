/**
 * Appends an "empty state" sidebar list item to a DocumentFragment
 * when the chat list is empty and not currently loading.
 * Shared between chat-sidebar-list.js and chat.js (fallback path).
 *
 * @param {DocumentFragment} fragment
 * @param {{ chatsPagination?: { loading?: boolean } }} state
 */
export function appendEmptyChatStateItem(fragment) {
  const emptyState = document.createElement('div');
  emptyState.className = 'px-3 py-4 text-sm text-gray-600 sidebar-full-only';
  emptyState.textContent = 'No chat sessions yet.';
  const emptyItem = document.createElement('li');
  emptyItem.appendChild(emptyState);
  fragment.appendChild(emptyItem);
}

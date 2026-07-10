/**
 * Shared chat click handler for activating a chat by ID.
 * Used by createChatListHandlers (chat-list-actions.js) as the real handler
 * and by createFallbackChatHandlers (chat-wire-controllers.js) as the fallback
 * until the real module loads via dynamic import.
 *
 * Both sites inlined the same onClick body; this module extracts it
 * to eliminate the 71-token duplicate cluster.
 *
 * @param {Object} deps - { isTempChatId, setState, syncChatUrl, drawMessages, state, loadMessages }
 * @param {string|number} id - Chat ID to activate
 */
export function handleClickChat(
  { isTempChatId, setState, syncChatUrl, drawMessages, state, loadMessages },
  id
) {
  if (isTempChatId(id)) {
    setState({ activeChatId: id });
    syncChatUrl(null);
    drawMessages([]);
    if (state.isMobile) setState({ showSidebar: false });
    return;
  }
  syncChatUrl(id);
  setState({ activeChatId: id });
  loadMessages(id, { modelMode: 'default' });
  if (state.isMobile) setState({ showSidebar: false });
}

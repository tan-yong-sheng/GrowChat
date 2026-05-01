import { createChatRow } from '../../shared/components/chat-row.js';

export function buildChatRows(list, activeId, models, getChatHandlers) {
  const fragment = document.createDocumentFragment();
  list.forEach((chat) => {
    const handlers = getChatHandlers(chat);
    const model = (models || []).find((m) => m.id === chat.model);
    const chatWithModelName = {
      ...chat,
      modelName: model?.name || chat.model || 'Default',
      isActive: chat.id === activeId,
    };
    const row = createChatRow(chatWithModelName, handlers);
    fragment.appendChild(row);
  });
  return fragment;
}

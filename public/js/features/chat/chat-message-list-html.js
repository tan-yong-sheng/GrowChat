import { normalizeCitations } from '../../shared/utils/chat-cache.js';
import { escapeHtml } from '../../shared/utils.js';
import { formatModelDisplayName } from './chat-message-utils.js';

export function buildChatMessageListHtml({
  projectedMessages = [],
  roundsByMessageId = new Map(),
  state,
  streamingOverrideByChat,
  messageBlocksById,
  toolCallsByMessageId,
  thinkingActiveByMessageId,
  thinkingDurationByMessageId,
  errorExpandedByMessageId,
  thinkingCollapsedByKey,
  toolExpandedByKey,
  renderAttachmentPills,
  renderAssistantMessageBody,
  syncMessageBlocksForMessage,
  syncToolCallsForMessage,
} = {}) {
  const chatId = state?.activeChatId;
  const firstUserMsg = projectedMessages.find((m) => m.role === 'user');
  const streamingOverride = chatId ? streamingOverrideByChat?.get(chatId) : null;
  const editingMessages = state?.ui?.editingMessages || {};
  const pendingDeleteMessageKeys = state?.ui?.pendingDeleteMessageKeys || {};
  const isDeletePending = (messageId) =>
    Boolean(pendingDeleteMessageKeys[`${chatId}:${String(messageId)}`]);

  return projectedMessages
    .map((m, i) => {
      const msgId = m.id || `idx-${i}`;
      const hasOverride = Boolean(
        streamingOverride &&
        streamingOverride.targetMsgId &&
        String(streamingOverride.targetMsgId) === String(msgId)
      );
      const displayContent = hasOverride ? streamingOverride.content || '' : m.content;
      const isStreaming =
        hasOverride || (m.role === 'assistant' && i === projectedMessages.length - 1 && !m.done);
      syncMessageBlocksForMessage?.(messageBlocksById, msgId, m.message_blocks, { isStreaming });
      syncToolCallsForMessage?.(toolCallsByMessageId, msgId, m.tool_calls, { isStreaming });
      const isEditing = msgId in editingMessages;
      const editingContent = editingMessages[msgId];
      const model = (state?.models || []).find((mod) => mod.id === m.model);
      const modelName = model?.name || formatModelDisplayName(m.model) || 'Assistant';
      const rounds = roundsByMessageId.get(String(msgId));
      const roundsHtml =
        rounds && rounds.total > 1
          ? `
      <div class="flex items-center gap-1 text-gray-400 ml-1">
        <button type="button" data-round-prev="${msgId}" class="px-1 rounded hover:bg-gray-100 ${rounds.prevId ? '' : 'opacity-30 pointer-events-none'}">‹</button>
        <span class="text-[11px] min-w-[42px] text-center">${rounds.index} / ${rounds.total}</span>
        <button type="button" data-round-next="${msgId}" class="px-1 rounded hover:bg-gray-100 ${rounds.nextId ? '' : 'opacity-30 pointer-events-none'}">›</button>
      </div>
    `
          : '';
      const showDelete =
        m.role === 'user' &&
        (!firstUserMsg ||
          String(firstUserMsg.id || '') !== String(msgId) ||
          (rounds?.total || 0) > 1);
      const showDeleteAssistant = m.role === 'assistant' && (rounds?.total || 0) > 1;
      const deletePending = isDeletePending(msgId);

      if (isEditing) {
        if (m.role === 'user') {
          return `
          <div class="flex justify-end w-full group py-2" data-message-id="${msgId}">
            <div class="flex flex-col items-end w-full max-w-[85%] gap-2">
              <textarea class="edit-message-textarea w-full bg-[#f4f4f4] rounded-2xl px-4 py-2 text-[15px] text-gray-800 outline-none focus:ring-2 focus:ring-black/5 resize-none font-sans border-none" data-message-id="${msgId}">${escapeHtml(editingContent)}</textarea>
              <div class="flex items-center gap-2 justify-end">
                <button class="cancel-edit-btn px-3 py-1 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50" data-message-id="${msgId}">Cancel</button>
                <button class="save-edit-btn px-3 py-1 text-xs font-medium rounded-lg bg-black text-white hover:bg-gray-800" data-message-id="${msgId}" data-index="${i}">Send</button>
              </div>
            </div>
          </div>
        `;
        }

        return `
        <div class="flex gap-4 w-full group py-4 first:pt-0 border-b border-gray-50 last:border-0" data-message-id="${msgId}">
          <div class="flex-shrink-0 w-7 h-7 rounded-lg bg-white border border-gray-100 flex items-center justify-center mt-1 overflow-hidden shadow-sm">
             <img src="/logo.png" alt="${escapeHtml(modelName)}" class="w-5 h-5 object-contain" />
          </div>
          <div class="flex-grow min-w-0 flex flex-col gap-2">
             <div class="font-bold text-sm text-gray-800 font-primary">${escapeHtml(modelName)}</div>
             <textarea class="edit-message-textarea w-full p-0 bg-transparent text-[15px] leading-[1.6] text-gray-800 outline-none resize-none font-sans border-none focus:ring-0" data-message-id="${msgId}">${escapeHtml(editingContent)}</textarea>
             <div class="flex items-center gap-2 justify-start mt-1">
                <button class="cancel-edit-btn px-3 py-1 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50" data-message-id="${msgId}">Cancel</button>
                <button class="save-copy-btn px-3 py-1 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50" data-message-id="${msgId}">Save as Copy</button>
                <button class="save-edit-btn px-3 py-1 text-xs font-medium rounded-lg bg-black text-white hover:bg-gray-800" data-message-id="${msgId}" data-index="${i}">Save</button>
             </div>
          </div>
        </div>
      `;
      }

      if (m.role === 'user') {
        const attachmentHtml = renderAttachmentPills?.(m.attachments, 'end') || '';
        return `
        <div class="flex justify-end w-full group py-2" data-message-id="${msgId}">
          <div class="flex flex-col items-end max-w-[85%] gap-1">
            ${attachmentHtml}
            <div class="bg-[#f4f4f4] rounded-2xl px-4 py-2 text-[15px] text-gray-800 transition-colors relative">
              ${escapeHtml(displayContent).replace(/\n/g, '<br/>')}
            </div>
            <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              ${roundsHtml}
              <button data-edit-message="${msgId}" data-index="${i}" class="p-1 hover:text-gray-600 hover:bg-gray-50 rounded transition text-gray-400" title="Edit" aria-label="Edit message">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
              </button>
              <button data-copy-message="${i}" class="p-1 hover:text-gray-600 hover:bg-gray-50 rounded transition text-gray-400" title="Copy" aria-label="Copy message">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
              </button>
              ${
                showDelete
                  ? `
              <button data-delete-message="${msgId}" data-index="${i}" class="p-1 hover:text-red-600 hover:bg-red-50 rounded transition text-gray-400 ${deletePending ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}" title="Delete" ${deletePending ? 'disabled aria-disabled="true"' : ''}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
              </button>
              `
                  : ''
              }
            </div>
          </div>
        </div>
      `;
      }

      const citations = normalizeCitations(m.citations);
      const isError = m.status === 'error' || Boolean(m.error_message);
      const citationHtml = citations.length
        ? `<div class="mt-3 flex flex-wrap gap-2">${citations.map((id) => `<button data-citation-id="${escapeHtml(id)}" class="text-xs px-2 py-1 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-100">Source: ${escapeHtml(id.slice(0, 8))}</button>`).join('')}</div>`
        : '';

      const showRoundNav = (rounds?.total || 0) > 1;
      return `
      <div class="flex gap-4 w-full group py-4 first:pt-0 border-b border-gray-50 last:border-0" data-message-id="${msgId}">
        <div class="flex-shrink-0 w-7 h-7 rounded-lg bg-white border border-gray-100 flex items-center justify-center mt-1 overflow-hidden shadow-sm">
           <img src="/logo.png" alt="${escapeHtml(modelName)}" class="w-5 h-5 object-contain" />
        </div>
        <div class="flex-grow min-w-0 flex flex-col">
           <div class="font-bold text-sm mb-1 text-gray-800 font-primary">${escapeHtml(modelName)}</div>
            <div class="chat-message-content rounded-2xl bg-[#f7f7f8] border border-gray-100 px-4 py-3 text-[15px] leading-[1.6] text-gray-800 prose prose-p:my-1 prose-pre:my-2 prose-headings:font-semibold max-w-none break-words font-sans" data-message-content="${msgId}" ${isError ? 'data-message-error="1"' : ''}>
              ${renderAssistantMessageBody({
                messageId: msgId,
                content: displayContent,
                isError,
                isStreaming,
                chatId,
                stateMaps: {
                  errorExpandedByMessageId,
                  thinkingActiveByMessageId,
                  thinkingDurationByMessageId,
                  toolCallsByMessageId,
                  thinkingCollapsedByKey,
                  toolExpandedByKey,
                  messageBlocksById,
                },
              })}
           </div>
           ${citationHtml}
           <div class="flex items-center gap-1 mt-3 -ml-2 text-gray-400">
              <div class="${showRoundNav ? 'opacity-100' : 'opacity-0'} transition-opacity">
                ${roundsHtml}
              </div>
              <div class="flex items-center gap-1 ${isStreaming ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100'} transition-opacity">
                <button data-edit-message="${msgId}" data-index="${i}" class="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition" title="Edit" aria-label="Edit message">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                </button>
                <button data-copy-message="${i}" class="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition" title="Copy" aria-label="Copy message">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                </button>
                <button data-retry-message="${msgId}" data-index="${i}" class="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition" title="Regenerate" aria-label="Regenerate response">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>
                </button>
                ${
                  showDeleteAssistant
                    ? `
                <button data-delete-message="${msgId}" data-index="${i}" class="p-1.5 hover:text-red-600 hover:bg-red-50 rounded-md transition ${deletePending ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}" title="Delete" aria-label="Delete message" ${deletePending ? 'disabled aria-disabled="true"' : ''}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                </button>
                `
                    : ''
                }
              </div>
           </div>
        </div>
      </div>
    `;
    })
    .join('');
}

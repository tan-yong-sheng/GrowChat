import { normalizeCitations } from '../../shared/utils/chat-cache.js';
import { escapeHtml } from '../../shared/utils.js';
import { formatModelDisplayName } from './chat-message-utils.js';

function resolveMessageId(m, i) {
  return m.id || `idx-${i}`;
}

function resolveStreamingOverride(streamingOverride, msgId) {
  if (!streamingOverride?.targetMsgId) return null;
  return String(streamingOverride.targetMsgId) === String(msgId) ? streamingOverride : null;
}

function resolveDisplayContent(m, override) {
  return override ? override.content || '' : m.content;
}

function resolveIsStreaming(m, override, i, projectedMessages) {
  return (
    override != null || (m.role === 'assistant' && i === projectedMessages.length - 1 && !m.done)
  );
}

function resolveModelName(state, m) {
  const model = (state?.models || []).find((mod) => mod.id === m.model);
  return model?.name || formatModelDisplayName(m.model) || 'Assistant';
}

function computeMessageContext(m, i, projectedMessages, streamingOverride, state, rounds) {
  const msgId = resolveMessageId(m, i);
  const override = resolveStreamingOverride(streamingOverride, msgId);
  const displayContent = resolveDisplayContent(m, override);
  const isStreaming = resolveIsStreaming(m, override, i, projectedMessages);
  const editingContent = state?.ui?.editingMessages?.[msgId];
  const isEditing = msgId in (state?.ui?.editingMessages || {});
  const modelName = resolveModelName(state, m);
  return {
    msgId,
    displayContent,
    isStreaming,
    isEditing,
    editingContent,
    modelName,
    rounds,
  };
}

function renderRoundNavHtml(msgId, rounds) {
  if (!rounds || rounds.total <= 1) return '';
  return `
      <div class="flex items-center gap-1 text-gray-600 ml-1">
        <button type="button" data-round-prev="${msgId}" class="px-1 rounded hover:bg-gray-100 ${rounds.prevId ? '' : 'opacity-30 pointer-events-none'}">‹</button>
        <span class="text-[11px] min-w-[42px] text-center">${rounds.index} / ${rounds.total}</span>
        <button type="button" data-round-next="${msgId}" class="px-1 rounded hover:bg-gray-100 ${rounds.nextId ? '' : 'opacity-30 pointer-events-none'}">›</button>
      </div>
    `;
}

function shouldShowUserDelete(m, msgId, firstUserMsg, rounds) {
  return (
    m.role === 'user' &&
    (!firstUserMsg || String(firstUserMsg.id || '') !== String(msgId) || (rounds?.total || 0) > 1)
  );
}

function shouldShowAssistantDelete(rounds) {
  return (rounds?.total || 0) > 1;
}

function renderEditUserForm(msgId, i, editingContent) {
  return `
          <div class="flex justify-end w-full group py-1" data-message-id="${msgId}">
            <div class="flex flex-col items-end w-full max-w-[85%] gap-2">
              <textarea class="edit-message-textarea w-full bg-surface-container rounded-2xl px-4 py-2 text-[15px] text-gray-800 outline-none focus:ring-2 focus:ring-black/5 resize-none font-primary border-none" data-message-id="${msgId}">${escapeHtml(editingContent)}</textarea>
              <div class="flex items-center gap-2 justify-end">
                <button class="cancel-edit-btn px-3 py-1 text-xs font-medium rounded-lg border border-gray-200 hover:bg-neutral-bg" data-message-id="${msgId}">Cancel</button>
                <button class="save-edit-btn px-3 py-1 text-xs font-medium rounded-lg bg-black text-white hover:bg-gray-800" data-message-id="${msgId}" data-index="${i}">Send</button>
              </div>
            </div>
          </div>
        `;
}

function renderEditAssistantForm(msgId, i, editingContent, modelName) {
  return `
        <div class="flex gap-4 w-full group py-1.5 first:pt-0 " data-message-id="${msgId}">
          <div class="flex-shrink-0 w-7 h-7 rounded-lg bg-surface border border-gray-100 flex items-center justify-center mt-1 overflow-hidden shadow-sm">
             <img src="/logo.png" alt="${escapeHtml(modelName)}" class="w-5 h-5 object-contain" />
          </div>
          <div class="flex-grow min-w-0 flex flex-col gap-1">
             <div class="font-bold text-sm text-gray-800 font-primary">${escapeHtml(modelName)}</div>
             <textarea class="edit-message-textarea w-full p-0 bg-transparent text-[15px] leading-[1.6] text-gray-800 outline-none resize-none font-primary border-none focus:ring-0" data-message-id="${msgId}">${escapeHtml(editingContent)}</textarea>
             <div class="flex items-center gap-2 justify-start mt-1">
                <button class="cancel-edit-btn px-3 py-1 text-xs font-medium rounded-lg border border-gray-200 hover:bg-neutral-bg" data-message-id="${msgId}">Cancel</button>
                <button class="save-copy-btn px-3 py-1 text-xs font-medium rounded-lg border border-gray-200 hover:bg-neutral-bg" data-message-id="${msgId}">Save as Copy</button>
                <button class="save-edit-btn px-3 py-1 text-xs font-medium rounded-lg bg-black text-white hover:bg-gray-800" data-message-id="${msgId}" data-index="${i}">Save</button>
             </div>
          </div>
        </div>
      `;
}

function renderUserActionButtons(msgId, i, deletePending, showDelete) {
  const deleteBtn = showDelete
    ? `
              <button data-delete-message="${msgId}" data-index="${i}" class="p-1 hover:text-red-600 hover:bg-red-50 rounded transition text-gray-600 ${deletePending ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}" title="Delete" ${deletePending ? 'disabled aria-disabled="true"' : ''}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
              </button>
              `
    : '';
  return `
              <button data-edit-message="${msgId}" data-index="${i}" class="p-1 hover:text-gray-600 hover:bg-neutral-bg rounded transition text-gray-600" title="Edit" aria-label="Edit message">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
              </button>
              <button data-copy-message="${i}" class="p-1 hover:text-gray-600 hover:bg-neutral-bg rounded transition text-gray-600" title="Copy" aria-label="Copy message">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
              </button>
              ${deleteBtn}
  `;
}

function renderUserMessage(
  msgId,
  i,
  displayContent,
  attachmentHtml,
  roundsHtml,
  deletePending,
  showDelete
) {
  return `
        <div class="flex justify-end w-full group py-1" data-message-id="${msgId}">
          <div class="flex flex-col items-end max-w-[85%] gap-1">
            ${attachmentHtml}
            <div class="bg-surface-container rounded-2xl px-4 py-2 text-[15px] text-gray-800 transition-colors relative">
              ${escapeHtml(displayContent).replace(/\n/g, '<br/>')}
            </div>
            <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              ${roundsHtml}
              ${renderUserActionButtons(msgId, i, deletePending, showDelete)}
            </div>
          </div>
        </div>
      `;
}

function renderCitationsHtml(citations) {
  if (!citations.length) return '';
  return `<div class="mt-3 flex flex-wrap gap-2">${citations
    .map(
      (id) =>
        `<button data-citation-id="${escapeHtml(id)}" class="text-xs px-2 py-1 rounded-lg bg-neutral-bg hover:bg-gray-100 text-gray-600 border border-gray-100">Source: ${escapeHtml(id.slice(0, 8))}</button>`
    )
    .join('')}</div>`;
}

function renderAssistantActionButtons(msgId, i, deletePending, showDeleteAssistant) {
  const deleteBtn = showDeleteAssistant
    ? `
                <button data-delete-message="${msgId}" data-index="${i}" class="p-1.5 hover:text-red-600 hover:bg-red-50 rounded-md transition ${deletePending ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}" title="Delete" aria-label="Delete message" ${deletePending ? 'disabled aria-disabled="true"' : ''}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                </button>
                `
    : '';
  return `
                <button data-edit-message="${msgId}" data-index="${i}" class="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-neutral-bg transition" title="Edit" aria-label="Edit message">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                </button>
                <button data-copy-message="${i}" class="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-neutral-bg transition" title="Copy" aria-label="Copy message">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                </button>
                <button data-retry-message="${msgId}" data-index="${i}" class="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-neutral-bg transition" title="Regenerate" aria-label="Regenerate response">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>
                </button>
                ${deleteBtn}
  `;
}

function renderAssistantMessage(
  msgId,
  i,
  modelName,
  displayContent,
  isStreaming,
  isError,
  chatId,
  rounds,
  roundsHtml,
  citationHtml,
  deletePending,
  showDeleteAssistant,
  showRoundNav,
  renderDeps,
  renderAssistantMessageBodyFn
) {
  return `
      <div class="flex gap-4 w-full group py-1.5 first:pt-0 " data-message-id="${msgId}">
        <div class="flex-shrink-0 w-7 h-7 rounded-lg bg-surface border border-gray-100 flex items-center justify-center mt-1 overflow-hidden shadow-sm">
           <img src="/logo.png" alt="${escapeHtml(modelName)}" class="w-5 h-5 object-contain" />
        </div>
        <div class="flex-grow min-w-0 flex flex-col">
           <div class="font-bold text-sm mb-1 text-gray-800 font-primary">${escapeHtml(modelName)}</div>
            <div class="chat-message-content rounded-2xl bg-surface-container border border-gray-100 px-4 py-3 text-[15px] leading-[1.6] text-gray-800 prose prose-p:my-1 prose-pre:my-2 prose-headings:font-semibold max-w-none break-words font-primary" data-message-content="${msgId}" ${isError ? 'data-message-error="1"' : ''}>
              ${renderAssistantMessageBodyFn({
                messageId: msgId,
                content: displayContent,
                isError,
                isStreaming,
                chatId,
                stateMaps: {
                  errorExpandedByMessageId: renderDeps.errorExpandedByMessageId,
                  thinkingActiveByMessageId: renderDeps.thinkingActiveByMessageId,
                  thinkingDurationByMessageId: renderDeps.thinkingDurationByMessageId,
                  toolCallsByMessageId: renderDeps.toolCallsByMessageId,
                  thinkingCollapsedByKey: renderDeps.thinkingCollapsedByKey,
                  toolExpandedByKey: renderDeps.toolExpandedByKey,
                  messageBlocksById: renderDeps.messageBlocksById,
                },
              })}
           </div>
           ${citationHtml}
           <div class="flex items-center gap-1 mt-3 -ml-2 text-gray-600">
              <div class="${showRoundNav ? 'opacity-100' : 'opacity-0'} transition-opacity">
                ${roundsHtml}
              </div>
              <div class="flex items-center gap-1 ${isStreaming ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100'} transition-opacity">
                ${renderAssistantActionButtons(msgId, i, deletePending, showDeleteAssistant)}
              </div>
           </div>
        </div>
      </div>
    `;
}

function prepareMessageRenderContext(m, i, context) {
  const {
    state,
    projectedMessages,
    roundsByMessageId,
    streamingOverride,
    firstUserMsg,
    chatId,
    pendingDeleteMessageKeys,
    messageBlocksById,
    toolCallsByMessageId,
    renderDeps,
    syncMessageBlocksForMessage,
    syncToolCallsForMessage,
  } = context;
  const msgId = m.id || `idx-${i}`;
  const rounds = roundsByMessageId.get(String(msgId));
  const ctx = computeMessageContext(m, i, projectedMessages, streamingOverride, state, rounds);
  syncMessageBlocksForMessage?.(messageBlocksById, msgId, m.message_blocks, {
    isStreaming: ctx.isStreaming,
  });
  syncToolCallsForMessage?.(toolCallsByMessageId, msgId, m.tool_calls, {
    isStreaming: ctx.isStreaming,
  });
  return {
    msgId,
    i,
    rounds,
    displayContent: ctx.displayContent,
    isStreaming: ctx.isStreaming,
    isEditing: ctx.isEditing,
    editingContent: ctx.editingContent,
    modelName: ctx.modelName,
    roundsHtml: renderRoundNavHtml(msgId, rounds),
    showDelete: shouldShowUserDelete(m, msgId, firstUserMsg, rounds),
    showDeleteAssistant: shouldShowAssistantDelete(rounds),
    deletePending: Boolean(pendingDeleteMessageKeys[`${chatId}:${String(msgId)}`]),
    chatId,
    renderDeps,
    renderAssistantMessageBody: context.renderAssistantMessageBody,
  };
}

function renderEditingMessage(m, ctx) {
  const { msgId, i, editingContent, modelName } = ctx;
  if (m.role === 'user') return renderEditUserForm(msgId, i, editingContent);
  return renderEditAssistantForm(msgId, i, editingContent, modelName);
}

function renderUserMessageItem(m, ctx, context) {
  const { msgId, i, displayContent, roundsHtml, deletePending, showDelete } = ctx;
  const attachmentHtml = context.renderAttachmentPills?.(m.attachments, 'end') || '';
  return renderUserMessage(
    msgId,
    i,
    displayContent,
    attachmentHtml,
    roundsHtml,
    deletePending,
    showDelete
  );
}

function renderAssistantMessageItem(m, ctx) {
  const {
    msgId,
    i,
    displayContent,
    isStreaming,
    modelName,
    rounds,
    roundsHtml,
    chatId,
    deletePending,
    showDeleteAssistant,
    renderDeps,
    renderAssistantMessageBody,
  } = ctx;
  const citations = normalizeCitations(m.citations);
  const isError = m.status === 'error' || Boolean(m.error_message);
  const citationHtml = renderCitationsHtml(citations);
  const showRoundNav = (rounds?.total || 0) > 1;
  return renderAssistantMessage(
    msgId,
    i,
    modelName,
    displayContent,
    isStreaming,
    isError,
    chatId,
    rounds,
    roundsHtml,
    citationHtml,
    deletePending,
    showDeleteAssistant,
    showRoundNav,
    renderDeps,
    renderAssistantMessageBody
  );
}

function renderMessageItem(m, i, context) {
  const ctx = prepareMessageRenderContext(m, i, context);
  if (ctx.isEditing) return renderEditingMessage(m, ctx);
  if (m.role === 'user') return renderUserMessageItem(m, ctx, context);
  return renderAssistantMessageItem(m, ctx);
}

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
  const pendingDeleteMessageKeys = state?.ui?.pendingDeleteMessageKeys || {};

  const renderDeps = {
    errorExpandedByMessageId,
    thinkingActiveByMessageId,
    thinkingDurationByMessageId,
    toolCallsByMessageId,
    thinkingCollapsedByKey,
    toolExpandedByKey,
    messageBlocksById,
  };

  const context = {
    state,
    projectedMessages,
    roundsByMessageId,
    streamingOverride,
    firstUserMsg,
    chatId,
    pendingDeleteMessageKeys,
    messageBlocksById,
    toolCallsByMessageId,
    renderDeps,
    renderAttachmentPills,
    renderAssistantMessageBody,
    syncMessageBlocksForMessage,
    syncToolCallsForMessage,
  };

  return projectedMessages.map((m, i) => renderMessageItem(m, i, context)).join('');
}

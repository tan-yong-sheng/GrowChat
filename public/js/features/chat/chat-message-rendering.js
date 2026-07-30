import { escapeHtml, renderMessageContent } from '../../shared/utils.js';
import { ensureBlocksFromContent } from './chat-message-blocks.js';
import { formatThoughtDuration, buildToolToggleKey } from './chat-message-utils.js';

const TOOL_BLOCK_ID_PREFIX = 'tool:';
const TOOL_BLOCK_ID_PREFIX_LENGTH = TOOL_BLOCK_ID_PREFIX.length;
const ERROR_TOGGLE_LENGTH_THRESHOLD = 240;

export function renderAssistantContent(content, options = {}) {
  if (options.streaming) {
    return `<div class="whitespace-pre-wrap break-words">${escapeHtml(String(content ?? '')).replace(/\n/g, '<br/>')}</div>`;
  }
  return renderMessageContent(content, options);
}

export function isImageAttachment(file) {
  return String(file?.content_type || '')
    .toLowerCase()
    .startsWith('image/');
}

export function renderAttachmentPills(attachments = [], align = 'end') {
  if (!Array.isArray(attachments) || attachments.length === 0) return '';
  const images = attachments.filter(isImageAttachment);
  const others = attachments.filter((file) => !isImageAttachment(file));
  const alignItems = align === 'start' ? 'items-start' : 'items-end';
  const justify = align === 'start' ? 'justify-start' : 'justify-end';

  const imageHtml = images
    .map((file) => {
      const label = String(file?.filename || 'Image');
      const fileId = String(file?.id || '');
      if (!fileId) return '';
      return `
      <div class="rounded-2xl border border-gray-200 bg-surface shadow-sm overflow-hidden max-w-[120px] max-h-[120px]">
        <img data-attachment-image="${escapeHtml(fileId)}" alt="${escapeHtml(label)}" title="${escapeHtml(label)}" class="block h-auto w-auto object-contain bg-gray-100 transition-opacity duration-200 max-w-[120px] max-h-[120px]" loading="lazy" />
      </div>
    `;
    })
    .join('');

  const pillHtml = others
    .map((file) => {
      const label = String(file?.filename || 'Attachment');
      return `
      <div class="flex items-center gap-2 rounded-full border border-gray-200 bg-surface px-3 py-1 text-[11px] text-gray-600 shadow-sm">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <span class="max-w-[200px] truncate">${escapeHtml(label)}</span>
      </div>
    `;
    })
    .join('');

  const imageRow = imageHtml
    ? `<div class="flex flex-wrap gap-2 ${justify}">${imageHtml}</div>`
    : '';
  const pillRow = pillHtml ? `<div class="flex flex-wrap gap-2 ${justify}">${pillHtml}</div>` : '';
  return `
    <div class="flex flex-col gap-2 ${alignItems}">
      ${imageRow}
      ${pillRow}
    </div>
  `;
}

export function renderThinkingBlock({
  label,
  thinking,
  collapsed,
  toggleKey,
  specialBlockScope = '',
}) {
  if (!label) return '';
  const hasContent = Boolean(thinking);
  const contentHtml = hasContent
    ? `<div data-thinking-body="${toggleKey}" class="${collapsed ? 'hidden' : ''} mt-2 border-l-2 border-gray-200 pl-3 text-[13px] leading-[1.6] text-gray-500 italic">
        ${renderMessageContent(thinking, specialBlockScope ? { specialBlockScope, streaming: true } : { streaming: true })}
      </div>`
    : '';
  const chevronClass = collapsed ? '-rotate-90' : 'rotate-0';
  return `
    <div class="mt-2 rounded-xl border border-gray-100 bg-neutral-bg/80 px-3 py-2">
      <button type="button" data-thinking-toggle="${toggleKey}" class="w-full flex items-center justify-between text-xs font-medium text-gray-500 hover:text-gray-700 transition">
        <span>${escapeHtml(label)}</span>
        <svg data-thinking-chevron="${toggleKey}" xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 transition-transform ${chevronClass}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
      ${contentHtml}
    </div>
  `;
}

function resolveToolStatus(call) {
  const status = String(call?.status || '').toLowerCase();
  return {
    status,
    isRunning: status === 'running',
    isError: status === 'error',
  };
}

function resolveToolLabel(call, { isRunning, isError }) {
  if (isRunning) return `Executing ${call.name}...`;
  if (isError) return `Tool error from ${call.name}`;
  return `View Result from ${call.name}`;
}

function resolveDotClass({ isError, isRunning }) {
  if (isError) return 'bg-red-500';
  if (isRunning) return 'bg-gray-400';
  return 'bg-green-500';
}

function resolveInputValue(input) {
  if (input) return escapeHtml(input);
  return '<span class="text-gray-400">No input.</span>';
}

function resolveOutputValue(output, isRunning) {
  if (output) return escapeHtml(output);
  if (isRunning) return '<span class="text-gray-400">Waiting for result...</span>';
  return '<span class="text-gray-400">No output.</span>';
}

function resolveStatusIcon(isRunning, dotClass) {
  if (isRunning) {
    return `<svg class="h-3.5 w-3.5 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity="0.25"></circle>
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor"></path>
      </svg>`;
  }
  return `<span class="inline-flex h-2 w-2 rounded-full ${dotClass}"></span>`;
}

export function renderToolCallItem(messageId, call, toolExpandedByKey) {
  if (!call) return '';
  const key = buildToolToggleKey(messageId, call.id);
  const expanded = toolExpandedByKey?.get(key) === true;
  const collapsed = !expanded;
  const status = resolveToolStatus(call);
  const label = resolveToolLabel(call, status);
  const dotClass = resolveDotClass(status);
  const chevronClass = collapsed ? '-rotate-90' : 'rotate-0';
  const bodyClass = collapsed ? 'hidden' : '';
  const inputValue = resolveInputValue(call.input);
  const outputValue = resolveOutputValue(call.output, status.isRunning);
  const statusIcon = resolveStatusIcon(status.isRunning, dotClass);
  return `
    <div class="mt-2 rounded-xl border border-gray-200 bg-surface px-3 py-2 shadow-sm">
      <button type="button" data-tool-toggle="${key}" class="w-full flex items-center justify-between text-xs font-semibold text-gray-600 hover:text-gray-900 transition">
        <span class="flex items-center gap-2">
          ${statusIcon}
          <span>${escapeHtml(label)}</span>
        </span>
        <svg data-tool-chevron="${key}" xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 transition-transform ${chevronClass}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
      <div data-tool-body="${key}" class="${bodyClass} mt-3 space-y-3 text-[12px] text-gray-600">
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-wider text-gray-600">Input</div>
          <pre class="mt-1 whitespace-pre-wrap rounded-lg bg-[#111827] px-2 py-2 text-[12px] text-gray-100 border border-gray-900/10 font-mono">${inputValue}</pre>
        </div>
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-wider text-gray-600">Output</div>
          <pre class="mt-1 whitespace-pre-wrap rounded-lg bg-[#111827] px-2 py-2 text-[12px] text-gray-100 border border-gray-900/10 font-mono">${outputValue}</pre>
        </div>
      </div>
    </div>
  `;
}

/**
 * Build the display block list by merging tool call IDs into the block array.
 * Handles tool-call id deduplication — removes the `if (toolCalls.length)` branch
 * from renderAssistantMessageBody.
 */
function buildDisplayBlocks(blocks, toolCalls) {
  const result = [...blocks];
  if (!toolCalls.length) return result;
  const existingToolIds = new Set(
    result
      .filter((block) => block?.type === 'tool')
      .map((block) => String(block.toolCallId || block.id || ''))
  );
  toolCalls.forEach((call) => {
    const id = String(call?.id || '');
    if (!id || existingToolIds.has(id)) return;
    result.push({ id: `tool:${id}`, type: 'tool', toolCallId: id });
  });
  return result;
}

/**
 * Render error content with toggle support — extracted from renderAssistantMessageBody
 * to reduce its cyclomatic complexity.
 */
function renderErrorContent({ raw, key, errorExpandedByKey, chatId, asyncNotice }) {
  const shouldToggle = raw.length > ERROR_TOGGLE_LENGTH_THRESHOLD || raw.includes('\n');
  const expanded = errorExpandedByKey?.get(key) ?? false;
  const bodyClass = expanded ? '' : 'max-h-24 overflow-hidden';
  const overlayClass = expanded ? 'hidden' : '';
  const toggleLabel = expanded ? 'Less' : 'More';
  const toggleHtml = shouldToggle
    ? `<button type="button" data-error-toggle="${key}" class="mt-2 text-[11px] font-semibold text-red-700 hover:text-red-800">${toggleLabel}</button>`
    : '';
  const overlayHtml = shouldToggle
    ? `<div data-error-overlay="${key}" class="pointer-events-none absolute inset-x-0 bottom-7 h-10 bg-gradient-to-t from-red-50 to-transparent ${overlayClass}"></div>`
    : '';
  return `${asyncNotice}
    <div class="relative rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-[14px] leading-[1.6] font-primary">
      <div data-error-body="${key}" class="${bodyClass}">${renderMessageContent(raw, chatId ? { specialBlockScope: chatId } : {})}</div>
      ${overlayHtml}
      ${toggleHtml}
    </div>
  `;
}

/**
 * Resolve the text answer from block content — extracted to reduce
 * renderAssistantMessageBody cyclomatic complexity.
 */
function resolveDisplayAnswer(text, blocks, isStreaming) {
  const textBlocks = blocks.filter((block) => block?.type === 'text');
  const hasTextBlocks = textBlocks.length > 0;
  return hasTextBlocks ? '' : text ? renderAssistantContent(text, { streaming: isStreaming }) : '';
}

function renderToolDisplayBlock(block, opts) {
  const { key, toolMap, toolExpandedByKey } = opts;
  const toolCallId = block.toolCallId || String(block.id || '').slice(TOOL_BLOCK_ID_PREFIX_LENGTH);
  return renderToolCallItem(key, toolMap.get(toolCallId), toolExpandedByKey);
}

function renderThinkingDisplayBlock(block, opts) {
  const { key, label, chatId, thinkingCollapsedByKey } = opts;
  if (!label) return '';
  const toggleKey = `${key}:${block.id}`;
  const collapsed = thinkingCollapsedByKey?.get(toggleKey) ?? false;
  return renderThinkingBlock({
    label,
    thinking: block.content,
    collapsed,
    toggleKey,
    specialBlockScope: chatId,
  });
}

function renderTextDisplayBlock(block, opts) {
  const { isStreaming, chatId } = opts;
  if (!block.content) return '';
  return renderAssistantContent(block.content, {
    streaming: isStreaming,
    specialBlockScope: chatId,
  });
}

function renderDisplayBlock(block, opts) {
  if (!block) return '';
  if (block.type === 'tool') return renderToolDisplayBlock(block, opts);
  if (block.type === 'thinking') return renderThinkingDisplayBlock(block, opts);
  if (block.type === 'text') return renderTextDisplayBlock(block, opts);
  return '';
}

function resolveThinkingLabel({
  isStreaming,
  hasThinking,
  isThinkingActive,
  duration,
  formatDuration,
}) {
  if (!isStreaming) return hasThinking ? formatDuration(duration) : '';
  if (hasThinking || isThinkingActive) return 'Thinking…';
  return '';
}

function buildAsyncNotice(isStreaming, hasRunningTools) {
  if (isStreaming || !hasRunningTools) return '';
  return `<div class="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-700">
        Tools are still running in the background. Results will appear when ready.
      </div>`;
}

function hasRunningToolCalls(toolCalls) {
  return toolCalls.some((call) => String(call?.status || '').toLowerCase() === 'running');
}

function extractAssistantStateMaps(stateMaps) {
  return stateMaps || {};
}

function resolveAssistantBlocks({ isError, messageBlocksById, key, content }) {
  if (isError || !messageBlocksById) return [];
  return ensureBlocksFromContent(messageBlocksById, key, content);
}

function renderAssistantBodyContent({
  key,
  content,
  isStreaming,
  blocks,
  toolCalls,
  chatId,
  thinkingActiveByMessageId,
  thinkingDurationByMessageId,
  thinkingCollapsedByKey,
  toolExpandedByKey,
  formatDuration,
}) {
  const displayBlocks = buildDisplayBlocks(blocks, toolCalls);
  const toolMap = new Map(toolCalls.map((call) => [String(call.id), call]));
  const isThinkingActive = thinkingActiveByMessageId?.get(key) === true;
  const hasThinking = isThinkingActive || blocks.some((block) => block?.type === 'thinking');
  const duration = thinkingDurationByMessageId?.get(key);
  const label = resolveThinkingLabel({
    isStreaming,
    hasThinking,
    isThinkingActive,
    duration,
    formatDuration,
  });

  const renderOpts = {
    key,
    toolMap,
    toolExpandedByKey,
    isStreaming,
    chatId,
    thinkingCollapsedByKey,
    label,
  };
  const blocksHtml = displayBlocks.map((block) => renderDisplayBlock(block, renderOpts)).join('');
  const renderedAnswer = resolveDisplayAnswer(String(content || ''), displayBlocks, isStreaming);
  return `${blocksHtml}${renderedAnswer}`;
}

export function renderAssistantMessageBody({
  messageId,
  content,
  errorMessage,
  isError,
  isStreaming,
  chatId = '',
  stateMaps,
  formatDuration = formatThoughtDuration,
}) {
  const maps = extractAssistantStateMaps(stateMaps);
  const {
    errorExpandedByMessageId,
    thinkingActiveByMessageId,
    thinkingDurationByMessageId,
    toolCallsByMessageId,
    thinkingCollapsedByKey,
    toolExpandedByKey,
    messageBlocksById,
  } = maps;
  const key = String(messageId || '');
  const toolCalls = toolCallsByMessageId?.get(key) || [];
  const blocks = resolveAssistantBlocks({ isError, messageBlocksById, key, content });
  const asyncNotice = buildAsyncNotice(isStreaming, hasRunningToolCalls(toolCalls));

  if (!isError) {
    const bodyContent = renderAssistantBodyContent({
      key,
      content,
      isStreaming,
      blocks,
      toolCalls,
      chatId,
      thinkingActiveByMessageId,
      thinkingDurationByMessageId,
      thinkingCollapsedByKey,
      toolExpandedByKey,
      formatDuration,
    });
    return `${asyncNotice}${bodyContent}`;
  }

  const raw = String(errorMessage || content || '');
  return renderErrorContent({
    raw,
    key,
    errorExpandedByKey: errorExpandedByMessageId,
    chatId,
    asyncNotice,
  });
}

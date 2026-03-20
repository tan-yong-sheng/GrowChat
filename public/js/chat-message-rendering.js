import { escapeHtml, renderMessageContent } from './utils.js';
import { ensureBlocksFromContent } from './chat-message-blocks.js';
import { formatThoughtDuration, buildToolToggleKey } from './chat-message-utils.js';

export function renderAssistantContent(content) {
  return renderMessageContent(content);
}

export function isImageAttachment(file) {
  return String(file?.content_type || '').toLowerCase().startsWith('image/');
}

export function renderAttachmentPills(attachments = [], align = 'end') {
  if (!Array.isArray(attachments) || attachments.length === 0) return '';
  const images = attachments.filter(isImageAttachment);
  const others = attachments.filter((file) => !isImageAttachment(file));
  const alignItems = align === 'start' ? 'items-start' : 'items-end';
  const justify = align === 'start' ? 'justify-start' : 'justify-end';

  const imageHtml = images.map((file) => {
    const label = String(file?.filename || 'Image');
    const fileId = String(file?.id || '');
    if (!fileId) return '';
    return `
      <div class="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden" style="max-width:120px; max-height:120px;">
        <img data-attachment-image="${escapeHtml(fileId)}" alt="${escapeHtml(label)}" title="${escapeHtml(label)}" class="block h-auto w-auto object-contain bg-gray-100 transition-opacity duration-200" style="max-width:120px; max-height:120px;" loading="lazy" />
      </div>
    `;
  }).join('');

  const pillHtml = others.map((file) => {
    const label = String(file?.filename || 'Attachment');
    return `
      <div class="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] text-gray-600 shadow-sm">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <span class="max-w-[200px] truncate">${escapeHtml(label)}</span>
      </div>
    `;
  }).join('');

  const imageRow = imageHtml ? `<div class="flex flex-wrap gap-2 ${justify}">${imageHtml}</div>` : '';
  const pillRow = pillHtml ? `<div class="flex flex-wrap gap-2 ${justify}">${pillHtml}</div>` : '';
  return `
    <div class="flex flex-col gap-2 ${alignItems}">
      ${imageRow}
      ${pillRow}
    </div>
  `;
}

export function renderThinkingBlock({ label, thinking, collapsed, toggleKey }) {
  if (!label) return '';
  const hasContent = Boolean(thinking);
  const contentHtml = hasContent
    ? `<div data-thinking-body="${toggleKey}" class="${collapsed ? 'hidden' : ''} mt-2 border-l-2 border-gray-200 pl-3 text-[13px] leading-[1.6] text-gray-500 italic">
        ${renderMessageContent(thinking)}
      </div>`
    : '';
  const chevronClass = collapsed ? '-rotate-90' : 'rotate-0';
  return `
    <div class="mt-2 rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2">
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

export function renderToolCallItem(messageId, call, toolExpandedByKey) {
  if (!call) return '';
  const key = buildToolToggleKey(messageId, call.id);
  const expanded = toolExpandedByKey?.get(key) === true;
  const collapsed = !expanded;
  const status = String(call.status || '').toLowerCase();
  const isRunning = status === 'running';
  const isError = status === 'error';
  const label = isRunning
    ? `Executing ${call.name}...`
    : (isError ? `Tool error from ${call.name}` : `View Result from ${call.name}`);
  const dotClass = isError ? 'bg-red-500' : (isRunning ? 'bg-gray-400' : 'bg-green-500');
  const chevronClass = collapsed ? '-rotate-90' : 'rotate-0';
  const bodyClass = collapsed ? 'hidden' : '';
  const inputValue = call.input ? escapeHtml(call.input) : '<span class="text-gray-400">No input.</span>';
  const outputValue = call.output
    ? escapeHtml(call.output)
    : (isRunning ? '<span class="text-gray-400">Waiting for result...</span>' : '<span class="text-gray-400">No output.</span>');
  const statusIcon = isRunning
    ? `<svg class="h-3.5 w-3.5 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity="0.25"></circle>
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor"></path>
      </svg>`
    : `<span class="inline-flex h-2 w-2 rounded-full ${dotClass}"></span>`;
  return `
    <div class="mt-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
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
          <div class="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Input</div>
          <pre class="mt-1 whitespace-pre-wrap rounded-lg bg-[#111827] px-2 py-2 text-[12px] text-gray-100 border border-gray-900/10 font-mono">${inputValue}</pre>
        </div>
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Output</div>
          <pre class="mt-1 whitespace-pre-wrap rounded-lg bg-[#111827] px-2 py-2 text-[12px] text-gray-100 border border-gray-900/10 font-mono">${outputValue}</pre>
        </div>
      </div>
    </div>
  `;
}

export function renderAssistantMessageBody({
  messageId,
  content,
  errorMessage,
  isError,
  isStreaming,
  stateMaps,
  formatDuration = formatThoughtDuration,
}) {
  const {
    errorExpandedByMessageId,
    thinkingActiveByMessageId,
    thinkingDurationByMessageId,
    toolCallsByMessageId,
    thinkingCollapsedByKey,
    toolExpandedByKey,
    messageBlocksById,
  } = stateMaps || {};
  const key = String(messageId || '');
  const isThinkingActive = thinkingActiveByMessageId?.get(key) === true;
  const duration = thinkingDurationByMessageId?.get(key);
  const toolCalls = toolCallsByMessageId?.get(key) || [];
  const blocks = isError ? [] : (messageBlocksById ? ensureBlocksFromContent(messageBlocksById, key, content) : []);
  const text = String(content || '');
  const hasThinking = isThinkingActive || blocks.some((block) => block?.type === 'thinking');
  const hasRunningTools = toolCalls.some((call) => String(call?.status || '').toLowerCase() === 'running');
  const asyncNotice = !isStreaming && hasRunningTools
    ? `<div class="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-700">
        Tools are still running in the background. Results will appear when ready.
      </div>`
    : '';

  if (!isError) {
    const renderBlocks = [...blocks];
    if (toolCalls.length) {
      const existingToolIds = new Set(
        renderBlocks
          .filter((block) => block?.type === 'tool')
          .map((block) => String(block.toolCallId || block.id || ''))
      );
      toolCalls.forEach((call) => {
        const id = String(call?.id || '');
        if (!id || existingToolIds.has(id)) return;
        renderBlocks.push({ id: `tool:${id}`, type: 'tool', toolCallId: id });
      });
    }
    const toolMap = new Map(toolCalls.map((call) => [String(call.id), call]));
    const blocksHtml = renderBlocks.map((block) => {
      if (!block) return '';
      if (block.type === 'tool') {
        return renderToolCallItem(key, toolMap.get(block.toolCallId || String(block.id || '').slice(5)), toolExpandedByKey);
      }
      if (block.type === 'thinking') {
        const label = isStreaming
          ? (hasThinking || isThinkingActive ? 'Thinking…' : '')
          : (hasThinking ? formatDuration(duration) : '');
        const toggleKey = `${key}:${block.id}`;
        const collapsed = thinkingCollapsedByKey?.get(toggleKey) ?? false;
        return label ? renderThinkingBlock({ label, thinking: block.content, collapsed, toggleKey }) : '';
      }
      if (block.type === 'text') {
        if (!block.content) return '';
        return renderAssistantContent(block.content);
      }
      return '';
    }).join('');
    const textBlocks = renderBlocks.filter((block) => block?.type === 'text');
    const hasTextBlocks = textBlocks.length > 0;
    const renderedAnswer = hasTextBlocks ? '' : (text ? renderAssistantContent(text) : '');
    return `${asyncNotice}${blocksHtml}${renderedAnswer}`;
  }

  const raw = String(errorMessage || content || '');
  const shouldToggle = raw.length > 240 || raw.includes('\n');
  const expanded = errorExpandedByMessageId?.get(key) ?? false;
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
    <div class="relative rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-[14px] leading-[1.6] font-sans">
      <div data-error-body="${key}" class="${bodyClass}">${renderMessageContent(raw)}</div>
      ${overlayHtml}
      ${toggleHtml}
    </div>
  `;
}

import {
  buildMessageBlocks,
  normalizeMessageBlockRecord,
  normalizeMessageBlocks,
  normalizeToolCallRecord,
  normalizeToolCalls,
} from './chat-message-utils.js';

export function getMessageBlocks(messageBlocksById, messageId) {
  const key = String(messageId || '');
  if (!key) return [];
  const existing = messageBlocksById.get(key);
  if (existing) return existing;
  const created = [];
  messageBlocksById.set(key, created);
  return created;
}

export function appendBlock(messageBlocksById, messageId, type, delta) {
  if (!messageId) return;
  const blocks = getMessageBlocks(messageBlocksById, messageId);
  const last = blocks.length ? blocks[blocks.length - 1] : null;
  const text = String(delta || '');
  if (last && last.type === type) {
    last.content = `${last.content || ''}${text}`;
    return;
  }
  const index = blocks.filter((block) => block.type === type).length + 1;
  blocks.push({ id: `${type}-${index}`, type, content: text });
}

export function ensureThinkingBlock(messageBlocksById, messageId) {
  if (!messageId) return;
  const blocks = getMessageBlocks(messageBlocksById, messageId);
  const last = blocks.length ? blocks[blocks.length - 1] : null;
  if (last && last.type === 'thinking') return;
  const index = blocks.filter((block) => block.type === 'thinking').length + 1;
  blocks.push({ id: `thinking-${index}`, type: 'thinking', content: '' });
}

export function ensureToolBlock(messageBlocksById, messageId, toolCallId) {
  if (!messageId || !toolCallId) return;
  const blocks = getMessageBlocks(messageBlocksById, messageId);
  const id = `tool:${toolCallId}`;
  if (blocks.some((block) => block.id === id)) return;
  blocks.push({ id, type: 'tool', toolCallId });
}

export function getToolCallsForMessage(toolCallsByMessageId, messageId) {
  const key = String(messageId || '');
  if (!key) return [];
  return toolCallsByMessageId.get(key) || [];
}

export function syncToolCallsForMessage(toolCallsByMessageId, messageId, rawToolCalls, { isStreaming } = {}) {
  const key = String(messageId || '');
  if (!key) return;
  const normalized = normalizeToolCalls(rawToolCalls)
    .map(normalizeToolCallRecord)
    .filter(Boolean);
  if (!normalized.length) {
    if (!isStreaming) toolCallsByMessageId.delete(key);
    return;
  }
  toolCallsByMessageId.set(key, normalized);
}

export function syncMessageBlocksForMessage(messageBlocksById, messageId, rawBlocks, { isStreaming } = {}) {
  const key = String(messageId || '');
  if (!key) return;
  const normalized = normalizeMessageBlocks(rawBlocks)
    .map(normalizeMessageBlockRecord)
    .filter(Boolean);
  if (!normalized.length) {
    if (!isStreaming) messageBlocksById.delete(key);
    return;
  }
  if (isStreaming && messageBlocksById.has(key)) return;
  messageBlocksById.set(key, normalized.map((block, index) => ({
    id: block.id || `${block.type}-${index + 1}`,
    type: block.type,
    content: block.content || '',
    toolCallId: block.toolCallId || null,
  })));
}

export function updateToolCallState(toolCallsByMessageId, messageBlocksById, messageId, payload) {
  const key = String(messageId || '');
  if (!key) return;
  const list = toolCallsByMessageId.get(key) ? [...toolCallsByMessageId.get(key)] : [];
  const record = normalizeToolCallRecord(payload);
  if (!record) return;
  const idx = list.findIndex((item) => String(item.id) === String(record.id));
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...record };
  } else {
    list.push(record);
  }
  toolCallsByMessageId.set(key, list);
  ensureToolBlock(messageBlocksById, key, record.id);
}

export function ensureBlocksFromContent(messageBlocksById, messageId, content) {
  return buildMessageBlocks(messageId, content, (id) => getMessageBlocks(messageBlocksById, id));
}

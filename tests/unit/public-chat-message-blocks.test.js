import { describe, expect, it } from 'vitest';
import {
  appendBlock,
  ensureBlocksFromContent,
  ensureThinkingBlock,
  getMessageBlocks,
  getToolCallsForMessage,
  syncMessageBlocksForMessage,
  syncToolCallsForMessage,
  updateToolCallState,
} from '../../public/js/features/chat/chat-message-blocks.js';

describe('chat message blocks', () => {
  it('appends and ensures block state immutably enough for reuse', () => {
    const blocksById = new Map();
    appendBlock(blocksById, 'm1', 'text', 'Hello');
    appendBlock(blocksById, 'm1', 'text', ' world');
    ensureThinkingBlock(blocksById, 'm1');

    expect(getMessageBlocks(blocksById, 'm1')).toHaveLength(2);
    expect(ensureBlocksFromContent(blocksById, 'm2', 'Hi')).toHaveLength(1);
  });

  it('syncs tool calls and blocks from raw payloads', () => {
    const blocksById = new Map();
    const toolCallsById = new Map();
    syncMessageBlocksForMessage(blocksById, 'm1', [{ id: 'b1', type: 'text', content: 'Hi' }]);
    syncToolCallsForMessage(toolCallsById, 'm1', [{ id: 't1', name: 'Search', status: 'running' }]);

    expect(getMessageBlocks(blocksById, 'm1')).toHaveLength(1);
    expect(getToolCallsForMessage(toolCallsById, 'm1')).toHaveLength(1);
  });

  it('updates tool call state from payloads', () => {
    const blocksById = new Map();
    const toolCallsById = new Map();
    updateToolCallState(toolCallsById, blocksById, 'm1', { id: 't1', name: 'Search', status: 'completed' });

    expect(getToolCallsForMessage(toolCallsById, 'm1')[0].status).toBe('completed');
    expect(getMessageBlocks(blocksById, 'm1')).toHaveLength(1);
  });
});



// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  buildMessageBlocks,
  formatApiErrorMessage,
  extractThinkingBlocks,
  formatThoughtDuration,
  formatModelDisplayName,
  normalizeMessageBlockRecord,
  normalizeMessageBlocks,
  normalizeToolCallRecord,
  normalizeToolCalls,
  splitThinkingSegments,
} from '../../public/js/chat-message-utils.js';

describe('chat message utils', () => {
  it('splits thinking segments and builds message blocks', () => {
    expect(splitThinkingSegments('Hello <thinking>plan</thinking> world')).toEqual([
      { type: 'text', text: 'Hello ' },
      { type: 'thinking', text: 'plan' },
      { type: 'text', text: ' world' },
    ]);

    const blocks = buildMessageBlocks('m1', 'Hello <thinking>plan</thinking> world', () => []);
    expect(blocks.map((block) => block.type)).toEqual(['text', 'thinking', 'text']);
  });

  it('formats model and api error labels', () => {
    expect(formatModelDisplayName('provider:gpt-4o')).toBe('gpt-4o');
    expect(formatModelDisplayName('')).toBe('Assistant');
    expect(formatApiErrorMessage({ details: { message: 'Bad request' } }, 'fallback')).toBe('Bad request');
    expect(formatApiErrorMessage({ details: { unsupported_types: ['pdf', 'csv'] } }, 'fallback')).toContain('attachments');
  });

  it('normalizes thinking and tool payloads', () => {
    expect(extractThinkingBlocks('A <thinking>plan</thinking> B').cleaned).toBe('A  B');
    expect(formatThoughtDuration(950)).toBe('Thought for less than a second');
    expect(normalizeToolCalls('not-json')).toEqual([]);
    expect(normalizeMessageBlocks('[{"id":"b"}]')).toEqual([{ id: 'b' }]);
    expect(normalizeMessageBlockRecord({ type: 'text', content: 123 }, 0)).toEqual({
      id: 'text-1',
      type: 'text',
      content: '123',
      toolCallId: null,
    });
    expect(normalizeToolCallRecord({ id: 't1', name: 'Search', output: 'done' })).toMatchObject({
      id: 't1',
      name: 'Search',
      status: 'completed',
    });
  });
});

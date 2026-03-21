// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  renderAssistantContent,
  renderAssistantMessageBody,
  renderAttachmentPills,
  renderThinkingBlock,
  renderToolCallItem,
} from '../../public/js/features/chat/chat-message-rendering.js';

describe('chat message rendering helpers', () => {
  it('renders assistant content and attachment pills', () => {
    expect(renderAssistantContent('Hello')).toContain('Hello');
    const html = renderAttachmentPills([
      { id: 'img1', filename: 'photo.png', content_type: 'image/png' },
      { id: 'doc1', filename: '<doc>.pdf', content_type: 'application/pdf' },
    ]);
    expect(html).toContain('data-attachment-image="img1"');
    expect(html).toContain('&lt;doc&gt;.pdf');
  });

  it('renders thinking and tool call blocks', () => {
    expect(renderThinkingBlock({ label: 'Thinking…', thinking: 'step 1', collapsed: false, toggleKey: 'm1:thinking' }))
      .toContain('data-thinking-toggle="m1:thinking"');

    const tools = new Map([['tool-1', { id: 'tool-1', name: 'Search', status: 'running', input: '{}', output: '' }]]);
    expect(renderToolCallItem('m1', tools.get('tool-1'), new Map([['m1:tool-1', true]]))).toContain('Executing Search...');
  });

  it('renders assistant message body from shared block state', () => {
    const messageBlocksById = new Map([
      ['m1', [
        { id: 'text-1', type: 'text', content: 'Hello' },
        { id: 'thinking-1', type: 'thinking', content: 'step 1' },
      ]],
    ]);
    const toolCallsByMessageId = new Map([
      ['m1', [{ id: 'tool-1', name: 'Search', status: 'running', input: '{}', output: '' }]],
    ]);
    const html = renderAssistantMessageBody({
      messageId: 'm1',
      content: 'Hello',
      isError: false,
      isStreaming: false,
      stateMaps: {
        messageBlocksById,
        toolCallsByMessageId,
        thinkingDurationByMessageId: new Map([['m1', 2000]]),
        thinkingActiveByMessageId: new Map(),
        thinkingCollapsedByKey: new Map(),
        toolExpandedByKey: new Map(),
        errorExpandedByMessageId: new Map(),
      },
    });

    expect(html).toContain('Hello');
    expect(html).toContain('Thought for 2 seconds');
    expect(html).toContain('Executing Search...');
  });
});



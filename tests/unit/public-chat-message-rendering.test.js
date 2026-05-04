// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

vi.mock('https://cdn.jsdelivr.net/npm/dompurify@3.2.6/dist/purify.es.mjs', () => ({
  default: {
    sanitize: (html) => html,
  },
}));
import {
  renderAssistantContent,
  renderAssistantMessageBody,
  renderAttachmentPills,
  renderThinkingBlock,
  renderToolCallItem,
} from '../../public/js/features/chat/chat-message-rendering.js';
import { enhanceMarkdownSpecialBlocks } from '../../public/js/shared/markdown-renderer.js';

describe('chat message rendering helpers', () => {
  it('renders assistant content and attachment pills', () => {
    expect(renderAssistantContent('Hello')).toContain('Hello');
    expect(renderAssistantContent('**bold**', { streaming: true })).not.toContain('<strong>');
    const html = renderAttachmentPills([
      { id: 'img1', filename: 'photo.png', content_type: 'image/png' },
      { id: 'doc1', filename: '<doc>.pdf', content_type: 'application/pdf' },
    ]);
    expect(html).toContain('data-attachment-image="img1"');
    expect(html).toContain('&lt;doc&gt;.pdf');
  });

  it('keeps graphviz preview and code buttons after sanitization', () => {
    const originalMarked = globalThis.window.marked;
    globalThis.window.marked = {
      lexer: vi.fn(() => [
        {
          type: 'code',
          lang: 'dot',
          text: 'digraph G { A -> B; }',
          raw: '```dot\ndigraph G { A -> B; }\n```',
        },
      ]),
      setOptions: vi.fn(),
    };

    const html = renderAssistantContent('```dot\ndigraph G { A -> B; }\n```');

    globalThis.window.marked = originalMarked;

    document.body.innerHTML = `<div>${html}</div>`;
    const tabs = document.querySelector('[aria-label="Graphviz view mode"]');

    expect(tabs?.querySelector('button[data-markdown-special-mode-btn="preview"]')).toBeTruthy();
    expect(tabs?.querySelector('button[data-markdown-special-mode-btn="code"]')).toBeTruthy();
    expect(tabs?.querySelectorAll('button')).toHaveLength(2);
  });

  it('renders thinking and tool call blocks', () => {
    expect(
      renderThinkingBlock({
        label: 'Thinking…',
        thinking: 'step 1',
        collapsed: false,
        toggleKey: 'm1:thinking',
      })
    ).toContain('data-thinking-toggle="m1:thinking"');

    const tools = new Map([
      ['tool-1', { id: 'tool-1', name: 'Search', status: 'running', input: '{}', output: '' }],
    ]);
    expect(renderToolCallItem('m1', tools.get('tool-1'), new Map([['m1:tool-1', true]]))).toContain(
      'Executing Search...'
    );
  });

  it('renders assistant message body from shared block state', () => {
    const messageBlocksById = new Map([
      [
        'm1',
        [
          { id: 'text-1', type: 'text', content: 'Hello' },
          { id: 'thinking-1', type: 'thinking', content: 'step 1' },
        ],
      ],
    ]);
    const toolCallsByMessageId = new Map([
      ['m1', [{ id: 'tool-1', name: 'Search', status: 'running', input: '{}', output: '' }]],
    ]);
    const originalMarked = globalThis.window.marked;
    globalThis.window.marked = {
      lexer: vi.fn(() => [
        {
          type: 'paragraph',
          tokens: [{ type: 'text', text: 'Hello' }],
        },
      ]),
      setOptions: vi.fn(),
    };
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
    globalThis.window.marked = originalMarked;

    expect(html).toContain('Hello');
    expect(html).toContain('Thought for 2 seconds');
    expect(html).toContain('Executing Search...');
  });
});

import { describe, expect, it } from 'vitest';
import { trimTrailingAssistantMessages } from '../../src/routers/chat-history.js';

describe('chat history helpers', () => {
  it('removes assistant messages from the tail of regenerate history', () => {
    const history = [
      { role: 'system', content: 'rules' },
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
      { role: 'assistant', content: 'repeat' },
    ];

    expect(trimTrailingAssistantMessages(history)).toEqual([
      { role: 'system', content: 'rules' },
      { role: 'user', content: 'hello' },
    ]);
    expect(history).toHaveLength(4);
  });

  it('keeps history that already ends with user or tool messages', () => {
    const history = [
      { role: 'user', content: 'question' },
      { role: 'tool', content: 'result' },
    ];

    expect(trimTrailingAssistantMessages(history)).toEqual(history);
  });
});



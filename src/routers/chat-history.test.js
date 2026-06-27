import { describe, it, expect } from 'vitest';
import { trimTrailingAssistantMessages } from './chat-history.js';

describe('trimTrailingAssistantMessages', () => {
  it('returns empty array for empty input', () => {
    expect(trimTrailingAssistantMessages([])).toEqual([]);
  });

  it('returns empty array for null input', () => {
    expect(trimTrailingAssistantMessages(null)).toEqual([]);
  });

  it('returns empty array for undefined input', () => {
    expect(trimTrailingAssistantMessages(undefined)).toEqual([]);
  });

  it('returns empty array for non-array inputs', () => {
    expect(trimTrailingAssistantMessages('string')).toEqual([]);
    expect(trimTrailingAssistantMessages(42)).toEqual([]);
    expect(trimTrailingAssistantMessages({})).toEqual([]);
  });

  it('returns shallow copy when no trailing assistants', () => {
    const history = [{ role: 'user', content: 'Hello' }];
    const result = trimTrailingAssistantMessages(history);
    expect(result).toEqual([{ role: 'user', content: 'Hello' }]);
    expect(result).not.toBe(history);
  });

  it('removes single trailing assistant', () => {
    expect(
      trimTrailingAssistantMessages([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
      ])
    ).toEqual([{ role: 'user', content: 'Hello' }]);
  });

  it('removes multiple trailing assistants', () => {
    expect(
      trimTrailingAssistantMessages([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
        { role: 'assistant', content: 'How can I help?' },
      ])
    ).toEqual([{ role: 'user', content: 'Hello' }]);
  });

  it('stops at user in trailing position', () => {
    expect(
      trimTrailingAssistantMessages([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
        { role: 'user', content: 'Follow up' },
      ])
    ).toEqual([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
      { role: 'user', content: 'Follow up' },
    ]);
  });

  it('handles all-assistant input', () => {
    expect(
      trimTrailingAssistantMessages([
        { role: 'assistant', content: 'First' },
        { role: 'assistant', content: 'Second' },
      ])
    ).toEqual([]);
  });

  it('handles single assistant message', () => {
    expect(trimTrailingAssistantMessages([{ role: 'assistant', content: 'Only' }])).toEqual([]);
  });

  it('preserves non-trailing assistant messages', () => {
    expect(
      trimTrailingAssistantMessages([
        { role: 'assistant', content: 'Intro' },
        { role: 'user', content: 'Question' },
        { role: 'assistant', content: 'Answer' },
      ])
    ).toEqual([
      { role: 'assistant', content: 'Intro' },
      { role: 'user', content: 'Question' },
    ]);
  });

  it('does not mutate the original array', () => {
    const original = [{ role: 'assistant', content: 'A' }];
    trimTrailingAssistantMessages(original);
    expect(original).toEqual([{ role: 'assistant', content: 'A' }]);
  });

  it('only trims exact "assistant" role — uppercase is NOT trimmed', () => {
    expect(
      trimTrailingAssistantMessages([
        { role: 'user', content: 'A' },
        { role: 'ASSISTANT', content: 'B' },
      ])
    ).toEqual([
      { role: 'user', content: 'A' },
      { role: 'ASSISTANT', content: 'B' },
    ]);
  });

  it('treats null as stop signal (pops trailing assistant first)', () => {
    // Behavior: while loop pops trailing 'assistant', then checks null → condition false → stops
    // pop() already removed the assistant before the check
    expect(
      trimTrailingAssistantMessages([
        { role: null, content: 'Null' },
        { role: 'assistant', content: 'A' },
      ])
    ).toEqual([{ role: null, content: 'Null' }]);
  });

  it('treats undefined as stop signal (pops trailing assistant first)', () => {
    // Behavior: while loop pops trailing 'assistant', then checks undefined (|| '' = '') → stops
    // undefined role is preserved in result (shown as missing role in JSON)
    const result = trimTrailingAssistantMessages([
      { role: undefined, content: 'X' },
      { role: 'assistant', content: 'A' },
    ]);
    expect(result.length).toBe(1);
    expect(result[0].content).toBe('X');
    expect(result[0].role).toBeUndefined();
  });

  it('null anywhere in sequence stops trimming', () => {
    expect(
      trimTrailingAssistantMessages([
        { role: 'user', content: 'A' },
        { role: null, content: 'N' },
        { role: 'assistant', content: 'B' },
      ])
    ).toEqual([
      { role: 'user', content: 'A' },
      { role: null, content: 'N' },
    ]);
  });

  it('multiple nulls all preserved', () => {
    expect(
      trimTrailingAssistantMessages([
        { role: null, content: 'N1' },
        { role: null, content: 'N2' },
        { role: 'assistant', content: 'A' },
      ])
    ).toEqual([
      { role: null, content: 'N1' },
      { role: null, content: 'N2' },
    ]);
  });

  it('trims only trailing messages when non-assistant role interrupts', () => {
    expect(
      trimTrailingAssistantMessages([
        { role: 'user', content: 'A' },
        { role: 'tool', content: 'C' },
        { role: 'assistant', content: 'D' },
      ])
    ).toEqual([
      { role: 'user', content: 'A' },
      { role: 'tool', content: 'C' },
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildPersistedAssistantContent,
  isStreamCancelledRow,
  shouldPersistAssistantContent,
} from './stream-utils.js';

describe('chat stream utils', () => {
  it('builds persisted assistant content with reasoning suffix', () => {
    expect(buildPersistedAssistantContent('hello', ' think ')).toBe('hello\n\n<thinking>think</thinking>');
    expect(buildPersistedAssistantContent('', ' think ')).toBe('<thinking>think</thinking>');
  });

  it('decides when assistant content should be persisted', () => {
    expect(shouldPersistAssistantContent({ now: 2000, lastPersistAt: 0, fullText: 'abc' })).toBe(true);
    expect(shouldPersistAssistantContent({ now: 1000, lastPersistAt: 900, fullText: 'abc' })).toBe(false);
    expect(shouldPersistAssistantContent({ force: true, now: 1000 })).toBe(true);
  });

  it('detects cancelled stream rows', () => {
    expect(isStreamCancelledRow({ status: 'cancelled' })).toBe(true);
    expect(isStreamCancelledRow({ status: 'running', error_code: 'cancelled' })).toBe(true);
    expect(isStreamCancelledRow({ status: 'running' })).toBe(false);
  });
});

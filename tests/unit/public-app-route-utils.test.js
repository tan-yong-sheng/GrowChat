// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  buildTempChatStub,
  getChatIdFromPath,
  injectTempChat,
  isTempChatId,
  resolveActiveChatId,
  shouldStartRealtime,
} from '../../public/js/bootstrap/app-route-utils.js';

describe('app route helpers', () => {
  it('parses chat ids from chat routes', () => {
    expect(getChatIdFromPath('/c/chat-123')).toBe('chat-123');
    expect(getChatIdFromPath('/')).toBeNull();
  });

  it('identifies temporary chat ids and builds stubs', () => {
    expect(isTempChatId('temp-1')).toBe(true);
    expect(isTempChatId('c1')).toBe(false);

    const stub = buildTempChatStub('temp-1', 'm1');
    expect(stub).toMatchObject({
      id: 'temp-1',
      title: 'New Chat',
      model: 'm1',
      pinned: 0,
      tags: '[]',
    });
  });

  it('injects temp chats only when needed and resolves active chat ids', () => {
    const chats = [{ id: 'c1' }];
    const nextChats = injectTempChat(chats, 'temp-2', 'm1');

    expect(nextChats[0].id).toBe('temp-2');
    expect(resolveActiveChatId('c9', chats, false)).toBe('c9');
    expect(resolveActiveChatId(null, chats, false)).toBe('c1');
    expect(resolveActiveChatId(null, chats, true)).toBeNull();
  });

  it('guards realtime startup on local routes', () => {
    expect(shouldStartRealtime(new URL('https://localhost/'))).toBe(false);
    expect(shouldStartRealtime(new URL('https://example.com/'))).toBe(true);
    expect(shouldStartRealtime(new URL('https://example.com/admin'))).toBe(false);
  });
});



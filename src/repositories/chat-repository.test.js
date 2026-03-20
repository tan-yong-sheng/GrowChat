import { describe, expect, it, vi } from 'vitest';
import { createChatRepository } from './chat-repository.js';

describe('chat repository', () => {
  it('loads owned chats and message snapshots', async () => {
    const db = {
      first: vi.fn().mockResolvedValueOnce({ id: 'chat-1' }).mockResolvedValueOnce({ id: 'msg-1' }),
      all: vi.fn().mockResolvedValueOnce([{ id: 'msg-1' }]),
    };

    const repo = createChatRepository(db);
    expect(await repo.findOwnedChat('chat-1', 'user-1')).toEqual({ id: 'chat-1' });
    expect(await repo.getMessageSnapshot('msg-1')).toEqual({ id: 'msg-1' });
    expect(await repo.getChatMessages('chat-1')).toEqual([{ id: 'msg-1' }]);
  });

  it('orders chat messages deterministically when created_at ties', async () => {
    const db = {
      first: vi.fn(),
      all: vi.fn().mockResolvedValueOnce([{ id: 'msg-1' }, { id: 'msg-2' }]),
    };

    const repo = createChatRepository(db);
    await repo.getChatMessages('chat-1');

    expect(db.all).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY created_at ASC, rowid ASC'),
      ['chat-1']
    );
  });
});

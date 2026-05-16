// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { editMessage } from './message-edit.js';

// Mock dependencies
vi.mock('../db.js', () => ({
  default: {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        first: vi.fn(),
        run: vi.fn(),
      })),
    })),
  },
}));

describe('Message Editing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('editMessage', () => {
    it('returns error when message ID is missing', async () => {
      const result = await editMessage({});
      expect(result.status).toBe(400);
      const body = await result.json();
      expect(body.error.toLowerCase()).toContain('message');
    });

    it('returns error when content is missing', async () => {
      const result = await editMessage({ messageId: 'msg-1' });
      expect(result.status).toBe(400);
      const body = await result.json();
      expect(body.error.toLowerCase()).toContain('content');
    });

    it('returns 404 when message not found', async () => {
      const db = await import('../db.js');
      db.default.prepare.mockReturnValue({
        bind: vi.fn(() => ({
          first: vi.fn().mockResolvedValue(null),
        })),
      });

      const result = await editMessage({ messageId: 'nonexistent', content: 'New content', userId: 'user-1' });
      expect(result.status).toBe(404);
    });

    it('returns 403 when user is not message owner', async () => {
      const db = await import('../db.js');
      db.default.prepare.mockReturnValue({
        bind: vi.fn(() => ({
          first: vi.fn().mockResolvedValue({
            id: 'msg-1',
            user_id: 'other-user',
            content: 'Original content',
          }),
        })),
      });

      const result = await editMessage({ messageId: 'msg-1', content: 'New content', userId: 'user-1' });
      expect(result.status).toBe(403);
    });

    it('updates message content successfully', async () => {
      const db = await import('../db.js');
      db.default.prepare.mockImplementation((sql) => {
        if (sql.includes('SELECT')) {
          return {
            bind: vi.fn(() => ({
              first: vi.fn().mockResolvedValue({
                id: 'msg-1',
                user_id: 'user-1',
                content: 'Original content',
              }),
            })),
          };
        }
        return {
          bind: vi.fn(() => ({
            run: vi.fn().mockResolvedValue({ results: [] }),
          })),
        };
      });

      const result = await editMessage({ messageId: 'msg-1', content: 'New content', userId: 'user-1' });
      expect(result.status).toBe(200);
      const body = await result.json();
      expect(body.message).toHaveProperty('id', 'msg-1');
      expect(body.message.content).toBe('New content');
      expect(body.message.edited_at).toBeDefined();
    });
  });
});

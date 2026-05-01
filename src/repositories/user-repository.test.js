import { describe, expect, it, vi } from 'vitest';
import { createUserRepository } from './user-repository.js';

describe('user repository', () => {
  it('reads and creates users', async () => {
    const db = {
      first: vi.fn().mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ id: 'u1' }),
      run: vi.fn().mockResolvedValue({}),
      all: vi.fn(),
    };

    const repo = createUserRepository(db);
    expect(await repo.count()).toBe(2);
    const created = await repo.create({
      id: 'u1',
      email: 'test@example.com',
      passwordHash: 'hash',
      name: 'Test',
      role: 'member',
      accountStatus: 'pending',
    });

    expect(created.id).toBe('u1');
    expect(db.run).toHaveBeenCalled();
    expect(db.run.mock.calls[0][0]).toContain('account_status');
  });

  it('falls back when last_active_at is missing', async () => {
    const db = {
      first: vi.fn().mockResolvedValue({ id: 'u1' }),
      run: vi
        .fn()
        .mockRejectedValueOnce(new Error('no such column: last_active_at'))
        .mockResolvedValueOnce({}),
    };

    const repo = createUserRepository(db);
    await expect(repo.touchLastActive('u1')).resolves.toBeUndefined();
    expect(db.run).toHaveBeenCalledTimes(1);
  });
});

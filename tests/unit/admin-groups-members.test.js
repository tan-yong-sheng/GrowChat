import { describe, expect, it } from 'vitest';
import { buildMemberSet, clampUserLimit, diffMemberSets, filterUsers } from '../../public/js/features/admin/users/groups-members-helpers.js';

describe('admin group member helpers', () => {
  it('builds member sets from user lists', () => {
    const set = buildMemberSet([{ id: 'u1' }, { id: 'u2' }]);
    expect(set.has('u1')).toBe(true);
    expect(set.has('u2')).toBe(true);
  });

  it('diffs member sets', () => {
    const before = new Set(['u1', 'u2']);
    const after = new Set(['u2', 'u3']);
    const diff = diffMemberSets(before, after);
    expect(diff.add).toEqual(['u3']);
    expect(diff.remove).toEqual(['u1']);
  });

  it('filters users by query', () => {
    const users = [
      { id: 'u1', name: 'Alice', email: 'alice@example.com' },
      { id: 'u2', name: 'Bob', email: 'bob@example.com' },
    ];
    const results = filterUsers(users, 'ali');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('u1');
  });

  it('clamps user list limit', () => {
    expect(clampUserLimit(200)).toBe(100);
    expect(clampUserLimit(0)).toBe(100);
    expect(clampUserLimit(50)).toBe(50);
  });
});

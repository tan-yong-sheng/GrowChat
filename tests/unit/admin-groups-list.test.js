import { describe, expect, it } from 'vitest';
import {
  removeGroupById,
  sortGroups,
  updateGroupMemberCount,
  upsertGroup,
} from '../../public/js/features/admin/users/groups-list-helpers.js';

describe('admin groups list helpers', () => {
  const groups = [
    { id: 'g1', name: 'Alpha', member_count: 2 },
    { id: 'g2', name: 'Beta', member_count: 5 },
    { id: 'g3', name: 'Gamma', member_count: 5 },
  ];

  it('sorts by members desc then name', () => {
    const result = sortGroups(groups, 'members');
    expect(result.map((g) => g.id)).toEqual(['g2', 'g3', 'g1']);
  });

  it('sorts by name asc', () => {
    const result = sortGroups(groups, 'name');
    expect(result.map((g) => g.id)).toEqual(['g1', 'g2', 'g3']);
  });

  it('upserts groups by id', () => {
    const next = upsertGroup(groups, { id: 'g2', name: 'Beta', member_count: 8 });
    const updated = next.find((g) => g.id === 'g2');
    expect(updated.member_count).toBe(8);
  });

  it('removes groups by id', () => {
    const next = removeGroupById(groups, 'g1');
    expect(next.map((g) => g.id)).toEqual(['g2', 'g3']);
  });

  it('updates member counts', () => {
    const next = updateGroupMemberCount(groups, 'g1', 2);
    const updated = next.find((g) => g.id === 'g1');
    expect(updated.member_count).toBe(4);
  });
});

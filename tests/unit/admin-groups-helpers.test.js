import { describe, expect, it } from 'vitest';
import { shouldLoadGroups } from '../../public/js/features/admin/users/groups-helpers.js';

describe('admin groups helpers', () => {
  it('loads when groups empty and not loading', () => {
    expect(shouldLoadGroups({ groups: [], groupsLoading: false })).toBe(true);
  });

  it('does not load when already loading', () => {
    expect(shouldLoadGroups({ groups: [], groupsLoading: true })).toBe(false);
  });

  it('does not load when groups already present', () => {
    expect(shouldLoadGroups({ groups: [{ id: 'g1' }], groupsLoading: false })).toBe(false);
  });
});

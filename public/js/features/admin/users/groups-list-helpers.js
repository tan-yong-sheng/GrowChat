export function sortGroups(groups = [], sortKey = 'members') {
  const list = Array.isArray(groups) ? groups.slice() : [];
  if (sortKey === 'name') {
    return list.sort((a, b) => {
      const nameA = String(a?.name || '').toLowerCase();
      const nameB = String(b?.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }

  return list.sort((a, b) => {
    const countDiff = (b?.member_count || 0) - (a?.member_count || 0);
    if (countDiff !== 0) return countDiff;
    const nameA = String(a?.name || '').toLowerCase();
    const nameB = String(b?.name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });
}

export function nextGroupSort(current = 'members') {
  return current === 'members' ? 'name' : 'members';
}

export function formatSortLabel(sortKey = 'members') {
  return sortKey === 'name' ? 'Name' : 'Members';
}

export function upsertGroup(groups = [], group) {
  const list = Array.isArray(groups) ? groups.slice() : [];
  const idx = list.findIndex((item) => item?.id === group?.id);
  if (idx === -1) {
    list.push(group);
  } else {
    list[idx] = { ...list[idx], ...group };
  }
  return list;
}

export function removeGroupById(groups = [], groupId) {
  const list = Array.isArray(groups) ? groups : [];
  return list.filter((item) => item?.id !== groupId);
}

export function updateGroupMemberCount(groups = [], groupId, delta = 0) {
  const list = Array.isArray(groups) ? groups.slice() : [];
  const idx = list.findIndex((item) => item?.id === groupId);
  if (idx === -1) return list;
  const current = Number(list[idx].member_count || 0);
  const nextCount = Math.max(0, current + delta);
  list[idx] = { ...list[idx], member_count: nextCount };
  return list;
}

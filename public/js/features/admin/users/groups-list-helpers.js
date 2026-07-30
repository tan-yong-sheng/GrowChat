/**
 * Helpers for the admin groups page.
 */
export { escapeHtml } from '../../../shared/utils/dom-escape.js';

export function getGroupModalTheme() {
  return {
    overlay: 'bg-primary/25',
    container: 'bg-white text-gray-900 border border-gray-200 shadow-2xl',
    sidebar: 'border-r border-gray-200 bg-white',
    sidebarActive: 'bg-gray-100 text-gray-900',
    sidebarInactive: 'text-gray-700 hover:text-gray-900',
    panelLabel: 'text-gray-600',
    panelText: 'text-gray-900',
    input: 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-gray-400',
    select: 'bg-white border-gray-300 text-gray-900 focus:border-gray-400',
    footer: 'border-t border-gray-200 bg-white',
  };
}

function compareGroupNames(a, b) {
  const nameA = String(a?.name || '').toLowerCase();
  const nameB = String(b?.name || '').toLowerCase();
  return nameA.localeCompare(nameB);
}

function compareGroupMembersThenNames(a, b) {
  const countDiff = (b?.member_count || 0) - (a?.member_count || 0);
  if (countDiff !== 0) return countDiff;
  return compareGroupNames(a, b);
}

export function sortGroups(groups = [], sortKey = 'members') {
  const list = Array.isArray(groups) ? groups.slice() : [];
  if (sortKey === 'name') {
    return list.sort(compareGroupNames);
  }

  return list.sort(compareGroupMembersThenNames);
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

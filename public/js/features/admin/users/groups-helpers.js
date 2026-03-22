export function shouldLoadGroups(data) {
  const groups = Array.isArray(data?.groups) ? data.groups : [];
  return groups.length === 0 && !data?.groupsLoading;
}

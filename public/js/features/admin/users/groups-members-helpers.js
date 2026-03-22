export function buildMemberSet(members = []) {
  return new Set(
    (Array.isArray(members) ? members : [])
      .map((member) => member?.id)
      .filter(Boolean)
  );
}

export function diffMemberSets(beforeSet, afterSet) {
  const add = [];
  const remove = [];
  const before = beforeSet instanceof Set ? beforeSet : new Set();
  const after = afterSet instanceof Set ? afterSet : new Set();

  after.forEach((id) => {
    if (!before.has(id)) add.push(id);
  });

  before.forEach((id) => {
    if (!after.has(id)) remove.push(id);
  });

  return {
    add: add.sort(),
    remove: remove.sort(),
  };
}

export function filterUsers(users = [], query = '') {
  const list = Array.isArray(users) ? users : [];
  const normalized = String(query || '').trim().toLowerCase();
  if (!normalized) return list;

  return list.filter((user) => {
    const name = String(user?.name || '').toLowerCase();
    const email = String(user?.email || '').toLowerCase();
    return name.includes(normalized) || email.includes(normalized);
  });
}

export function clampUserLimit(limit = 100) {
  const value = Number(limit);
  if (!Number.isFinite(value) || value <= 0) return 100;
  return Math.min(100, Math.max(1, Math.floor(value)));
}

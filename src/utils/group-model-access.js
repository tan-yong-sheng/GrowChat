const MISSING_TABLE_REGEX = /no such table:\s*(group_model_access|group_members)/i;

export async function ensureGroupModelAccessTables(db) {
  try {
    await db.run(
      `CREATE TABLE IF NOT EXISTS group_model_access (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      )`
    );
    await db.run('CREATE INDEX IF NOT EXISTS idx_group_model_access_group_id ON group_model_access(group_id)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_group_model_access_model_id ON group_model_access(model_id)');
  } catch (err) {
    console.warn('Failed to ensure group_model_access table:', err?.message || err);
  }
}

export function normalizeModelIdList(value) {
  if (!Array.isArray(value)) {
    return { ids: [], invalid: ['model_ids'] };
  }
  const ids = [];
  const invalid = [];
  value.forEach((item) => {
    const trimmed = typeof item === 'string' ? item.trim() : '';
    if (!trimmed) return;
    if (trimmed.length > 200 || /\s/.test(trimmed)) {
      invalid.push(trimmed || String(item));
      return;
    }
    ids.push(trimmed);
  });
  return { ids: Array.from(new Set(ids)), invalid };
}

export async function loadGroupModelAccessForGroup(db, groupId) {
  if (!groupId) return [];
  try {
    await ensureGroupModelAccessTables(db);
    const rows = await db.all(
      'SELECT model_id FROM group_model_access WHERE group_id = ? ORDER BY model_id ASC',
      [groupId]
    );
    return rows.map((row) => row.model_id).filter(Boolean);
  } catch (err) {
    if (MISSING_TABLE_REGEX.test(String(err?.message || err))) {
      return [];
    }
    throw err;
  }
}

export async function loadGroupModelAccessForUser(db, userId) {
  if (!userId) return [];
  try {
    await ensureGroupModelAccessTables(db);
    const rows = await db.all(
      `SELECT DISTINCT gma.model_id
       FROM group_model_access gma
       INNER JOIN group_members gm ON gm.group_id = gma.group_id
       WHERE gm.user_id = ?`,
      [userId]
    );
    return rows.map((row) => row.model_id).filter(Boolean);
  } catch (err) {
    if (MISSING_TABLE_REGEX.test(String(err?.message || err))) {
      return [];
    }
    throw err;
  }
}

export function filterModelsByAllowlist(models = [], allowlist = []) {
  if (!Array.isArray(allowlist) || allowlist.length === 0) return models;
  const allowSet = new Set(allowlist);
  return (Array.isArray(models) ? models : []).filter((model) => allowSet.has(model.id));
}

export async function enforceGroupModelAccess(db, userId, modelId) {
  const allowlist = await loadGroupModelAccessForUser(db, userId);
  if (!allowlist.length) {
    return { allowed: true, allowlist };
  }
  const allowed = allowlist.includes(modelId);
  return { allowed, allowlist };
}

export function normalizePublicRole(value) {
  const role = String(value || '').trim().toLowerCase();
  return role === 'admin' ? 'admin' : 'member';
}

async function queryFirst(db, sql, bindings) {
  if (!db) return null;
  if (typeof db.first === 'function') {
    return db.first(sql, bindings);
  }
  if (typeof db.prepare === 'function') {
    const stmt = db.prepare(sql);
    return stmt.bind(...bindings).first();
  }
  return null;
}

export async function loadPrimaryRole(db, userId) {
  if (!userId) return null;
  try {
    const row = await queryFirst(
      db,
      `SELECT COALESCE((
         SELECT r.name
         FROM user_roles ur
         INNER JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = ?
         ORDER BY r.name ASC
         LIMIT 1
       ), 'member') AS role`,
      [userId]
    );
    return row?.role ? normalizePublicRole(row.role) : null;
  } catch {
    return null;
  }
}

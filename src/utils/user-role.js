export function normalizePublicRole(value) {
  const role = String(value || '')
    .trim()
    .toLowerCase();
  return role === 'admin' ? 'admin' : 'member';
}

export async function loadPrimaryRole(db, userId) {
  if (!db || !userId) return null;
  try {
    const row = await (typeof db.first === 'function'
      ? db.first(
          `SELECT COALESCE((
             SELECT r.name
             FROM user_roles ur
             INNER JOIN roles r ON r.id = ur.role_id
             WHERE ur.user_id = ?
             ORDER BY r.name ASC
             LIMIT 1
           ), 'member') AS role`,
          [userId]
        )
      : db
          .prepare(
            `SELECT COALESCE((
             SELECT r.name
             FROM user_roles ur
             INNER JOIN roles r ON r.id = ur.role_id
             WHERE ur.user_id = ?
             ORDER BY r.name ASC
             LIMIT 1
           ), 'member') AS role`
          )
          .bind(userId)
          .first());
    return row?.role ? normalizePublicRole(row.role) : null;
  } catch {
    return null;
  }
}

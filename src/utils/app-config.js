export async function getConfigValue(db, key, fallback = null) {
  if (!key) return fallback;
  try {
    const row = await db.first('SELECT value FROM app_config WHERE key = ?', [key]);
    if (!row || row.value === undefined || row.value === null) return fallback;
    return row.value;
  } catch (err) {
    if (/no such table:\s*app_config/i.test(String(err?.message || ''))) {
      return fallback;
    }
    throw err;
  }
}

export async function getConfigBool(db, key, fallback = false) {
  const value = await getConfigValue(db, key, null);
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).toLowerCase().trim();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

export async function setConfigValue(db, key, value) {
  if (!key) return;
  try {
    await db.run(
      `INSERT INTO app_config (key, value, updated_at)
       VALUES (?, ?, unixepoch())
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()`,
      [key, value]
    );
  } catch (err) {
    if (/no such table:\s*app_config/i.test(String(err?.message || ''))) {
      console.warn('app_config table missing; run migrations/009_app_config.sql');
      return;
    }
    throw err;
  }
}

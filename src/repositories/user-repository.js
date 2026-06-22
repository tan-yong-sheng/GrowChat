function normalizeAccountStatus(status) {
  const normalized = String(status || 'active')
    .trim()
    .toLowerCase();
  return normalized === 'pending' ? 'pending' : 'active';
}

function buildUserInsertParams(id, user, accountStatus) {
  return [
    id,
    user.email,
    user.passwordHash,
    user.name,
    accountStatus,
    user.settings || '{}',
    user.preferences || '{}',
  ];
}

async function tryInsertUser(db, params) {
  await db.run(
    `INSERT INTO users (
      id, email, password_hash, name, account_status, settings, preferences,
      created_at, updated_at, last_active_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch(), unixepoch())`,
    params
  );
}

async function tryInsertUserFallback(db, params) {
  await db.run(
    'INSERT INTO users (id, email, password_hash, name, account_status, settings, preferences, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())',
    params
  );
}

async function insertUserWithFallback(db, params) {
  try {
    await tryInsertUser(db, params);
  } catch (err) {
    if (/no such column:\s*last_active_at/i.test(String(err?.message || ''))) {
      await tryInsertUserFallback(db, params);
    } else {
      throw err;
    }
  }
}

export class UserRepository {
  constructor(db) {
    this.db = db;
  }

  async count() {
    const row = await this.db.first('SELECT COUNT(*) as count FROM users');
    return Number(row?.count || 0);
  }

  async findById(userId, columns = '*') {
    return this.db.first(`SELECT ${columns} FROM users WHERE id = ?`, [userId]);
  }

  async findByEmail(email, columns = '*') {
    return this.db.first(`SELECT ${columns} FROM users WHERE email = ?`, [email]);
  }

  async create(user) {
    const id = user.id || crypto.randomUUID();
    const accountStatus = normalizeAccountStatus(user.accountStatus || user.account_status);
    const params = buildUserInsertParams(id, user, accountStatus);
    await insertUserWithFallback(this.db, params);
    return this.findById(id);
  }

  async touchLastActive(userId) {
    if (!userId) return;
    try {
      await this.db.run('UPDATE users SET last_active_at = unixepoch() WHERE id = ?', [userId]);
    } catch (err) {
      if (/no such column:\s*last_active_at/i.test(String(err?.message || ''))) {
        return;
      }
      throw err;
    }
  }

  async list({ limit, offset, columns = '*' }) {
    return this.db.all(
      `SELECT ${columns} FROM users
       ORDER BY LOWER(COALESCE(name, '')) ASC, LOWER(email) ASC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
  }
}

export function createUserRepository(db) {
  return new UserRepository(db);
}

import { createDB } from '../db.js';
import { error, json } from '../utils/response.js';
import { hashPassword, signJWT, verifyPassword } from '../auth.js';
import { createRefreshToken, consumeRefreshToken, revokeRefreshToken } from '../session.js';

async function ensureUserRoleBinding(db, userId, role) {
  if (!userId || !role || role === 'inactive') return;
  const mappedRole = role === 'admin' ? 'admin' : 'member';

  await db.run(
    `INSERT OR IGNORE INTO user_roles (id, user_id, role_id, scope_type, scope_id, created_at)
     SELECT ?, ?, r.id, NULL, NULL, unixepoch()
     FROM roles r
     WHERE r.name = ?`,
    [crypto.randomUUID(), userId, mappedRole]
  );
}

function sanitizeUser(user) {
  let settings = {};
  try {
    settings = user.settings ? JSON.parse(user.settings) : {};
  } catch {
    settings = {};
  }
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    settings,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

function readBearerToken(req) {
  const header = req.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

async function createAccessToken(env, user) {
  return signJWT(
    { sub: user.id, email: user.email, role: user.role, name: user.name },
    env.JWT_SECRET,
    60 * 15
  );
}

export async function authRouter(req, env, _ctx, _authUser, path) {
  const db = createDB(env.DB);

  if (path.startsWith('/api/auth/') && !env.JWT_SECRET) {
    return error(req, 'JWT_SECRET is not configured', 500);
  }

  if (req.method === 'POST' && path === '/api/auth/register') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const email = String(body.email || '').trim().toLowerCase();
    const name = String(body.name || '').trim();
    const password = String(body.password || '');

    if (!email || !name || !password) {
      return error(req, 'email, name, password are required', 400);
    }
    if (password.length < 8) {
      return error(req, 'Password must be at least 8 characters', 400);
    }

    const existing = await db.first('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) return error(req, 'Email already registered', 409);

    const firstUser = await db.first('SELECT id FROM users LIMIT 1');
    const role = firstUser ? 'user' : 'admin';

    const id = crypto.randomUUID();
    const passwordHash = await hashPassword(password);
    await db.run(
      'INSERT INTO users (id, email, password_hash, name, role, settings, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())',
      [id, email, passwordHash, name, role, '{}']
    );
    await ensureUserRoleBinding(db, id, role);

    const user = await db.first('SELECT * FROM users WHERE id = ?', [id]);
    const accessToken = await createAccessToken(env, user);
    const refresh = await createRefreshToken(env, user.id);

    return json(req, {
      user: sanitizeUser(user),
      access_token: accessToken,
      refresh_token: refresh.token,
      expires_in: 900,
      refresh_expires_at: refresh.expiresAt,
    }, 201);
  }

  if (req.method === 'POST' && path === '/api/auth/login') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!email || !password) {
      return error(req, 'email and password are required', 400);
    }

    const user = await db.first('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) return error(req, 'Invalid credentials', 401);
    await ensureUserRoleBinding(db, user.id, user.role);

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) return error(req, 'Invalid credentials', 401);

    const accessToken = await createAccessToken(env, user);
    const refresh = await createRefreshToken(env, user.id);

    return json(req, {
      user: sanitizeUser(user),
      access_token: accessToken,
      refresh_token: refresh.token,
      expires_in: 900,
      refresh_expires_at: refresh.expiresAt,
    });
  }

  if (req.method === 'POST' && path === '/api/auth/refresh') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const refreshToken = String(body.refresh_token || '');
    if (!refreshToken) return error(req, 'refresh_token is required', 400);

    const session = await consumeRefreshToken(env, refreshToken);
    if (!session?.userId) return error(req, 'Invalid refresh token', 401);

    const user = await db.first('SELECT * FROM users WHERE id = ?', [session.userId]);
    if (!user) return error(req, 'User not found', 404);
    await ensureUserRoleBinding(db, user.id, user.role);

    const accessToken = await createAccessToken(env, user);
    const refresh = await createRefreshToken(env, user.id);

    return json(req, {
      user: sanitizeUser(user),
      access_token: accessToken,
      refresh_token: refresh.token,
      expires_in: 900,
      refresh_expires_at: refresh.expiresAt,
    });
  }

  if (req.method === 'POST' && path === '/api/auth/logout') {
    let body = {};
    try {
      body = await req.json();
    } catch {
      // Allow empty body
    }

    const tokenFromBody = body.refresh_token ? String(body.refresh_token) : null;
    const bearer = readBearerToken(req);

    if (tokenFromBody) {
      await revokeRefreshToken(env, tokenFromBody);
    }

    if (bearer && !tokenFromBody) {
      // Optional compatibility path: no-op for bearer-only logout
    }

    return json(req, { ok: true });
  }

  return null;
}

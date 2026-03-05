import { createDB } from '../db.js';
import { error, json } from '../utils/response.js';

export async function usersRouter(req, env, _ctx, user, path) {
  if (!user) return error(req, 'Unauthorized', 401);

  if (req.method === 'GET' && path === '/api/users/me') {
    const db = createDB(env.DB);
    const row = await db.first(
      'SELECT id, email, name, role, settings, created_at, updated_at FROM users WHERE id = ?',
      [user.sub]
    );

    if (!row) return error(req, 'User not found', 404);

    let settings = {};
    if (row.settings) {
      try {
        settings = JSON.parse(row.settings);
      } catch {
        settings = {};
      }
    }

    return json(req, {
      user: {
        ...row,
        settings,
      },
    });
  }

  return null;
}

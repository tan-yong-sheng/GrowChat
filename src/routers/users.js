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

  if (req.method === 'PUT' && path === '/api/users/me') {
    const db = createDB(env.DB);

    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const name = body.name !== undefined ? String(body.name).trim() : undefined;

    let settingsObj;
    if (body.settings !== undefined) {
      const isPlainObject =
        typeof body.settings === 'object' &&
        body.settings !== null &&
        !Array.isArray(body.settings);
      if (!isPlainObject) {
        return error(req, 'settings must be an object', 400);
      }
      settingsObj = body.settings;
    }

    // Build update query
    const updates = [];
    const values = [];

    if (name !== undefined) {
      if (!name) return error(req, 'name cannot be empty', 400);
      updates.push('name = ?');
      values.push(name);
    }

    if (settingsObj !== undefined) {
      updates.push('settings = ?');
      values.push(JSON.stringify(settingsObj));
    }

    if (updates.length === 0) {
      return error(req, 'No fields to update', 400);
    }

    updates.push('updated_at = unixepoch()');
    values.push(user.sub);

    await db.run(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    // Return updated user
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

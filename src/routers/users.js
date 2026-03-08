import { createDB } from '../db.js';
import { error, json } from '../utils/response.js';
import { isValidEmail } from '../utils/rbac.js';
import { authorize, logAuditEvent, isLastOwnerOfRole, resolvePermissions, getUserRoles } from '../utils/authorize.js';

async function upsertGlobalRoleBinding(db, userId, role) {
  await db.run(
    'DELETE FROM user_roles WHERE user_id = ? AND scope_type IS NULL AND scope_id IS NULL',
    [userId]
  );

  if (role === 'inactive') return;
  const mappedRole = role === 'admin' ? 'admin' : 'member';
  await db.run(
    `INSERT OR IGNORE INTO user_roles (id, user_id, role_id, scope_type, scope_id, created_at)
     SELECT ?, ?, r.id, NULL, NULL, unixepoch()
     FROM roles r
     WHERE r.name = ?`,
    [crypto.randomUUID(), userId, mappedRole]
  );
}

export async function usersRouter(req, env, _ctx, user, path) {
  const isUsersPath =
    path === '/api/users/me' ||
    path === '/api/users/me/update' ||
    path === '/api/users/me/permissions' ||
    path === '/api/users/me/roles' ||
    path === '/api/admin/users' ||
    /^\/api\/admin\/users\/[^/]+$/.test(path);

  if (!isUsersPath) return null;
  if (!user) return error(req, 'Unauthorized', 401);

  if (req.method === 'GET' && path === '/api/users/me/permissions') {
    const permissions = await resolvePermissions(env, user);
    return json(req, { permissions });
  }

  if (req.method === 'GET' && path === '/api/users/me/roles') {
    const roles = await getUserRoles(env, user.sub);
    return json(req, { roles });
  }

  if (req.method === 'GET' && path === '/api/users/me') {
    const db = createDB(env.DB);
    const row = await db.first(
      'SELECT id, email, name, role, settings, avatar, avatar_emoji, status, preferences, created_at, updated_at FROM users WHERE id = ?',
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

    let preferences = {};
    if (row.preferences) {
      try {
        preferences = JSON.parse(row.preferences);
      } catch {
        preferences = {};
      }
    }

    return json(req, {
      user: {
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        settings,
        avatar: row.avatar || null,
        avatar_emoji: row.avatar_emoji || null,
        status: row.status || 'offline',
        preferences,
        created_at: row.created_at,
        updated_at: row.updated_at,
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
    const avatar = body.avatar !== undefined ? String(body.avatar).trim() || null : undefined;
    const avatar_emoji = body.avatar_emoji !== undefined ? String(body.avatar_emoji).trim() || null : undefined;
    const status = body.status !== undefined ? String(body.status).toLowerCase().trim() : undefined;

    // Validate status enum
    if (status !== undefined && !['online', 'away', 'offline'].includes(status)) {
      return error(req, 'Status must be one of: online, away, offline', 400);
    }

    // Validate avatar_emoji length
    if (avatar_emoji && avatar_emoji.length > 50) {
      return error(req, 'Avatar emoji must be 50 characters or less', 400);
    }

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

    let preferencesObj;
    if (body.preferences !== undefined) {
      const isPlainObject =
        typeof body.preferences === 'object' &&
        body.preferences !== null &&
        !Array.isArray(body.preferences);
      if (!isPlainObject) {
        return error(req, 'preferences must be an object', 400);
      }
      preferencesObj = body.preferences;
    }

    // Build update query
    const updates = [];
    const values = [];

    if (name !== undefined) {
      if (!name) return error(req, 'name cannot be empty', 400);
      updates.push('name = ?');
      values.push(name);
    }

    if (avatar !== undefined) {
      updates.push('avatar = ?');
      values.push(avatar);
    }

    if (avatar_emoji !== undefined) {
      updates.push('avatar_emoji = ?');
      values.push(avatar_emoji);
    }

    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
    }

    if (settingsObj !== undefined) {
      updates.push('settings = ?');
      values.push(JSON.stringify(settingsObj));
    }

    if (preferencesObj !== undefined) {
      updates.push('preferences = ?');
      values.push(JSON.stringify(preferencesObj));
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
      'SELECT id, email, name, role, settings, avatar, avatar_emoji, status, preferences, created_at, updated_at FROM users WHERE id = ?',
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

    let preferences = {};
    if (row.preferences) {
      try {
        preferences = JSON.parse(row.preferences);
      } catch {
        preferences = {};
      }
    }

    return json(req, {
      user: {
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        settings,
        avatar: row.avatar || null,
        avatar_emoji: row.avatar_emoji || null,
        status: row.status || 'offline',
        preferences,
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
    });
  }

  if (req.method === 'POST' && path === '/api/users/me/update') {
    const db = createDB(env.DB);

    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const name = body.name !== undefined ? String(body.name).trim() : undefined;
    const avatar = body.avatar !== undefined ? String(body.avatar).trim() || null : undefined;
    const avatar_emoji = body.avatar_emoji !== undefined ? String(body.avatar_emoji).trim() || null : undefined;
    const status = body.status !== undefined ? String(body.status).toLowerCase().trim() : undefined;

    // Validate status enum
    if (status !== undefined && !['online', 'away', 'offline'].includes(status)) {
      return error(req, 'Status must be one of: online, away, offline', 400);
    }

    // Validate avatar_emoji length
    if (avatar_emoji && avatar_emoji.length > 50) {
      return error(req, 'Avatar emoji must be 50 characters or less', 400);
    }

    let preferencesObj;
    if (body.preferences !== undefined) {
      const isPlainObject =
        typeof body.preferences === 'object' &&
        body.preferences !== null &&
        !Array.isArray(body.preferences);
      if (!isPlainObject) {
        return error(req, 'preferences must be an object', 400);
      }
      preferencesObj = body.preferences;
    }

    // Build update query
    const updates = [];
    const values = [];

    if (name !== undefined) {
      if (!name) return error(req, 'name cannot be empty', 400);
      updates.push('name = ?');
      values.push(name);
    }

    if (avatar !== undefined) {
      updates.push('avatar = ?');
      values.push(avatar);
    }

    if (avatar_emoji !== undefined) {
      updates.push('avatar_emoji = ?');
      values.push(avatar_emoji);
    }

    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
    }

    if (preferencesObj !== undefined) {
      updates.push('preferences = ?');
      values.push(JSON.stringify(preferencesObj));
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
      'SELECT id, email, name, role, settings, avatar, avatar_emoji, status, preferences, created_at, updated_at FROM users WHERE id = ?',
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

    let preferences = {};
    if (row.preferences) {
      try {
        preferences = JSON.parse(row.preferences);
      } catch {
        preferences = {};
      }
    }

    return json(req, {
      user: {
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        settings,
        avatar: row.avatar || null,
        avatar_emoji: row.avatar_emoji || null,
        status: row.status || 'offline',
        preferences,
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
    });
  }

  // GET /api/admin/users - List all users (admin only)
  if (req.method === 'GET' && path === '/api/admin/users') {
    // Check authorization
    const authDecision = await authorize(env, user, {
      action: 'admin.user.read',
      resource: 'users'
    });

    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    const db = createDB(env.DB);
    const limit = Math.min(parseInt(new URL(req.url).searchParams.get('limit') || '100'), 100);
    const offset = parseInt(new URL(req.url).searchParams.get('offset') || '0');

    try {
      const users = await db.all(
        `SELECT id, email, name, role, settings, created_at, updated_at
         FROM users
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [limit, offset]
      );

      // Parse settings JSON
      const parsedUsers = users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        settings: parseSettings(u.settings),
        created_at: u.created_at,
        updated_at: u.updated_at,
      }));

      // Log audit event
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'user_list_accessed',
        resource_type: 'users',
        resource_id: null,
        metadata: { limit, offset, count: parsedUsers.length }
      });

      return json(req, { users: parsedUsers, total: users.length });
    } catch (err) {
      console.error('List users failed:', err);
      return error(req, 'Failed to list users', 500);
    }
  }

  // GET /api/admin/users/:id - Get specific user (admin only)
  if (req.method === 'GET' && path.match(/^\/api\/admin\/users\/[^/]+$/)) {
    // Check authorization
    const userId = path.split('/').pop();
    const authDecision = await authorize(env, user, {
      action: 'admin.user.read',
      resource: 'user',
      resourceId: userId
    });

    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    const db = createDB(env.DB);

    try {
      const userData = await db.first(
        'SELECT id, email, name, role, settings, created_at, updated_at FROM users WHERE id = ?',
        [userId]
      );

      if (!userData) {
        return error(req, 'User not found', 404);
      }

      // Log audit event
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'user_read',
        resource_type: 'user',
        resource_id: userId
      });

      return json(req, {
        user: {
          id: userData.id,
          email: userData.email,
          name: userData.name,
          role: userData.role,
          settings: parseSettings(userData.settings),
          created_at: userData.created_at,
          updated_at: userData.updated_at,
        },
      });
    } catch (err) {
      console.error('Get user failed:', err);
      return error(req, 'Failed to fetch user', 500);
    }
  }

  // PUT /api/admin/users/:id - Update user role/status (admin only)
  if (req.method === 'PUT' && path.match(/^\/api\/admin\/users\/[^/]+$/)) {
    const userId = path.split('/').pop();

    // Check authorization
    const authDecision = await authorize(env, user, {
      action: 'admin.user.write',
      resource: 'user',
      resourceId: userId
    });

    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    const db = createDB(env.DB);

    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    // Verify user exists
    const existing = await db.first('SELECT id, role FROM users WHERE id = ?', [userId]);
    if (!existing) {
      return error(req, 'User not found', 404);
    }

    const updates = [];
    const values = [];
    let oldRole = existing.role;
    let newRole = oldRole;

    // Allow updating role (for admin promotion/demotion)
    if (body.role !== undefined) {
      newRole = String(body.role).toLowerCase();
      if (newRole === 'user' || newRole === 'admin') {
        // Check last-owner protection for admin role
        if (oldRole === 'admin' && newRole !== 'admin') {
          const isLastAdmin = await isLastOwnerOfRole(env, userId, 'admin');
          if (isLastAdmin) {
            return error(req, 'Cannot demote last admin', 409);
          }
        }
        updates.push('role = ?');
        values.push(newRole);
      } else {
        return error(req, 'Role must be "user" or "admin"', 400);
      }
    }

    // Can update name
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (name) {
        updates.push('name = ?');
        values.push(name);
      }
    }

    // Can reset settings
    if (body.settings !== undefined) {
      if (typeof body.settings !== 'object' || body.settings === null) {
        return error(req, 'Settings must be an object', 400);
      }
      updates.push('settings = ?');
      values.push(JSON.stringify(body.settings));
    }

    // Cannot change email via admin endpoint
    if (body.email !== undefined) {
      if (!isValidEmail(body.email)) {
        return error(req, 'Invalid email format', 400);
      }
      return error(req, 'Email cannot be changed via admin endpoint', 400);
    }

    if (updates.length === 0) {
      return error(req, 'No valid fields to update', 400);
    }

    updates.push('updated_at = unixepoch()');
    values.push(userId);

    try {
      await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
      if (oldRole !== newRole) {
        await upsertGlobalRoleBinding(db, userId, newRole);
      }

      // Log audit event for role change
      if (oldRole !== newRole) {
        await logAuditEvent(env, {
          actor_id: user.sub,
          action: 'role_change',
          resource_type: 'user',
          resource_id: userId,
          metadata: { old_role: oldRole, new_role: newRole }
        });
      }

      // Log generic user update
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'user_updated',
        resource_type: 'user',
        resource_id: userId,
        metadata: { fields_updated: updates.length }
      });

      // Return updated user
      const updated = await db.first(
        'SELECT id, email, name, role, settings, created_at, updated_at FROM users WHERE id = ?',
        [userId]
      );

      return json(req, {
        user: {
          id: updated.id,
          email: updated.email,
          name: updated.name,
          role: updated.role,
          settings: parseSettings(updated.settings),
          created_at: updated.created_at,
          updated_at: updated.updated_at,
        },
      });
    } catch (err) {
      console.error('Update user failed:', err);
      return error(req, 'Failed to update user', 500);
    }
  }

  // DELETE /api/admin/users/:id - Deactivate user (admin only)
  if (req.method === 'DELETE' && path.match(/^\/api\/admin\/users\/[^/]+$/)) {
    const userId = path.split('/').pop();

    // Check authorization
    const authDecision = await authorize(env, user, {
      action: 'admin.user.write',
      resource: 'user',
      resourceId: userId
    });

    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    const db = createDB(env.DB);

    try {
      // Cannot delete yourself
      if (userId === user.sub) {
        return error(req, 'Cannot deactivate your own account', 400);
      }

      // Verify user exists
      const existing = await db.first('SELECT id, role FROM users WHERE id = ?', [userId]);
      if (!existing) {
        return error(req, 'User not found', 404);
      }

      // Cannot delete the only admin
      const isLastAdmin = await isLastOwnerOfRole(env, userId, 'admin');
      if (existing.role === 'admin' && isLastAdmin) {
        return error(req, 'Cannot deactivate last admin', 400);
      }

      // Soft delete: update role to 'inactive'
      const oldRole = existing.role;
      await db.run('UPDATE users SET role = ?, updated_at = unixepoch() WHERE id = ?', ['inactive', userId]);
      await upsertGlobalRoleBinding(db, userId, 'inactive');

      // Log audit event
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'user_deactivated',
        resource_type: 'user',
        resource_id: userId,
        metadata: { previous_role: oldRole }
      });

      return json(req, { success: true, message: 'User deactivated successfully' });
    } catch (err) {
      console.error('Deactivate user failed:', err);
      return error(req, 'Failed to deactivate user', 500);
    }
  }

  return null;
}

function parseSettings(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

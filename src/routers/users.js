import { createDB } from '../db.js';
import { error, json } from '../utils/response.js';
import { authorize, logAuditEvent, isLastOwnerOfRole, resolvePermissions, getUserRoles } from '../utils/authorize.js';
import { getConfigValue } from '../utils/app-config.js';
import { hashPassword } from '../auth.js';
import { parsePagination, requirePlainObject, requireString, validateEmail } from '../validation/request.js';
import { isValidEmail } from '../utils/rbac.js';
import { ValidationError } from '../errors/http-errors.js';

async function upsertGlobalRoleBinding(db, userId, role) {
  try {
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
  } catch (err) {
    if (/no such table:\s*(user_roles|roles)/i.test(String(err?.message || ''))) {
      console.warn('RBAC role binding skipped: run migrations/010_rbac_core.sql');
      return;
    }
    throw err;
  }
}

export async function usersRouter(req, env, _ctx, user, path) {
  const isUsersPath =
    path === '/api/users/me' ||
    path === '/api/users/me/update' ||
    path === '/api/users/me/permissions' ||
    path === '/api/users/me/roles' ||
    path === '/api/admin/users' ||
    path === '/api/admin/users/import' ||
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
    const url = new URL(req.url);
    const includeParam = url.searchParams.get('include') || '';
    const include = new Set(includeParam.split(',').map((val) => val.trim()).filter(Boolean));
    const includePermissions = include.has('permissions') || include.has('all');
    const includeRoles = include.has('roles') || include.has('all');

    const row = await db.first(
      'SELECT id, email, name, role, settings, avatar, avatar_emoji, status, preferences, created_at, updated_at, last_active_at FROM users WHERE id = ?',
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
    let globalDefaultModelId = null;
    try {
      const rawDefault = await getConfigValue(db, 'default_model_id', null);
      globalDefaultModelId = rawDefault ? String(rawDefault).trim() : null;
    } catch {
      globalDefaultModelId = null;
    }

    const payload = {
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
        last_active_at: row.last_active_at || null,
        updated_at: row.updated_at,
      },
      app_config: {
        default_model_id: globalDefaultModelId || null,
      },
    };

    if (includePermissions) {
      payload.permissions = await resolvePermissions(env, user);
    }
    if (includeRoles) {
      payload.roles = await getUserRoles(env, user.sub);
    }

    return json(req, payload);
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

    let settingsObj;
    let preferencesObj;
    try {
      // Validate avatar_emoji length
      if (avatar_emoji && avatar_emoji.length > 50) {
        return error(req, 'Avatar emoji must be 50 characters or less', 400);
      }

      if (body.settings !== undefined) {
        settingsObj = requirePlainObject(body.settings, 'settings must be an object');
      }

      if (body.preferences !== undefined) {
        preferencesObj = requirePlainObject(body.preferences, 'preferences must be an object');
      }
    } catch (err) {
      if (err instanceof ValidationError) {
        return error(req, err.message, 400);
      }
      throw err;
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
    try {
      if (body.preferences !== undefined) {
        preferencesObj = requirePlainObject(body.preferences, 'preferences must be an object');
      }
    } catch (err) {
      if (err instanceof ValidationError) {
        return error(req, err.message, 400);
      }
      throw err;
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
    const { limit, offset } = parsePagination(new URL(req.url), { defaultLimit: 20, maxLimit: 100, defaultOffset: 0 });

    try {
      const totalRow = await db.first('SELECT COUNT(*) as count FROM users');
      const users = await db.all(
        `SELECT id, email, name, role, settings, created_at, updated_at, last_active_at
         FROM users
         ORDER BY
           CASE role
             WHEN 'admin' THEN 0
             WHEN 'user' THEN 1
             WHEN 'inactive' THEN 2
             ELSE 3
           END,
           LOWER(COALESCE(name, '')) ASC,
           LOWER(email) ASC
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
        last_active_at: u.last_active_at || null,
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

      return json(req, {
        users: parsedUsers,
        total: totalRow?.count || 0,
        limit,
        offset,
      });
    } catch (err) {
      console.error('List users failed:', err);
      return error(req, 'Failed to list users', 500);
    }
  }

  // POST /api/admin/users - Create user (admin only)
  if (req.method === 'POST' && path === '/api/admin/users') {
    const authDecision = await authorize(env, user, {
      action: 'admin.user.write',
      resource: 'users'
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

    let email;
    let name;
    let password;
    try {
      email = validateEmail(requireString(body.email, 'email, name, and password are required').toLowerCase());
      name = requireString(body.name, 'email, name, and password are required');
      password = requireString(body.password, 'email, name, and password are required', { trim: false });
    } catch (err) {
      if (err instanceof ValidationError) {
        return error(req, err.message, 400);
      }
      throw err;
    }
    const role = String(body.role || 'user').trim().toLowerCase();

    if (password.length < 8) {
      return error(req, 'Password must be at least 8 characters', 400);
    }

    if (!['user', 'admin', 'inactive'].includes(role)) {
      return error(req, 'Role must be "user", "admin", or "inactive"', 400);
    }

    const existing = await db.first('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      return error(req, 'Email already registered', 409);
    }

    const id = crypto.randomUUID();
    const passwordHash = await hashPassword(password);

    await db.run(
      `INSERT INTO users (
        id, email, password_hash, name, role, settings, preferences,
        created_at, updated_at, last_active_at
      ) VALUES (?, ?, ?, ?, ?, '{}', '{}', unixepoch(), unixepoch(), unixepoch())`,
      [id, email, passwordHash, name, role]
    );

    await upsertGlobalRoleBinding(db, id, role);

    const createdUser = await db.first(
      'SELECT id, email, name, role, settings, created_at, updated_at, last_active_at FROM users WHERE id = ?',
      [id]
    );

    await logAuditEvent(env, {
      actor_id: user.sub,
      action: 'user_created',
      resource_type: 'user',
      resource_id: id,
      metadata: { email, role }
    });

    return json(req, {
      user: {
        id: createdUser.id,
        email: createdUser.email,
        name: createdUser.name,
        role: createdUser.role,
        settings: parseSettings(createdUser.settings),
        created_at: createdUser.created_at,
        updated_at: createdUser.updated_at,
        last_active_at: createdUser.last_active_at || null,
      },
    }, 201);
  }

  // POST /api/admin/users/import - Bulk import users from CSV (admin only)
  if (req.method === 'POST' && path === '/api/admin/users/import') {
    const authDecision = await authorize(env, user, {
      action: 'admin.user.write',
      resource: 'users'
    });

    if (!authDecision.allow) {
      return error(req, authDecision.reason || 'Forbidden', 403);
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const csv = String(body.csv || '');
    if (!csv.trim()) {
      return error(req, 'csv is required', 400);
    }

    const rows = csv
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (rows.length === 0) {
      return error(req, 'CSV is empty', 400);
    }

    const db = createDB(env.DB);
    const results = [];
    let created = 0;

    const parseRow = (line) => line.split(',').map((value) => value.trim());

    for (let index = 0; index < rows.length; index += 1) {
      const line = rows[index];
      const rowNumber = index + 1;

      if (index === 0 && /^name\s*,\s*email\s*,\s*password\s*,\s*role$/i.test(line)) {
        continue;
      }

      const [name, emailRaw, password, roleRaw] = parseRow(line);
      const email = String(emailRaw || '').toLowerCase();
      const role = String(roleRaw || 'user').toLowerCase();

      if (!name || !email || !password || !role) {
        results.push({ row: rowNumber, ok: false, error: 'Each row must include name, email, password, role' });
        continue;
      }

      if (!isValidEmail(email)) {
        results.push({ row: rowNumber, ok: false, error: 'Invalid email format' });
        continue;
      }

      if (password.length < 8) {
        results.push({ row: rowNumber, ok: false, error: 'Password must be at least 8 characters' });
        continue;
      }

      if (!['user', 'admin', 'inactive'].includes(role)) {
        results.push({ row: rowNumber, ok: false, error: 'Role must be user, admin, or inactive' });
        continue;
      }

      const existing = await db.first('SELECT id FROM users WHERE email = ?', [email]);
      if (existing) {
        results.push({ row: rowNumber, ok: false, error: 'Email already registered' });
        continue;
      }

      const id = crypto.randomUUID();
      const passwordHash = await hashPassword(password);
      await db.run(
        `INSERT INTO users (
          id, email, password_hash, name, role, settings, preferences,
          created_at, updated_at, last_active_at
        ) VALUES (?, ?, ?, ?, ?, '{}', '{}', unixepoch(), unixepoch(), unixepoch())`,
        [id, email, passwordHash, name, role]
      );
      await upsertGlobalRoleBinding(db, id, role);
      results.push({ row: rowNumber, ok: true, email, role });
      created += 1;
    }

    await logAuditEvent(env, {
      actor_id: user.sub,
      action: 'user_imported',
      resource_type: 'users',
      resource_id: null,
      metadata: { created, attempted: results.length }
    });

    return json(req, {
      ok: true,
      created,
      results,
    }, 201);
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

  // PUT /api/admin/users/:id - Update user fields (admin only)
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
    const existing = await db.first('SELECT id, role, email, name FROM users WHERE id = ?', [userId]);
    if (!existing) {
      return error(req, 'User not found', 404);
    }

    const updates = [];
    const values = [];
    const updatedFields = [];
    let oldRole = existing.role;
    let newRole = oldRole;

    // Allow updating role (for admin promotion/demotion)
    if (body.role !== undefined) {
      newRole = String(body.role).toLowerCase();
      if (newRole === 'user' || newRole === 'admin' || newRole === 'inactive') {
        // Check last-owner protection for admin role
        if (oldRole === 'admin' && newRole !== 'admin') {
          const isLastAdmin = await isLastOwnerOfRole(env, userId, 'admin');
          if (isLastAdmin) {
            return error(req, 'Cannot demote last admin', 409);
          }
        }
        updates.push('role = ?');
        values.push(newRole);
        updatedFields.push('role');
      } else {
        return error(req, 'Role must be "user", "admin", or "inactive"', 400);
      }
    }

    // Can update name
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) {
        return error(req, 'Name cannot be empty', 400);
      }
      updates.push('name = ?');
      values.push(name);
      updatedFields.push('name');
    }

    // Can update email
    if (body.email !== undefined) {
      let email;
      try {
        email = validateEmail(String(body.email).trim().toLowerCase());
      } catch (err) {
        if (err instanceof ValidationError) {
          return error(req, err.message, 400);
        }
        throw err;
      }

      const duplicate = await db.first('SELECT id FROM users WHERE email = ? AND id != ?', [email, userId]);
      if (duplicate) {
        return error(req, 'Email already in use', 409);
      }

      updates.push('email = ?');
      values.push(email);
      updatedFields.push('email');
    }

    // Can update password
    if (body.password !== undefined) {
      const password = String(body.password);
      if (password.length < 8) {
        return error(req, 'Password must be at least 8 characters', 400);
      }
      updates.push('password_hash = ?');
      values.push(await hashPassword(password));
      updatedFields.push('password');
    }

    // Can reset settings
    if (body.settings !== undefined) {
      let settings;
      try {
        settings = requirePlainObject(body.settings, 'Settings must be an object');
      } catch (err) {
        if (err instanceof ValidationError) {
          return error(req, err.message, 400);
        }
        throw err;
      }
      updates.push('settings = ?');
      values.push(JSON.stringify(settings));
      updatedFields.push('settings');
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
        metadata: { fields_updated: updatedFields }
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

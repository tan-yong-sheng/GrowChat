/**
 * Users Me Handler
 */
import { createDB } from '../../db.js';
import { ValidationError } from '../../errors/http-errors.js';
import { getConfigValue } from '../../utils/app-config.js';
import { getUserRoles, resolvePermissions } from '../../utils/authorize.js';
import { error, json } from '../../utils/response.js';
import { loadPrimaryRole, normalizePublicRole } from '../../utils/user-role.js';
import { buildSelfProfileUpdate, buildUserProfileResponse } from '../user-profile.js';

/**
 * Handle users/me routes.
 * Returns Response if handled, null if path doesn't match.
 */
export async function handleUsersMe(req, env, ctx, user, path, { _db, _logger, _requestContext }) {
  if (req.method === 'GET' && path === '/api/users/me/permissions') {
    if (user.account_status && user.account_status !== 'active') {
      return error(req, 'Account pending approval.', 403);
    }
    const db = createDB(env.DB);
    const permissions = await resolvePermissions(db, user);
    return json(req, { permissions });
  }

  if (req.method === 'GET' && path === '/api/users/me/roles') {
    if (user.account_status && user.account_status !== 'active') {
      return error(req, 'Account pending approval.', 403);
    }
    const db = createDB(env.DB);
    const roles = await getUserRoles(db, user.sub);
    return json(req, { roles });
  }

  if (req.method === 'GET' && path === '/api/users/me') {
    if (user.account_status && user.account_status !== 'active') {
      return error(req, 'Account pending approval.', 403);
    }
    const db = createDB(env.DB);
    const url = new URL(req.url);
    const includeParam = url.searchParams.get('include') || '';
    const include = new Set(
      includeParam
        .split(',')
        .map((val) => val.trim())
        .filter(Boolean)
    );
    const includePermissions = include.has('permissions') || include.has('all');
    const includeRoles = include.has('roles') || include.has('all');

    const row = await db.first(
      'SELECT id, email, name, primary_role, account_status, settings, avatar, avatar_emoji, status, preferences, created_at, updated_at, last_active_at FROM users WHERE id = ?',
      [user.sub]
    );

    if (!row) return error(req, 'User not found', 404);
    const fallbackPrimaryRole = normalizePublicRole(row.primary_role);
    const primaryRolePromise = includeRoles
      ? loadPrimaryRole(db, user.sub)
      : Promise.resolve(fallbackPrimaryRole);
    const globalDefaultModelIdPromise = getConfigValue(db, 'default_model_id', null)
      .then((rawDefault) => (rawDefault ? String(rawDefault).trim() : null))
      .catch(() => null);
    const rolesPromise = includeRoles ? getUserRoles(db, user.sub) : Promise.resolve([]);
    const permissionsPromise = includePermissions
      ? resolvePermissions(db, user)
      : Promise.resolve([]);

    const [primaryRoleRaw, globalDefaultModelId, roles, permissions] = await Promise.all([
      primaryRolePromise,
      globalDefaultModelIdPromise,
      rolesPromise,
      permissionsPromise,
    ]);
    const primaryRole = normalizePublicRole(primaryRoleRaw || fallbackPrimaryRole);

    const payload = buildUserProfileResponse(row, {
      defaultModelId: globalDefaultModelId,
      primaryRole,
    });

    if (includePermissions) {
      payload.permissions = permissions;
    }
    if (includeRoles) {
      payload.roles = roles;
    }

    return json(req, payload);
  }

  if (req.method === 'PUT' && path === '/api/users/me') {
    if (user.account_status && user.account_status !== 'active') {
      return error(req, 'Account pending approval.', 403);
    }
    const db = createDB(env.DB);

    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    try {
      const update = buildSelfProfileUpdate(body, { allowSettings: true });
      const { updates, values } = update;

      updates.push('updated_at = unixepoch()');
      values.push(user.sub);

      await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);

      const row = await db.first(
        'SELECT id, email, name, account_status, settings, avatar, avatar_emoji, status, preferences, created_at, updated_at FROM users WHERE id = ?',
        [user.sub]
      );
      if (!row) return error(req, 'User not found', 404);

      const primaryRole = (await loadPrimaryRole(db, user.sub)) || 'member';
      return json(req, buildUserProfileResponse(row, { primaryRole }));
    } catch (err) {
      if (err instanceof ValidationError) {
        return error(req, err.message, 400);
      }
      throw err;
    }
  }

  if (req.method === 'POST' && path === '/api/users/me/update') {
    if (user.account_status && user.account_status !== 'active') {
      return error(req, 'Account pending approval.', 403);
    }
    const db = createDB(env.DB);

    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    try {
      const update = buildSelfProfileUpdate(body, { allowSettings: false });
      const { updates, values } = update;

      updates.push('updated_at = unixepoch()');
      values.push(user.sub);

      await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);

      const row = await db.first(
        'SELECT id, email, name, account_status, settings, avatar, avatar_emoji, status, preferences, created_at, updated_at FROM users WHERE id = ?',
        [user.sub]
      );
      if (!row) return error(req, 'User not found', 404);

      const primaryRole = (await loadPrimaryRole(db, user.sub)) || 'member';
      return json(req, buildUserProfileResponse(row, { primaryRole }));
    } catch (err) {
      if (err instanceof ValidationError) {
        return error(req, err.message, 400);
      }
      throw err;
    }
  }

  // GET /api/admin/users - List all users (admin only)
  return null;
}

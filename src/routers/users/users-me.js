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
    const denied = requireActiveAccount(req, user);
    if (denied) return denied;
    const db = createDB(env.DB);
    const permissions = await resolvePermissions(db, user);
    return json(req, { permissions });
  }

  if (req.method === 'GET' && path === '/api/users/me/roles') {
    const denied = requireActiveAccount(req, user);
    if (denied) return denied;
    const db = createDB(env.DB);
    const roles = await getUserRoles(db, user.sub);
    return json(req, { roles });
  }

  if (req.method === 'GET' && path === '/api/users/me') {
    return handleUsersMeGet(req, env, user);
  }

  if (req.method === 'PUT' && path === '/api/users/me') {
    return handleSelfProfileUpdate(
      req,
      env,
      ctx,
      user,
      { allowSettings: true },
      { _db, _logger, _requestContext }
    );
  }

  if (req.method === 'POST' && path === '/api/users/me/update') {
    return handleSelfProfileUpdate(
      req,
      env,
      ctx,
      user,
      { allowSettings: false },
      { _db, _logger, _requestContext }
    );
  }

  // GET /api/admin/users - List all users (admin only)
  return null;
}

/**
 * Shared handler for self-profile updates (PUT /api/users/me and POST /api/users/me/update).
 * The only difference between the two endpoints is the allowSettings flag.
 */
async function handleSelfProfileUpdate(
  req,
  env,
  _ctx,
  user,
  allowSettingsOption,
  { _db, _logger, _requestContext }
) {
  const denied = requireActiveAccount(req, user);
  if (denied) return denied;
  const db = createDB(env.DB);
  const body = await parseSelfProfileBody(req);
  if (!body.ok) return body.response;
  return executeSelfProfileUpdate(req, db, user, body.value, allowSettingsOption);
}

async function parseSelfProfileBody(req) {
  try {
    return { ok: true, value: await req.json() };
  } catch {
    return { ok: false, response: error(req, 'Invalid JSON body', 400) };
  }
}

async function executeSelfProfileUpdate(req, db, user, body, allowSettingsOption) {
  try {
    const update = buildSelfProfileUpdate(body, allowSettingsOption);
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

function requireActiveAccount(req, user) {
  if (user.account_status && user.account_status !== 'active') {
    return error(req, 'Account pending approval.', 403);
  }
  return null;
}

function parseIncludeParam(req) {
  const url = new URL(req.url);
  const includeParam = url.searchParams.get('include') || '';
  const include = new Set(
    includeParam
      .split(',')
      .map((val) => val.trim())
      .filter(Boolean)
  );
  return {
    permissions: include.has('permissions') || include.has('all'),
    roles: include.has('roles') || include.has('all'),
  };
}

async function loadUserProfileIncludeData(db, user, includes) {
  const row = await db.first(
    'SELECT id, email, name, primary_role, account_status, settings, avatar, avatar_emoji, status, preferences, created_at, updated_at, last_active_at FROM users WHERE id = ?',
    [user.sub]
  );
  const fallbackPrimaryRole = normalizePublicRole(row?.primary_role);
  const primaryRolePromise = includes.roles
    ? loadPrimaryRole(db, user.sub)
    : Promise.resolve(fallbackPrimaryRole);
  const globalDefaultModelIdPromise = getConfigValue(db, 'default_model_id', null)
    .then((rawDefault) => (rawDefault ? String(rawDefault).trim() : null))
    .catch(() => null);
  const rolesPromise = includes.roles ? getUserRoles(db, user.sub) : Promise.resolve([]);
  const permissionsPromise = includes.permissions
    ? resolvePermissions(db, user)
    : Promise.resolve([]);
  const [primaryRoleRaw, globalDefaultModelId, roles, permissions] = await Promise.all([
    primaryRolePromise,
    globalDefaultModelIdPromise,
    rolesPromise,
    permissionsPromise,
  ]);
  return {
    row,
    primaryRole: normalizePublicRole(primaryRoleRaw || fallbackPrimaryRole),
    globalDefaultModelId,
    roles,
    permissions,
  };
}

function buildUserProfilePayload(data, includes) {
  const payload = buildUserProfileResponse(data.row, {
    defaultModelId: data.globalDefaultModelId,
    primaryRole: data.primaryRole,
  });
  if (includes.permissions) {
    payload.permissions = data.permissions;
  }
  if (includes.roles) {
    payload.roles = data.roles;
  }
  return payload;
}

async function handleUsersMeGet(req, env, user) {
  const denied = requireActiveAccount(req, user);
  if (denied) return denied;
  const db = createDB(env.DB);
  const includes = parseIncludeParam(req);
  const data = await loadUserProfileIncludeData(db, user, includes);
  if (!data.row) return error(req, 'User not found', 404);
  return json(req, buildUserProfilePayload(data, includes));
}

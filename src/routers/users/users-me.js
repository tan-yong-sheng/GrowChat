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

const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const DEFAULT_ROLE = 'member';
const ACCOUNT_ACTIVE = 'active';
const SELF_PERMISSIONS_PATH = '/api/users/me/permissions';
const SELF_ROLES_PATH = '/api/users/me/roles';
const SELF_PROFILE_PATH = '/api/users/me';
const SELF_PROFILE_UPDATE_PATH = '/api/users/me/update';
const INCLUDE_ALL = 'all';
const INCLUDE_PERMISSIONS = 'permissions';
const INCLUDE_ROLES = 'roles';

/**
 * Handle users/me routes.
 * Returns Response if handled, null if path doesn't match.
 */
const SELF_PROFILE_ROUTES = {
  [`GET ${SELF_PERMISSIONS_PATH}`]: (params) => handleUsersMePermissions(params),
  [`GET ${SELF_ROLES_PATH}`]: (params) => handleUsersMeRoles(params),
  [`GET ${SELF_PROFILE_PATH}`]: (params) => handleUsersMeGet(params),
  [`PUT ${SELF_PROFILE_PATH}`]: (params) =>
    handleSelfProfileUpdate({ ...params, allowSettings: true }),
  [`POST ${SELF_PROFILE_UPDATE_PATH}`]: (params) =>
    handleSelfProfileUpdate({ ...params, allowSettings: false }),
};

function buildSelfProfileParams({ req, env, ctx, user }) {
  return { req, env, ctx, user };
}

export async function handleUsersMe({ req, env, ctx, user, path }) {
  const handler = SELF_PROFILE_ROUTES[`${req.method} ${path}`];
  if (!handler) return null;
  return handler(buildSelfProfileParams({ req, env, ctx, user }));
}

async function handleUsersMePermissions({ req, env, user }) {
  const denied = requireActiveAccount({ req, user });
  if (denied) return denied;
  const db = createDB(env.DB);
  const permissions = await resolvePermissions(db, user);
  return json(req, { permissions });
}

async function handleUsersMeRoles({ req, env, user }) {
  const denied = requireActiveAccount({ req, user });
  if (denied) return denied;
  const db = createDB(env.DB);
  const roles = await getUserRoles(db, user.sub);
  return json(req, { roles });
}

async function handleUsersMeGet({ req, env, user }) {
  const denied = requireActiveAccount({ req, user });
  if (denied) return denied;
  const db = createDB(env.DB);
  const includes = parseIncludeParam(req);
  const data = await loadUserProfileIncludeData(db, user, includes);
  if (!data.row) return error(req, 'User not found', HTTP_NOT_FOUND);
  return json(req, buildUserProfilePayload(data, includes));
}

/**
 * Shared handler for self-profile updates (PUT /api/users/me and POST /api/users/me/update).
 * The only difference between the two endpoints is the allowSettings flag.
 */
async function handleSelfProfileUpdate({ req, env, _ctx, user, allowSettings }) {
  const denied = requireActiveAccount({ req, user });
  if (denied) return denied;
  const db = createDB(env.DB);
  const body = await parseSelfProfileBody(req);
  if (!body.ok) return body.response;
  return executeSelfProfileUpdate({
    req,
    db,
    user,
    body: body.value,
    allowSettings,
  });
}

async function parseSelfProfileBody(req) {
  try {
    return { ok: true, value: await req.json() };
  } catch {
    return { ok: false, response: error(req, 'Invalid JSON body', HTTP_BAD_REQUEST) };
  }
}

async function executeSelfProfileUpdate({ req, db, user, body, allowSettings }) {
  try {
    const update = buildSelfProfileUpdate(body, { allowSettings });
    const { updates, values } = update;
    updates.push('updated_at = unixepoch()');
    values.push(user.sub);
    await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
    const row = await db.first(
      'SELECT id, email, name, account_status, settings, avatar, avatar_emoji, status, preferences, created_at, updated_at FROM users WHERE id = ?',
      [user.sub]
    );
    if (!row) return error(req, 'User not found', HTTP_NOT_FOUND);
    const primaryRole = (await loadPrimaryRole(db, user.sub)) || DEFAULT_ROLE;
    return json(req, buildUserProfileResponse(row, { primaryRole }));
  } catch (err) {
    if (err instanceof ValidationError) {
      return error(req, err.message, HTTP_BAD_REQUEST);
    }
    throw err;
  }
}

function requireActiveAccount({ req, user }) {
  if (user.account_status && user.account_status !== ACCOUNT_ACTIVE) {
    return error(req, 'Account pending approval.', HTTP_FORBIDDEN);
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
    permissions: include.has(INCLUDE_PERMISSIONS) || include.has(INCLUDE_ALL),
    roles: include.has(INCLUDE_ROLES) || include.has(INCLUDE_ALL),
  };
}

async function loadUserProfileIncludeData(db, user, includes) {
  const row = await db.first(
    'SELECT id, email, name, primary_role, account_status, settings, avatar, avatar_emoji, status, preferences, created_at, updated_at, last_active_at FROM users WHERE id = ?',
    [user.sub]
  );
  const fallbackPrimaryRole = normalizePublicRole(row?.primary_role);
  const [primaryRoleRaw, globalDefaultModelId, roles, permissions] = await Promise.all([
    loadOptionalPrimaryRole(db, user, includes, fallbackPrimaryRole),
    loadOptionalDefaultModelId(db),
    loadOptionalRoles(db, user, includes),
    loadOptionalPermissions(db, user, includes),
  ]);
  return {
    row,
    primaryRole: normalizePublicRole(primaryRoleRaw || fallbackPrimaryRole),
    globalDefaultModelId,
    roles,
    permissions,
  };
}

function loadOptionalPrimaryRole(db, user, includes, fallbackPrimaryRole) {
  if (includes.roles) return loadPrimaryRole(db, user.sub);
  return Promise.resolve(fallbackPrimaryRole);
}

function loadOptionalDefaultModelId(db) {
  return getConfigValue(db, 'default_model_id', null)
    .then((rawDefault) => (rawDefault ? String(rawDefault).trim() : null))
    .catch(() => null);
}

function loadOptionalRoles(db, user, includes) {
  if (includes.roles) return getUserRoles(db, user.sub);
  return Promise.resolve([]);
}

function loadOptionalPermissions(db, user, includes) {
  if (includes.permissions) return resolvePermissions(db, user);
  return Promise.resolve([]);
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

import { createDB } from '../../db.js';
import { ValidationError } from '../../errors/http-errors.js';
import { HTTP_STATUS } from '../../shared/http-status.js';
import { hashPassword } from '../../shared/auth.js';
import { authorize, isLastOwnerOfRole, logAuditEvent } from '../../utils/authorize.js';
import { authError, error, json } from '../../utils/response.js';
import { escapeHtml, stripHtml } from '../../utils/sanitize.js';
import { loadPrimaryRole } from '../../utils/user-role.js';
import { requirePlainObject, validateEmail } from '../../validation/request.js';
import {
  normalizeAccountStatus,
  resolveRequestedRole,
  syncGlobalRoleBinding,
  parseSettings,
} from './users-helpers.js';

class UpdateValidationError extends Error {
  constructor(message, status = HTTP_STATUS.BAD_REQUEST) {
    super(message);
    this.status = status;
  }
}

// admin dispatcher pattern (req, env, user, userId, logger)
export async function handleUpdateUserById(req, env, user, userId, logger) {
  const authDecision = await authorize(env, user, {
    action: 'admin.user.write',
    resource: 'user',
    resourceId: userId,
  });

  if (!authDecision.allow) {
    return authError(req, authDecision);
  }

  return performUserUpdate({ req, env, user, userId, logger });
}

// Context bundle intentionally carries all five fields for the update pipeline
async function performUserUpdate({ req, env, user, userId, logger }) {
  const db = createDB(env.DB);

  const bodyResult = await readJsonBody(req);
  if (bodyResult.error) return bodyResult.error;
  const body = bodyResult.body;

  const existingResult = await fetchExistingUser(db, req, userId);
  if (existingResult.error) return existingResult.error;
  const existing = existingResult.user;

  const oldRole = (await loadPrimaryRole(db, userId)) || 'member';
  const oldAccountStatus = normalizeAccountStatus(existing.account_status);
  const buildResult = await buildUserUpdates({
    req,
    db,
    env,
    body,
    userId,
    oldRole,
    oldAccountStatus,
  });

  if (buildResult.error) return buildResult.error;

  const { updates, values, updatedFields, newRole, roleChanged, newAccountStatus } = buildResult;

  if (updates.length === 0 && !roleChanged) {
    return error(req, 'No valid fields to update', HTTP_STATUS.BAD_REQUEST);
  }

  return await applyUserUpdate(req, env, db, {
    user,
    userId,
    logger,
    oldRole,
    oldAccountStatus,
    newRole,
    newAccountStatus,
    updatedFields,
    updates,
    values,
  });
}

async function readJsonBody(req) {
  try {
    return { body: await req.json() };
  } catch {
    return { error: error(req, 'Invalid JSON body', HTTP_STATUS.BAD_REQUEST) };
  }
}

async function fetchExistingUser(db, req, userId) {
  const existing = await db.first(
    'SELECT id, account_status, email, name FROM users WHERE id = ?',
    [userId]
  );
  if (!existing) {
    return { error: error(req, 'User not found', HTTP_STATUS.NOT_FOUND) };
  }
  return { user: existing };
}

async function applyUserUpdate(req, env, db, ctx) {
  const {
    user,
    userId,
    logger,
    oldRole,
    oldAccountStatus,
    newRole,
    newAccountStatus,
    updatedFields,
    updates,
    values,
  } = ctx;

  updates.push('updated_at = unixepoch()');
  values.push(userId);

  try {
    await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
    await syncRoleAndAudit(env, db, {
      user,
      userId,
      oldRole,
      oldAccountStatus,
      newRole,
      newAccountStatus,
      logger,
    });
    await logAuditEvent(env, {
      actor_id: user.sub,
      action: 'user_updated',
      resource_type: 'user',
      resource_id: userId,
      metadata: { fields_updated: updatedFields },
    });

    return json(req, {
      user: await fetchUpdatedUser(db, userId, newRole),
    });
  } catch (err) {
    logger.error('Update user failed', { error: err?.message || err });
    return error(req, 'Failed to update user', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

async function fetchUpdatedUser(db, userId, primaryRole) {
  const updated = await db.first(
    'SELECT id, email, name, account_status, settings, created_at, updated_at FROM users WHERE id = ?',
    [userId]
  );
  return {
    id: updated.id,
    email: updated.email,
    name: escapeHtml(String(updated.name || '')),
    primary_role: primaryRole,
    account_status: normalizeAccountStatus(updated.account_status),
    settings: parseSettings(updated.settings),
    created_at: updated.created_at,
    updated_at: updated.updated_at,
  };
}

async function syncRoleAndAudit(env, db, ctx) {
  const { user, userId, oldRole, oldAccountStatus, newRole, newAccountStatus, logger } = ctx;
  if (oldRole === newRole && oldAccountStatus === newAccountStatus) {
    return;
  }
  await syncGlobalRoleBinding(db, userId, newRole, newAccountStatus, logger);
  await logAuditEvent(env, {
    actor_id: user.sub,
    action: 'account_state_change',
    resource_type: 'user',
    resource_id: userId,
    metadata: {
      old_primary_role: oldRole,
      new_primary_role: newRole,
      old_account_status: oldAccountStatus,
      new_account_status: newAccountStatus,
    },
  });
}

async function buildUserUpdates({ req, db, env, body, userId, oldRole, oldAccountStatus }) {
  const state = { updates: [], values: [], updatedFields: [] };
  const ctx = { req, db, env, userId, oldRole, oldAccountStatus };
  const result = { newRole: oldRole, roleChanged: false, newAccountStatus: oldAccountStatus };

  try {
    await applyFieldUpdates(state, result, ctx, body);
  } catch (err) {
    if (err instanceof UpdateValidationError) {
      return { error: error(req, err.message, err.status) };
    }
    throw err;
  }

  return { ...state, ...result };
}

async function applyFieldUpdates(state, result, ctx, body) {
  if (body.primary_role !== undefined) {
    const roleResult = await resolveRoleUpdate({ ...ctx, body });
    result.newRole = roleResult.newRole;
    result.roleChanged = roleResult.roleChanged;
    pushUpdate(state, 'primary_role = ?', roleResult.newRole, 'primary_role');
  }

  if (body.account_status !== undefined) {
    result.newAccountStatus = normalizeAccountStatus(body.account_status, ctx.oldAccountStatus);
    await guardLastAdmin({
      env: ctx.env,
      userId: ctx.userId,
      oldRole: ctx.oldRole,
      newRole: result.newRole,
      newAccountStatus: result.newAccountStatus,
    });
    pushUpdate(state, 'account_status = ?', result.newAccountStatus, 'account_status');
  }

  if (body.name !== undefined) {
    await applyNameUpdate(state, body.name);
  }

  if (body.email !== undefined) {
    await applyEmailUpdate(state, { ...ctx, email: body.email });
  }

  if (body.password !== undefined) {
    const passwordHash = await hashPasswordFromBody(body.password);
    pushUpdate(state, 'password_hash = ?', passwordHash, 'password');
  }

  if (body.settings !== undefined) {
    const settingsJson = normalizeSettings(ctx.req, body.settings);
    pushUpdate(state, 'settings = ?', settingsJson, 'settings');
  }
}

async function applyNameUpdate(state, rawName) {
  const name = stripHtml(rawName);
  if (!name) {
    throw new UpdateValidationError(
      'Name cannot be empty after removing invalid characters',
      HTTP_STATUS.BAD_REQUEST
    );
  }
  pushUpdate(state, 'name = ?', name, 'name');
}

async function applyEmailUpdate(state, { req, db, userId, email }) {
  const normalized = normalizeEmail(req, email);
  const duplicate = await db.first('SELECT id FROM users WHERE email = ? AND id != ?', [
    normalized,
    userId,
  ]);
  if (duplicate) {
    throw new UpdateValidationError('Email already in use', HTTP_STATUS.CONFLICT);
  }
  pushUpdate(state, 'email = ?', normalized, 'email');
}

function pushUpdate(state, sql, value, field) {
  state.updates.push(sql);
  state.values.push(value);
  state.updatedFields.push(field);
}

async function resolveRoleUpdate({ db, env, body, userId, oldRole, oldAccountStatus }) {
  const requestedRole = String(body.primary_role || '').trim();
  const newRole = await resolveRequestedRole(db, requestedRole);
  if (!newRole) {
    throw new UpdateValidationError(
      'primary_role must match an existing role',
      HTTP_STATUS.BAD_REQUEST
    );
  }
  await guardLastAdmin({ env, userId, oldRole, newRole, newAccountStatus: oldAccountStatus });
  return { newRole, roleChanged: newRole !== oldRole };
}

async function guardLastAdmin({ env, userId, oldRole, newRole, newAccountStatus }) {
  if (oldRole === 'admin' && (newRole !== 'admin' || newAccountStatus !== 'active')) {
    const isLastAdmin = await isLastOwnerOfRole(env, userId, 'admin');
    if (isLastAdmin) {
      throw new UpdateValidationError('Cannot modify last admin', HTTP_STATUS.CONFLICT);
    }
  }
}

function normalizeEmail(req, rawEmail) {
  try {
    return validateEmail(String(rawEmail).trim().toLowerCase());
  } catch (err) {
    if (err instanceof ValidationError) {
      throw new UpdateValidationError(err.message, HTTP_STATUS.BAD_REQUEST);
    }
    throw err;
  }
}

// Password minimum length policy is enforced via this constant to keep it in sync with the regex/UI hints.
const MIN_PASSWORD_LENGTH = 8;

async function hashPasswordFromBody(password) {
  const text = String(password);
  if (text.length < MIN_PASSWORD_LENGTH) {
    throw new UpdateValidationError(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      HTTP_STATUS.BAD_REQUEST
    );
  }
  return hashPassword(text);
}

function normalizeSettings(req, rawSettings) {
  let settings;
  try {
    settings = requirePlainObject(rawSettings, 'Settings must be an object');
  } catch (err) {
    if (err instanceof ValidationError) {
      throw new UpdateValidationError(err.message, HTTP_STATUS.BAD_REQUEST);
    }
    throw err;
  }
  return JSON.stringify(settings);
}

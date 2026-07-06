import { createDB } from '../../db.js';
import { ValidationError } from '../../errors/http-errors.js';
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
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function handleUpdateUserById(req, env, user, userId, logger) {
  const authDecision = await authorize(env, user, {
    action: 'admin.user.write',
    resource: 'user',
    resourceId: userId,
  });

  if (!authDecision.allow) {
    return authError(req, authDecision);
  }

  const db = createDB(env.DB);

  let body;
  try {
    body = await req.json();
  } catch {
    return error(req, 'Invalid JSON body', 400);
  }

  const existing = await db.first(
    'SELECT id, account_status, email, name FROM users WHERE id = ?',
    [userId]
  );
  if (!existing) {
    return error(req, 'User not found', 404);
  }

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

  if (buildResult.error) {
    return buildResult.error;
  }

  const { updates, values, updatedFields, newRole, roleChanged, newAccountStatus } = buildResult;

  if (updates.length === 0 && !roleChanged) {
    return error(req, 'No valid fields to update', 400);
  }

  updates.push('updated_at = unixepoch()');
  values.push(userId);

  try {
    await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
    if (oldRole !== newRole || oldAccountStatus !== newAccountStatus) {
      await syncGlobalRoleBinding(db, userId, newRole, newAccountStatus, logger);
    }

    if (oldRole !== newRole || oldAccountStatus !== newAccountStatus) {
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

    await logAuditEvent(env, {
      actor_id: user.sub,
      action: 'user_updated',
      resource_type: 'user',
      resource_id: userId,
      metadata: { fields_updated: updatedFields },
    });

    const updated = await db.first(
      'SELECT id, email, name, account_status, settings, created_at, updated_at FROM users WHERE id = ?',
      [userId]
    );

    return json(req, {
      user: {
        id: updated.id,
        email: updated.email,
        name: escapeHtml(String(updated.name || '')),
        primary_role: newRole,
        account_status: normalizeAccountStatus(updated.account_status),
        settings: parseSettings(updated.settings),
        created_at: updated.created_at,
        updated_at: updated.updated_at,
      },
    });
  } catch (err) {
    logger.error('Update user failed', { error: err?.message || err });
    return error(req, 'Failed to update user', 500);
  }
}

async function buildUserUpdates({ req, db, env, body, userId, oldRole, oldAccountStatus }) {
  const state = { updates: [], values: [], updatedFields: [] };
  let newRole = oldRole;
  let newAccountStatus = oldAccountStatus;
  let roleChanged = false;

  try {
    if (body.primary_role !== undefined) {
      const result = await resolveRoleUpdate({ db, env, body, userId, oldRole, oldAccountStatus });
      newRole = result.newRole;
      roleChanged = result.roleChanged;
      pushUpdate(state, 'primary_role = ?', newRole, 'primary_role');
    }

    if (body.account_status !== undefined) {
      newAccountStatus = normalizeAccountStatus(body.account_status, oldAccountStatus);
      await guardLastAdmin({ env, userId, oldRole, newRole, newAccountStatus });
      pushUpdate(state, 'account_status = ?', newAccountStatus, 'account_status');
    }

    if (body.name !== undefined) {
      const name = stripHtml(body.name);
      if (!name) {
        throw new UpdateValidationError(
          'Name cannot be empty after removing invalid characters',
          400
        );
      }
      pushUpdate(state, 'name = ?', name, 'name');
    }

    if (body.email !== undefined) {
      const email = normalizeEmail(req, body.email);
      const duplicate = await db.first('SELECT id FROM users WHERE email = ? AND id != ?', [
        email,
        userId,
      ]);
      if (duplicate) {
        throw new UpdateValidationError('Email already in use', 409);
      }
      pushUpdate(state, 'email = ?', email, 'email');
    }

    if (body.password !== undefined) {
      const passwordHash = await hashPasswordFromBody(body.password);
      pushUpdate(state, 'password_hash = ?', passwordHash, 'password');
    }

    if (body.settings !== undefined) {
      const settingsJson = normalizeSettings(req, body.settings);
      pushUpdate(state, 'settings = ?', settingsJson, 'settings');
    }
  } catch (err) {
    if (err instanceof UpdateValidationError) {
      return { error: error(req, err.message, err.status) };
    }
    throw err;
  }

  return { ...state, newRole, roleChanged, newAccountStatus };
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
    throw new UpdateValidationError('primary_role must match an existing role', 400);
  }
  await guardLastAdmin({ env, userId, oldRole, newRole, newAccountStatus: oldAccountStatus });
  return { newRole, roleChanged: newRole !== oldRole };
}

async function guardLastAdmin({ env, userId, oldRole, newRole, newAccountStatus }) {
  if (oldRole === 'admin' && (newRole !== 'admin' || newAccountStatus !== 'active')) {
    const isLastAdmin = await isLastOwnerOfRole(env, userId, 'admin');
    if (isLastAdmin) {
      throw new UpdateValidationError('Cannot modify last admin', 409);
    }
  }
}

function normalizeEmail(req, rawEmail) {
  try {
    return validateEmail(String(rawEmail).trim().toLowerCase());
  } catch (err) {
    if (err instanceof ValidationError) {
      throw new UpdateValidationError(err.message, 400);
    }
    throw err;
  }
}

async function hashPasswordFromBody(password) {
  const text = String(password);
  if (text.length < 8) {
    throw new UpdateValidationError('Password must be at least 8 characters', 400);
  }
  return hashPassword(text);
}

function normalizeSettings(req, rawSettings) {
  let settings;
  try {
    settings = requirePlainObject(rawSettings, 'Settings must be an object');
  } catch (err) {
    if (err instanceof ValidationError) {
      throw new UpdateValidationError(err.message, 400);
    }
    throw err;
  }
  return JSON.stringify(settings);
}

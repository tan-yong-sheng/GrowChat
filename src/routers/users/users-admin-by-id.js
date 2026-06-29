/**
 * Users Admin By Id Handler
 */
import { createDB } from '../../db.js';
import { ValidationError } from '../../errors/http-errors.js';
import { hashPassword } from '../../shared/auth.js';
import { authorize, isLastOwnerOfRole, logAuditEvent } from '../../utils/authorize.js';
import { error, json } from '../../utils/response.js';
import { escapeHtml, stripHtml } from '../../utils/sanitize.js';
import { loadPrimaryRole } from '../../utils/user-role.js';
import { requirePlainObject, validateEmail } from '../../validation/request.js';
import {
  normalizeAccountStatus,
  resolveRequestedRole,
  syncGlobalRoleBinding,
  parseSettings,
} from './users-helpers.js';

/**
 * Handle users/admin/by/id routes.
 * Returns Response if handled, null if path doesn't match.
 */
export async function handleUsersAdminById(
  req,
  env,
  ctx,
  user,
  path,
  { _db, logger, _requestContext }
) {
  if (req.method === 'GET' && path.match(/^\/api\/admin\/users\/[^/]+$/)) {
    // Check authorization
    const userId = path.split('/').pop();
    const authDecision = await authorize(env, user, {
      action: 'admin.user.read',
      resource: 'user',
      resourceId: userId,
    });

    if (!authDecision.allow) {
      const statusCodeMap = {
        server_error: 500,
        unauthorized: 401,
        not_found: 404,
      };
      const statusCode = statusCodeMap[authDecision.code] || 403;
      return error(req, authDecision.reason || 'Forbidden', statusCode);
    }

    const db = createDB(env.DB);

    try {
      const userData = await db.first(
        'SELECT id, email, name, account_status, settings, created_at, updated_at FROM users WHERE id = ?',
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
        resource_id: userId,
      });

      return json(req, {
        user: {
          id: userData.id,
          email: userData.email,
          name: userData.name,
          primary_role: (await loadPrimaryRole(db, userId)) || 'member',
          account_status: normalizeAccountStatus(userData.account_status),
          settings: parseSettings(userData.settings),
          created_at: userData.created_at,
          updated_at: userData.updated_at,
        },
      });
    } catch (err) {
      logger.error('Get user failed', { error: err?.message || err });
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
      resourceId: userId,
    });

    if (!authDecision.allow) {
      const statusCodeMap = {
        server_error: 500,
        unauthorized: 401,
        not_found: 404,
      };
      const statusCode = statusCodeMap[authDecision.code] || 403;
      return error(req, authDecision.reason || 'Forbidden', statusCode);
    }

    const db = createDB(env.DB);

    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    // Verify user exists
    const existing = await db.first(
      'SELECT id, account_status, email, name FROM users WHERE id = ?',
      [userId]
    );
    if (!existing) {
      return error(req, 'User not found', 404);
    }

    const updates = [];
    const values = [];
    const updatedFields = [];
    let oldRole = (await loadPrimaryRole(db, userId)) || 'member';
    let oldAccountStatus = normalizeAccountStatus(existing.account_status);
    let newRole = oldRole;
    let newAccountStatus = oldAccountStatus;
    let roleChanged = false;

    // Allow updating primary role (for admin promotion/demotion)
    if (body.primary_role !== undefined) {
      const requestedRole = String(body.primary_role || '').trim();
      const resolvedRole = await resolveRequestedRole(db, requestedRole);
      if (!resolvedRole) {
        return error(req, 'primary_role must match an existing role', 400);
      }
      newRole = resolvedRole;
      roleChanged = newRole !== oldRole;
      // Check last-owner protection for admin role or admin account disablement
      if (oldRole === 'admin' && (newRole !== 'admin' || newAccountStatus !== 'active')) {
        const isLastAdmin = await isLastOwnerOfRole(env, userId, 'admin');
        if (isLastAdmin) {
          return error(req, 'Cannot demote last admin', 409);
        }
      }
      updatedFields.push('primary_role');
    }

    if (body.account_status !== undefined) {
      newAccountStatus = normalizeAccountStatus(body.account_status, newAccountStatus);
      if (oldRole === 'admin' && (newRole !== 'admin' || newAccountStatus !== 'active')) {
        const isLastAdmin = await isLastOwnerOfRole(env, userId, 'admin');
        if (isLastAdmin) {
          return error(req, 'Cannot deactivate last admin', 409);
        }
      }
      updates.push('account_status = ?');
      values.push(newAccountStatus);
      updatedFields.push('account_status');
    }

    // Can update name
    if (body.name !== undefined) {
      const name = stripHtml(body.name);
      if (!name) {
        return error(req, 'Name cannot be empty after removing invalid characters', 400);
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

      const duplicate = await db.first('SELECT id FROM users WHERE email = ? AND id != ?', [
        email,
        userId,
      ]);
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

      // Log audit event for role change
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

      // Log generic user update
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'user_updated',
        resource_type: 'user',
        resource_id: userId,
        metadata: { fields_updated: updatedFields },
      });

      // Return updated user
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

  // DELETE /api/admin/users/:id - Delete user record (admin only)
  if (req.method === 'DELETE' && path.match(/^\/api\/admin\/users\/[^/]+$/)) {
    const userId = path.split('/').pop();

    // Check authorization
    const authDecision = await authorize(env, user, {
      action: 'admin.user.write',
      resource: 'user',
      resourceId: userId,
    });

    if (!authDecision.allow) {
      const statusCodeMap = {
        server_error: 500,
        unauthorized: 401,
        not_found: 404,
      };
      const statusCode = statusCodeMap[authDecision.code] || 403;
      return error(req, authDecision.reason || 'Forbidden', statusCode);
    }

    const db = createDB(env.DB);

    try {
      // Cannot delete yourself
      if (userId === user.sub) {
        return error(req, 'Cannot delete your own account', 400);
      }

      // Verify user exists
      const existing = await db.first('SELECT id, account_status FROM users WHERE id = ?', [
        userId,
      ]);
      if (!existing) {
        return error(req, 'User not found', 404);
      }

      // Cannot delete the only admin
      const isLastAdmin = await isLastOwnerOfRole(env, userId, 'admin');
      if ((await loadPrimaryRole(db, userId)) === 'admin' && isLastAdmin) {
        return error(req, 'Cannot delete the last admin', 400);
      }

      const oldRole = (await loadPrimaryRole(db, userId)) || 'member';
      const oldAccountStatus = normalizeAccountStatus(existing.account_status);
      await db.run('DELETE FROM users WHERE id = ?', [userId]);

      // Log audit event
      await logAuditEvent(env, {
        actor_id: user.sub,
        action: 'user_deleted',
        resource_type: 'user',
        resource_id: userId,
        metadata: {
          previous_primary_role: oldRole,
          previous_account_status: oldAccountStatus,
        },
      });

      return json(req, { success: true, message: 'User deleted successfully' });
    } catch (err) {
      logger.error('Delete user failed', { error: err?.message || err });
      return error(req, 'Failed to delete user', 500);
    }
  }

  return null;
}

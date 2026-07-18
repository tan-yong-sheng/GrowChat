import { HTTP_STATUS } from '../../shared/http-status.js';
import { createDB } from '../../db.js';
import { authorize, logAuditEvent } from '../../utils/authorize.js';
import { authError, error, json } from '../../utils/response.js';
import { loadPrimaryRole } from '../../utils/user-role.js';
import { normalizeAccountStatus, parseSettings } from './users-helpers.js';

export async function handleGetUserById(req, env, user, userId) {
  const authDecision = await authorize(env, user, {
    action: 'admin.user.read',
    resource: 'user',
    resourceId: userId,
  });

  if (!authDecision.allow) {
    return authError(req, authDecision);
  }

  const db = createDB(env.DB);

  try {
    const userData = await db.first(
      'SELECT id, email, name, account_status, settings, created_at, updated_at FROM users WHERE id = ?',
      [userId]
    );

    if (!userData) {
      return error(req, 'User not found', HTTP_STATUS.NOT_FOUND);
    }

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
  } catch (_err) {
    return error(req, 'Failed to fetch user', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

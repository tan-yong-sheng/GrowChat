import { HTTP_STATUS } from '../../shared/http-status.js';
import { createDB } from '../../db.js';
import { authorize, isLastOwnerOfRole, logAuditEvent } from '../../utils/authorize.js';
import { authError, error, json } from '../../utils/response.js';
import { loadPrimaryRole } from '../../utils/user-role.js';
import { normalizeAccountStatus } from './users-helpers.js';

// eslint-disable-next-line max-params -- admin dispatcher pattern (req, env, user, userId, logger)
export async function handleDeleteUserById(req, env, user, userId, logger) {
  const authDecision = await authorize(env, user, {
    action: 'admin.user.write',
    resource: 'user',
    resourceId: userId,
  });

  if (!authDecision.allow) {
    return authError(req, authDecision);
  }

  const db = createDB(env.DB);

  try {
    if (userId === user.sub) {
      return error(req, 'Cannot delete your own account', HTTP_STATUS.BAD_REQUEST);
    }

    const existing = await db.first('SELECT id, account_status FROM users WHERE id = ?', [userId]);
    if (!existing) {
      return error(req, 'User not found', HTTP_STATUS.NOT_FOUND);
    }

    const isLastAdmin = await isLastOwnerOfRole(env, userId, 'admin');
    if ((await loadPrimaryRole(db, userId)) === 'admin' && isLastAdmin) {
      return error(req, 'Cannot delete the last admin', HTTP_STATUS.BAD_REQUEST);
    }

    const oldRole = (await loadPrimaryRole(db, userId)) || 'member';
    const oldAccountStatus = normalizeAccountStatus(existing.account_status);
    await db.run('DELETE FROM users WHERE id = ?', [userId]);

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
    return error(req, 'Failed to delete user', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

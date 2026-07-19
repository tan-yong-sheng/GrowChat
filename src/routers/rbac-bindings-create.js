/**
 * RBAC - POST /api/admin/rbac/bindings
 * Creates a role-permission binding
 */
import { error, json } from '../utils/response.js';
import { HTTP_STATUS } from '../shared/http-status.js';
import {
  buildBindingResponse,
  insertRolePermissionBinding,
  logBindingAuditEvent,
  parseBindingBody,
  resolvePermissionForBinding,
  resolveRoleForBinding,
} from './rbac-helpers.js';
export async function handleRbacBindingsCreate({
  req,
  env,
  ctx: _ctx,
  user,
  path: _path,
  db,
  logger,
} = {}) {
  const parsed = await parseBindingBody(req);
  if (parsed.error) {
    return error(req, parsed.error, HTTP_STATUS.BAD_REQUEST);
  }

  const { roleId, permissionId } = parsed;

  try {
    const roleResult = await resolveRoleForBinding(db, roleId);
    if (roleResult.error) {
      const status =
        roleResult.error === 'Cannot modify system role permissions'
          ? HTTP_STATUS.FORBIDDEN
          : HTTP_STATUS.NOT_FOUND;
      return error(req, roleResult.error, status);
    }

    const permissionResult = await resolvePermissionForBinding(db, permissionId);
    if (permissionResult.error) {
      return error(req, permissionResult.error, HTTP_STATUS.NOT_FOUND);
    }

    const { role } = roleResult;
    const { permission } = permissionResult;

    await insertRolePermissionBinding(db, roleId, permissionId);
    await logBindingAuditEvent(env, user, roleId, permission);

    return json(
      req,
      buildBindingResponse(roleId, permissionId, role, permission),
      HTTP_STATUS.CREATED
    );
  } catch (err) {
    logger.error('Create binding failed', { error: err?.message || err });
    return error(
      req,
      'Failed to create role-permission binding',
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}

/**
 * Admin Config - PUT /api/admin/model-attachment-caps
 * Updates per-model attachment capability types (replace, update, remove)
 */
import { HTTP_STATUS } from '../../shared/http-status.js';
import { error, json } from '../../utils/response.js';
import { logAuditEvent } from '../../utils/authorize.js';
import { ensureAdminAclAccess } from './admin-helpers.js';
import {
  applyAttachmentCapsPatch,
  buildReplaceCaps,
  classifyAttachmentCapsBody,
  mapAuthCodeToStatus,
  parseJsonBody,
  saveAttachmentCaps,
} from './admin-config-helpers.js';

/**
 * Handle PUT /api/admin/model-attachment-caps - Update attachment capabilities
 */
export async function handleAdminAttachmentCapsSet({
  req,
  env,
  ctx: _ctx,
  user,
  path: _path,
  db,
  logger,
} = {}) {
  const body = await parseJsonBody(req);
  if (body === null) return error(req, 'Invalid JSON body', HTTP_STATUS.BAD_REQUEST);

  const aclDecision = await ensureAdminAclAccess({ env, user, resource: 'model' });
  if (!aclDecision.allow) {
    return error(req, aclDecision.reason || 'Forbidden', mapAuthCodeToStatus(aclDecision.code));
  }

  const bodyPlan = classifyAttachmentCapsBody(body);
  if (bodyPlan.error) return error(req, bodyPlan.error, HTTP_STATUS.BAD_REQUEST);

  try {
    let caps;
    let action;

    if (bodyPlan.replaceCaps) {
      caps = buildReplaceCaps(body.caps);
      action = 'attachment_caps_replaced';
    } else {
      caps = await applyAttachmentCapsPatch(db, bodyPlan.updates, bodyPlan.remove);
      action = 'attachment_caps_updated';
    }

    await saveAttachmentCaps(db, caps);
    await logAuditEvent(
      env,
      {
        actor_id: user.sub,
        action,
        resource_type: 'admin',
        resource_id: 'model-attachment-caps',
      },
      logger
    );

    return json(req, { caps });
  } catch (err) {
    return error(req, err?.message || 'Invalid attachment cap data', HTTP_STATUS.BAD_REQUEST);
  }
}

/**
 * Admin Config Handlers - audit-logs, config, model-attachment-caps
 */
import { error, json } from '../../utils/response.js';
import { logAuditEvent, getAuditLog } from '../../utils/authorize.js';
import { getConfigBool, getConfigValue, setConfigValue } from '../../utils/app-config.js';
import { ATTACHMENT_CAP_TYPES, MODEL_ATTACHMENT_CAPS_KEY } from '../../chat/attachments.js';
import { loadAttachmentCapsFromRaw } from '../../utils/attachment-caps.js';
import { normalizeAttachmentCaps, normalizeModelId } from '../../admin/tool-servers.js';
import { ensureAdminAclAccess, ensureAdminMutationAccess } from './admin-helpers.js';

/**
 * Handle handleAdminConfig routes.
 * Returns Response if handled, null if path doesn't match.
 */
export async function handleAdminConfig(
  req,
  env,
  ctx,
  user,
  path,
  { db, logger, _requestContext }
) {
  if (req.method === 'GET' && path === '/api/admin/audit-logs') {
    try {
      const url = new URL(req.url);
      const actor_id = url.searchParams.get('userId') || undefined;
      const action = url.searchParams.get('action') || undefined;
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);

      const result = await getAuditLog(env, {
        actor_id,
        action,
        limit,
        offset,
      });
      // Map column names for frontend compatibility
      const mappedLogs = (result.entries || []).map((entry) => ({
        ...entry,
        user_id: entry.actor_id,
        user_email: null, // Not stored in audit_log
        details: entry.metadata,
      }));
      return json(req, {
        logs: mappedLogs,
        total: result.total || mappedLogs.length,
      });
    } catch (err) {
      logger.error('Audit logs fetch failed', { error: err?.message || err });
      return error(req, 'Failed to fetch audit logs', 500);
    }
  }

  // GET /api/admin/config - Fetch admin configuration
  if (req.method === 'GET' && path === '/api/admin/config') {
    try {
      const publicRegistration = await getConfigBool(db, 'public_registration', true);
      const registrationStatusRaw = await getConfigValue(
        db,
        'public_registration_status',
        'pending'
      );
      const defaultModelIdRaw = await getConfigValue(db, 'default_model_id', null);
      const registrationStatus =
        String(registrationStatusRaw || 'pending')
          .trim()
          .toLowerCase() === 'active'
          ? 'active'
          : 'pending';
      const defaultModelId = defaultModelIdRaw ? String(defaultModelIdRaw).trim() : null;
      return json(req, {
        public_registration: publicRegistration,
        public_registration_status: registrationStatus,
        default_model_id: defaultModelId || null,
      });
    } catch (err) {
      logger.error('Admin config fetch failed', { error: err?.message || err });
      return error(req, 'Failed to fetch admin config', 500);
    }
  }

  // PUT /api/admin/config - Update admin configuration
  if (req.method === 'PUT' && path === '/api/admin/config') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const writeDecision = await ensureAdminMutationAccess(env, user, 'admin.user.write', 'admin');
    if (!writeDecision.allow) {
      const statusCodeMap = {
        server_error: 500,
        unauthorized: 401,
        not_found: 404,
      };
      const statusCode = statusCodeMap[writeDecision.code] || 403;
      return error(req, writeDecision.reason || 'Forbidden', statusCode);
    }

    const hasPublicRegistration = body.public_registration !== undefined;
    const hasRegistrationStatus = body.public_registration_status !== undefined;
    const hasDefaultModel = body.default_model_id !== undefined;

    if (!hasPublicRegistration && !hasRegistrationStatus && !hasDefaultModel) {
      return error(req, 'No config changes provided', 400);
    }

    if (hasPublicRegistration && typeof body.public_registration !== 'boolean') {
      return error(req, 'public_registration must be a boolean', 400);
    }

    let normalizedRegistrationStatus = null;
    if (hasRegistrationStatus) {
      if (typeof body.public_registration_status !== 'string') {
        return error(req, 'public_registration_status must be a string', 400);
      }
      normalizedRegistrationStatus = String(body.public_registration_status).trim().toLowerCase();
      if (!['active', 'pending'].includes(normalizedRegistrationStatus)) {
        return error(req, 'public_registration_status must be "active" or "pending"', 400);
      }
    }

    let normalizedDefaultModel = null;
    if (hasDefaultModel) {
      if (body.default_model_id === null || body.default_model_id === '') {
        normalizedDefaultModel = '';
      } else if (typeof body.default_model_id !== 'string') {
        return error(req, 'default_model_id must be a string or null', 400);
      } else {
        normalizedDefaultModel = String(body.default_model_id).trim();
        if (!normalizedDefaultModel) normalizedDefaultModel = '';
        if (normalizedDefaultModel.length > 200 || /\s/.test(normalizedDefaultModel)) {
          return error(req, 'default_model_id is invalid', 400);
        }
      }
    }

    try {
      if (hasPublicRegistration) {
        await setConfigValue(
          db,
          'public_registration',
          body.public_registration ? 'true' : 'false'
        );
      }
      if (hasRegistrationStatus) {
        await setConfigValue(db, 'public_registration_status', normalizedRegistrationStatus);
      }
      if (hasDefaultModel) {
        await setConfigValue(db, 'default_model_id', normalizedDefaultModel);
      }
      await logAuditEvent(
        env,
        {
          actor_id: user.sub,
          action: 'admin_config_updated',
          resource_type: 'admin',
          resource_id: 'config',
        },
        logger
      );
      return json(req, {
        public_registration: hasPublicRegistration ? body.public_registration : undefined,
        public_registration_status: hasRegistrationStatus
          ? normalizedRegistrationStatus
          : undefined,
        default_model_id: hasDefaultModel ? normalizedDefaultModel || null : undefined,
      });
    } catch (err) {
      logger.error('Admin config update failed', { error: err?.message || err });
      return error(req, 'Failed to update admin config', 500);
    }
  }

  // GET /api/admin/model-attachment-caps - Fetch per-model attachment capabilities
  if (req.method === 'GET' && path === '/api/admin/model-attachment-caps') {
    try {
      const raw = await getConfigValue(db, MODEL_ATTACHMENT_CAPS_KEY, '{}');
      const caps = loadAttachmentCapsFromRaw(raw);
      return json(req, {
        caps,
        supported_types: ATTACHMENT_CAP_TYPES,
      });
    } catch (err) {
      logger.error('Attachment caps fetch failed', { error: err?.message || err });
      return error(req, 'Failed to fetch attachment caps', 500);
    }
  }

  // PUT /api/admin/model-attachment-caps - Update per-model attachment capabilities
  if (req.method === 'PUT' && path === '/api/admin/model-attachment-caps') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const aclDecision = await ensureAdminAclAccess(env, user, 'model');
    if (!aclDecision.allow) {
      const statusCodeMap = {
        server_error: 500,
        unauthorized: 401,
        not_found: 404,
      };
      const statusCode = statusCodeMap[aclDecision.code] || 403;
      return error(req, aclDecision.reason || 'Forbidden', statusCode);
    }

    const replaceCaps = body.caps && typeof body.caps === 'object' && !Array.isArray(body.caps);
    const updates = Array.isArray(body.updates) ? body.updates : [];
    const remove = Array.isArray(body.remove) ? body.remove : [];

    if (!replaceCaps && !updates.length && !remove.length) {
      return error(req, 'No attachment cap changes provided', 400);
    }

    try {
      if (replaceCaps) {
        const nextCaps = {};
        for (const [modelId, entry] of Object.entries(body.caps)) {
          const normalizedId = normalizeModelId(modelId);
          if (!normalizedId) continue;
          const attachmentsInput = entry?.attachments ?? entry;
          const attachments = normalizeAttachmentCaps(attachmentsInput);
          nextCaps[normalizedId] = {
            ...(entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {}),
            attachments,
            updated_at: Math.floor(Date.now() / 1000),
          };
        }
        await setConfigValue(db, MODEL_ATTACHMENT_CAPS_KEY, JSON.stringify(nextCaps));
        await logAuditEvent(
          env,
          {
            actor_id: user.sub,
            action: 'attachment_caps_replaced',
            resource_type: 'admin',
            resource_id: 'model-attachment-caps',
          },
          logger
        );
        return json(req, { caps: nextCaps });
      }

      const raw = await getConfigValue(db, MODEL_ATTACHMENT_CAPS_KEY, '{}');
      const caps = loadAttachmentCapsFromRaw(raw);

      for (const update of updates) {
        const modelId = normalizeModelId(update?.model_id);
        if (!modelId) {
          throw new Error('model_id is required');
        }
        const patch = normalizeAttachmentCaps(update?.attachments, {
          allowNull: true,
        });
        const current = caps[modelId] && typeof caps[modelId] === 'object' ? caps[modelId] : {};
        const nextAttachments = { ...(current.attachments || {}) };
        for (const [key, value] of Object.entries(patch)) {
          if (value === null) {
            delete nextAttachments[key];
          } else {
            nextAttachments[key] = value;
          }
        }
        caps[modelId] = {
          ...current,
          attachments: nextAttachments,
          updated_at: Math.floor(Date.now() / 1000),
        };
      }

      for (const id of remove) {
        const normalizedId = normalizeModelId(id);
        if (!normalizedId) continue;
        delete caps[normalizedId];
      }

      await setConfigValue(db, MODEL_ATTACHMENT_CAPS_KEY, JSON.stringify(caps));
      await logAuditEvent(
        env,
        {
          actor_id: user.sub,
          action: 'attachment_caps_updated',
          resource_type: 'admin',
          resource_id: 'model-attachment-caps',
        },
        logger
      );

      return json(req, { caps });
    } catch (err) {
      return error(req, err?.message || 'Invalid attachment cap data', 400);
    }
  }

  return null;
}

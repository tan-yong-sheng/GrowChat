/**
 * Admin Config - GET /api/admin/config
 * Fetches admin configuration (public_registration, registration_status, default_model_id)
 */
import { error, json } from '../../utils/response.js';
import { getConfigBool, getConfigValue } from '../../utils/app-config.js';
import { HTTP_STATUS } from '../../shared/http-status.js';

/**
 * Handle GET /api/admin/config - Fetch admin configuration
 */
// dispatcher pattern: (req, env, ctx, user, path, deps)
export async function handleAdminConfigGet({
  req,
  env: _env,
  ctx: _ctx,
  user: _user,
  path: _path,
  db,
  logger,
} = {}) {
  try {
    const publicRegistration = await getConfigBool(db, 'public_registration', true);
    const registrationStatusRaw = await getConfigValue(db, 'public_registration_status', 'pending');
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
    return error(req, 'Failed to fetch admin config', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

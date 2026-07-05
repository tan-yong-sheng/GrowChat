/**
 * Admin Config - PUT /api/admin/config
 * Updates admin configuration (public_registration, registration_status, default_model_id)
 */
import { error, json } from '../../utils/response.js';
import { setConfigValue } from '../../utils/app-config.js';
import { logAuditEvent } from '../../utils/authorize.js';
import { ensureAdminMutationAccess } from './admin-helpers.js';

async function parseBody(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function mapAuthCodeToStatus(code) {
  const map = { server_error: 500, unauthorized: 401, not_found: 404 };
  return map[code] || 403;
}

function validatePublicRegistration(value) {
  if (typeof value !== 'boolean') return { error: 'public_registration must be a boolean' };
  return { value: value ? 'true' : 'false' };
}

function validateRegistrationStatus(value) {
  if (typeof value !== 'string') return { error: 'public_registration_status must be a string' };
  const normalized = String(value).trim().toLowerCase();
  if (!['active', 'pending'].includes(normalized)) {
    return { error: 'public_registration_status must be "active" or "pending"' };
  }
  return { value: normalized };
}

function validateDefaultModelId(value) {
  if (value === null || value === '') return { value: '' };
  if (typeof value !== 'string') return { error: 'default_model_id must be a string or null' };
  const normalized = String(value).trim();
  if (normalized.length > 200 || /\s/.test(normalized)) {
    return { error: 'default_model_id is invalid' };
  }
  return { value: normalized || '' };
}

function validateConfigUpdate(body) {
  const updates = {};

  if (body.public_registration !== undefined) {
    const result = validatePublicRegistration(body.public_registration);
    if (result.error) return { error: result.error };
    updates.public_registration = { has: true, value: result.value, raw: body.public_registration };
  }

  if (body.public_registration_status !== undefined) {
    const result = validateRegistrationStatus(body.public_registration_status);
    if (result.error) return { error: result.error };
    updates.public_registration_status = { has: true, value: result.value };
  }

  if (body.default_model_id !== undefined) {
    const result = validateDefaultModelId(body.default_model_id);
    if (result.error) return { error: result.error };
    updates.default_model_id = { has: true, value: result.value };
  }

  if (!Object.keys(updates).length) {
    return { error: 'No config changes provided' };
  }

  return { updates };
}

async function applyConfigUpdates(db, updates) {
  if (updates.public_registration) {
    await setConfigValue(db, 'public_registration', updates.public_registration.value);
  }
  if (updates.public_registration_status) {
    await setConfigValue(
      db,
      'public_registration_status',
      updates.public_registration_status.value
    );
  }
  if (updates.default_model_id) {
    await setConfigValue(db, 'default_model_id', updates.default_model_id.value);
  }
}

function buildConfigResponse(updates) {
  return {
    public_registration: updates.public_registration ? updates.public_registration.raw : undefined,
    public_registration_status: updates.public_registration_status
      ? updates.public_registration_status.value
      : undefined,
    default_model_id: updates.default_model_id ? updates.default_model_id.value || null : undefined,
  };
}

/**
 * Handle PUT /api/admin/config - Update admin configuration
 */
export async function handleAdminConfigSet(req, env, ctx, user, path, { db, logger } = {}) {
  const body = await parseBody(req);
  if (body === null) return error(req, 'Invalid JSON body', 400);

  const writeDecision = await ensureAdminMutationAccess({
    env,
    user,
    permission: 'admin.user.write',
    resource: 'admin',
  });
  if (!writeDecision.allow) {
    return error(req, writeDecision.reason || 'Forbidden', mapAuthCodeToStatus(writeDecision.code));
  }

  const validation = validateConfigUpdate(body);
  if (validation.error) return error(req, validation.error, 400);

  try {
    await applyConfigUpdates(db, validation.updates);
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
    return json(req, buildConfigResponse(validation.updates));
  } catch (err) {
    logger.error('Admin config update failed', { error: err?.message || err });
    return error(req, 'Failed to update admin config', 500);
  }
}

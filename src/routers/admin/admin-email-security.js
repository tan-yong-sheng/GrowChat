/**
 * Admin Email & Security Config Handlers
 */
import { error, json } from '../../utils/response.js';
import { logAuditEvent } from '../../utils/authorize.js';
import { getConfigValue, setConfigValue } from '../../utils/app-config.js';
import { APP_LIMITS, APP_TTLS } from '../../config/app.js';
import { ensureAdminMutationAccess } from './admin-helpers.js';

const STATUS_CODE_MAP = {
  server_error: 500,
  unauthorized: 401,
  not_found: 404,
};

const HTTP_STATUS_FORBIDDEN = 403;
const HTTP_STATUS_BAD_REQUEST = 400;
const HTTP_STATUS_SERVER_ERROR = 500;
const SECONDS_PER_DAY = 86400;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_MINUTE = 60;

function resolveAccessStatusCode(code) {
  return STATUS_CODE_MAP[code] || HTTP_STATUS_FORBIDDEN;
}

async function handleGetEmailConfig({ req, db, logger }) {
  try {
    const resendApiKeyConfigured = await getConfigValue(db, 'resend_api_key', null);
    return json(req, {
      email_provider: 'resend',
      resend_api_key_configured: !!resendApiKeyConfigured,
    });
  } catch (err) {
    logger.error('Email config fetch failed', { error: err?.message || err });
    return error(req, 'Failed to fetch email config', HTTP_STATUS_SERVER_ERROR);
  }
}

async function parseJsonBody(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

async function checkWriteAccess(env, user, req) {
  const writeDecision = await ensureAdminMutationAccess({
    env,
    user,
    permission: 'admin.rbac.admin',
    resource: 'email-config',
  });
  if (!writeDecision.allow) {
    const statusCode = resolveAccessStatusCode(writeDecision.code);
    return error(req, writeDecision.reason || 'Forbidden', statusCode);
  }
  return null;
}

function validateApiKey(body, req) {
  if (!body.resend_api_key) {
    return error(req, 'resend_api_key is required', HTTP_STATUS_BAD_REQUEST);
  }
  const apiKey = String(body.resend_api_key).trim();
  if (!apiKey) {
    return error(req, 'resend_api_key cannot be empty', HTTP_STATUS_BAD_REQUEST);
  }
  return null;
}

async function saveApiKey({ db, apiKey, env, user, logger, req }) {
  try {
    await setConfigValue(db, 'resend_api_key', apiKey);
    await logAuditEvent(
      env,
      {
        actor_id: user.sub,
        action: 'email_config_updated',
        resource_type: 'admin',
        resource_id: 'email-config',
      },
      logger
    );
    return json(req, { message: 'Email configuration updated' });
  } catch (err) {
    logger.error('Email config update failed', { error: err?.message || err });
    return error(req, 'Failed to update email config', HTTP_STATUS_SERVER_ERROR);
  }
}

async function handlePutEmailConfig({ req, env, user, deps }) {
  const { db, logger } = deps;
  const body = await parseJsonBody(req);
  if (!body) return error(req, 'Invalid JSON body', HTTP_STATUS_BAD_REQUEST);

  const accessError = await checkWriteAccess(env, user, req);
  if (accessError) return accessError;

  const validationError = validateApiKey(body, req);
  if (validationError) return validationError;

  const apiKey = String(body.resend_api_key).trim();
  return saveApiKey({ db, apiKey, env, user, logger, req });
}

function isValidEmailShape(email) {
  return email.includes('@') && email.includes('.');
}

async function sendTestEmailViaResend(testEmail, resendApiKey, logger) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'noreply@growchat.app',
      to: testEmail,
      subject: 'GrowChat Email Configuration Test',
      html: '<p>This is a test email from GrowChat. Your email configuration is working correctly.</p>',
    }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    logger.error('Resend API error', {
      status: response.status,
      code: errorData.code || errorData.name,
      message: errorData.message,
    });
    return null;
  }
  return response;
}

async function handlePostEmailConfigTest({ req, env, user, deps }) {
  const { db, logger } = deps;
  const body = await parseJsonBody(req);
  if (!body) return error(req, 'Invalid JSON body', HTTP_STATUS_BAD_REQUEST);

  if (!body.email) {
    return error(req, 'email is required', HTTP_STATUS_BAD_REQUEST);
  }
  const testEmail = String(body.email).trim().toLowerCase();
  if (!isValidEmailShape(testEmail)) {
    return error(req, 'Invalid email address', HTTP_STATUS_BAD_REQUEST);
  }

  try {
    const resendApiKey = await getConfigValue(db, 'resend_api_key', null);
    if (!resendApiKey) {
      return error(req, 'Resend API key not configured', HTTP_STATUS_BAD_REQUEST);
    }

    const response = await sendTestEmailViaResend(testEmail, resendApiKey, logger);
    if (!response) {
      return error(req, 'Failed to send test email', HTTP_STATUS_BAD_REQUEST);
    }

    await logAuditEvent(
      env,
      {
        actor_id: user.sub,
        action: 'email_config_test_sent',
        resource_type: 'admin',
        resource_id: 'email-config',
        metadata: { email_tested: true },
      },
      logger
    );
    return json(req, { message: 'Test email sent' });
  } catch (err) {
    logger.error('Email test failed', { error: err?.message || err });
    return error(req, 'Failed to send test email', HTTP_STATUS_SERVER_ERROR);
  }
}

function formatTTL(seconds) {
  if (seconds >= SECONDS_PER_DAY) {
    const days = Math.round(seconds / SECONDS_PER_DAY);
    return `${days} day${days !== 1 ? 's' : ''}`;
  }
  if (seconds >= SECONDS_PER_HOUR) {
    const hours = Math.round(seconds / SECONDS_PER_HOUR);
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  }
  const minutes = Math.round(seconds / SECONDS_PER_MINUTE);
  return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
}

async function handleGetSecurityConfig({ req, logger }) {
  try {
    return json(req, {
      rate_limits: {
        chat_messages_per_minute: APP_LIMITS.maxChatSendPerMinute,
        login_attempts_per_10min: APP_LIMITS.maxLoginPerTenMinutes,
        registrations_per_10min: APP_LIMITS.maxRegisterPerTenMinutes,
        file_uploads_per_hour: APP_LIMITS.maxFileUploadPerHour,
      },
      token_ttls: {
        access_token_seconds: APP_TTLS.accessTokenSeconds,
        refresh_token_seconds: APP_TTLS.refreshTokenSeconds,
        access_token_display: formatTTL(APP_TTLS.accessTokenSeconds),
        refresh_token_display: formatTTL(APP_TTLS.refreshTokenSeconds),
      },
    });
  } catch (err) {
    logger.error('Security config fetch failed', { error: err?.message || err });
    return error(req, 'Failed to fetch security config', HTTP_STATUS_SERVER_ERROR);
  }
}

/**
 * Handle handleAdminEmailSecurity routes.
 * Returns Response if handled, null if path doesn't match.
 */
export async function handleAdminEmailSecurity({ req, env, user, path, deps }) {
  if (req.method === 'GET' && path === '/api/admin/email-config') {
    return handleGetEmailConfig({ req, db: deps.db, logger: deps.logger });
  }
  if (req.method === 'PUT' && path === '/api/admin/email-config') {
    return handlePutEmailConfig({ req, env, user, deps });
  }
  if (req.method === 'POST' && path === '/api/admin/email-config/test') {
    return handlePostEmailConfigTest({ req, env, user, deps });
  }
  if (req.method === 'GET' && path === '/api/admin/security-config') {
    return handleGetSecurityConfig({ req, logger: deps.logger });
  }
  return null;
}

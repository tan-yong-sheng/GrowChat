/**
 * Admin Email & Security Config Handlers
 */
import { error, json } from '../../utils/response.js';
import { logAuditEvent } from '../../utils/authorize.js';
import { getConfigValue, setConfigValue } from '../../utils/app-config.js';
import { APP_LIMITS, APP_TTLS } from '../../config/app.js';
import { ensureAdminMutationAccess } from './admin-helpers.js';

/**
 * Handle handleAdminEmailSecurity routes.
 * Returns Response if handled, null if path doesn't match.
 */
export async function handleAdminEmailSecurity(
  req,
  env,
  ctx,
  user,
  path,
  { db, logger, _requestContext }
) {
  if (req.method === 'GET' && path === '/api/admin/email-config') {
    try {
      const resendApiKeyConfigured = await getConfigValue(db, 'resend_api_key', null);
      return json(req, {
        email_provider: 'resend',
        resend_api_key_configured: !!resendApiKeyConfigured,
      });
    } catch (err) {
      logger.error('Email config fetch failed', { error: err?.message || err });
      return error(req, 'Failed to fetch email config', 500);
    }
  }

  // PUT /api/admin/email-config - Update email configuration
  if (req.method === 'PUT' && path === '/api/admin/email-config') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const writeDecision = await ensureAdminMutationAccess({
      env,
      user,
      permission: 'admin.rbac.admin',
      resource: 'email-config',
    });
    if (!writeDecision.allow) {
      const statusCodeMap = {
        server_error: 500,
        unauthorized: 401,
        not_found: 404,
      };
      const statusCode = statusCodeMap[writeDecision.code] || 403;
      return error(req, writeDecision.reason || 'Forbidden', statusCode);
    }

    if (!body.resend_api_key) {
      return error(req, 'resend_api_key is required', 400);
    }

    const apiKey = String(body.resend_api_key).trim();
    if (!apiKey) {
      return error(req, 'resend_api_key cannot be empty', 400);
    }

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
      return json(req, {
        message: 'Email configuration updated',
      });
    } catch (err) {
      logger.error('Email config update failed', { error: err?.message || err });
      return error(req, 'Failed to update email config', 500);
    }
  }

  // POST /api/admin/email-config/test - Send test email
  if (req.method === 'POST' && path === '/api/admin/email-config/test') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    if (!body.email) {
      return error(req, 'email is required', 400);
    }

    const testEmail = String(body.email).trim().toLowerCase();
    if (!testEmail.includes('@') || !testEmail.includes('.')) {
      return error(req, 'Invalid email address', 400);
    }

    try {
      const resendApiKey = await getConfigValue(db, 'resend_api_key', null);
      if (!resendApiKey) {
        return error(req, 'Resend API key not configured', 400);
      }

      // Send test email via Resend API
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
        return error(req, 'Failed to send test email', 400);
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

      return json(req, {
        message: 'Test email sent',
      });
    } catch (err) {
      logger.error('Email test failed', { error: err?.message || err });
      return error(req, 'Failed to send test email', 500);
    }
  }

  // GET /api/admin/security-config - Fetch operational security configuration (read-only)
  if (req.method === 'GET' && path === '/api/admin/security-config') {
    try {
      const formatTTL = (seconds) => {
        if (seconds >= 86400) {
          const days = Math.round(seconds / 86400);
          return `${days} day${days !== 1 ? 's' : ''}`;
        }
        if (seconds >= 3600) {
          const hours = Math.round(seconds / 3600);
          return `${hours} hour${hours !== 1 ? 's' : ''}`;
        }
        const minutes = Math.round(seconds / 60);
        return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
      };

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
      return error(req, 'Failed to fetch security config', 500);
    }
  }

  return null;
}

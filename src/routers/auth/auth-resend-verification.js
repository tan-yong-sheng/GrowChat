import { error } from '../../utils/response.js';
import { RATE_LIMITS, checkRateLimit, resolveRateLimitSubject } from '../../services/rate-limit.js';
import { HTTP_STATUS } from '../../shared/http-status.js';

async function parseResendBody(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export async function handleResendVerification(req, env) {
  const resendLimit = await checkRateLimit(env, {
    action: 'auth-resend-verification',
    subject: resolveRateLimitSubject(req),
    ...RATE_LIMITS.authResendVerification,
  });
  if (!resendLimit.allowed) {
    return error(req, 'Too many resend attempts', HTTP_STATUS.TOO_MANY_REQUESTS, {
      retry_after: Math.ceil((resendLimit.resetAt - Date.now()) / 1000),
    });
  }
  const body = await parseResendBody(req);
  if (!body) {
    return error(req, 'Invalid JSON body', HTTP_STATUS.BAD_REQUEST);
  }
  const email = body?.email;
  if (!email) {
    return error(req, 'Email is required', HTTP_STATUS.BAD_REQUEST);
  }
  const { resendVerification } = await import('../email-verification.js');
  return resendVerification({ email, env });
}

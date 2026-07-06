import { error } from '../../utils/response.js';
import { RATE_LIMITS, checkRateLimit, resolveRateLimitSubject } from '../../services/rate-limit.js';

export async function handleResendVerification(req, env) {
  const resendLimit = await checkRateLimit(env, {
    action: 'auth-resend-verification',
    subject: resolveRateLimitSubject(req),
    ...RATE_LIMITS.authResendVerification,
  });
  if (!resendLimit.allowed) {
    return error(req, 'Too many resend attempts', 429, {
      retry_after: Math.ceil((resendLimit.resetAt - Date.now()) / 1000),
    });
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return error(req, 'Invalid JSON body', 400);
  }
  const email = body?.email;
  if (!email) {
    return error(req, 'Email is required', 400);
  }
  const { resendVerification } = await import('../email-verification.js');
  return resendVerification({ email, env });
}

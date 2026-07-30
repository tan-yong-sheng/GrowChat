import { error } from '../../utils/response.js';
import { HTTP_STATUS } from '../../shared/http-status.js';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export async function handleVerifyEmail(req) {
  const url = new URL(req.url);
  const rawToken = url.searchParams.get('token');
  if (!rawToken) {
    return error(req, 'Token is required', HTTP_STATUS.BAD_REQUEST);
  }
  const token = String(rawToken);
  if (!TOKEN_PATTERN.test(token)) {
    return error(req, 'Invalid token format', HTTP_STATUS.BAD_REQUEST);
  }
  const { verifyEmail } = await import('../email-verification.js');
  return verifyEmail({ token });
}

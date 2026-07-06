import { error } from '../../utils/response.js';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export async function handleVerifyEmail(req) {
  const url = new URL(req.url);
  const rawToken = url.searchParams.get('token');
  if (!rawToken) {
    return error(req, 'Token is required', 400);
  }
  const token = String(rawToken);
  if (!TOKEN_PATTERN.test(token)) {
    return error(req, 'Invalid token format', 400);
  }
  const { verifyEmail } = await import('../email-verification.js');
  return verifyEmail({ token });
}
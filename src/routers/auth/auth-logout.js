import { json } from '../../utils/response.js';
import { revokeRefreshTokenForLogout } from '../../shared/session.js';
import { readBearerToken } from './auth-helpers.js';

export async function handleLogout(req, env) {
  let body = {};
  try {
    body = await req.json();
  } catch {
    // Allow empty body
  }
  const tokenFromBody = body.refresh_token ? String(body.refresh_token) : null;
  const bearer = readBearerToken(req);
  if (tokenFromBody) {
    await revokeRefreshTokenForLogout(env, tokenFromBody);
  }
  if (bearer && !tokenFromBody) {
    // Optional compatibility path: bearer-only logout cannot fan out to
    // session-version because we have no userId. The access token
    // expires in 15 minutes regardless.
  }
  return json(req, { ok: true });
}

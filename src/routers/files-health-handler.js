/**
 * Files health check handler (GET /api/files/health)
 */
import { HTTP_STATUS } from '../shared/http-status.js';
import { json, error } from '../utils/response.js';
import { withTimeout } from '../utils/promise.js';

export async function handleFilesHealth(req, env, _ctx, _user) {
  if (!env.FILES) {
    return error(req, 'FILES binding missing', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }

  try {
    const R2_CHECK_TIMEOUT = 3000;
    await withTimeout(env.FILES.list({ limit: 1 }), R2_CHECK_TIMEOUT, 'R2 health check timed out');
    return json(req, { ok: true, message: 'R2 reachable' });
  } catch (err) {
    const message = err?.message || 'R2 health check failed';
    return error(req, `R2 unreachable: ${message}`, HTTP_STATUS.SERVICE_UNAVAILABLE);
  }
}

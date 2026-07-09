/**
 * Files health check handler (GET /api/files/health)
 */
import { HTTP_STATUS } from '../shared/http-status.js';
import { json, error } from '../utils/response.js';

export async function handleFilesHealth(req, env, _ctx, _user) {
  if (!env.FILES) {
    return error(req, 'FILES binding missing', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }

  const withTimeout = (promise, ms) => {
    if (!ms || ms <= 0) return promise;
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('R2 health check timed out')), ms);
    });
    return Promise.race([promise.finally(() => clearTimeout(timer)), timeout]);
  };

  try {
    const R2_CHECK_TIMEOUT = 3000;
    await withTimeout(env.FILES.list({ limit: 1 }), R2_CHECK_TIMEOUT);
    return json(req, { ok: true, message: 'R2 reachable' });
  } catch (err) {
    const message = err?.message || 'R2 health check failed';
    return error(req, `R2 unreachable: ${message}`, HTTP_STATUS.SERVICE_UNAVAILABLE);
  }
}

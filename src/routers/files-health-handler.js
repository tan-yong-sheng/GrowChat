/**
 * Files health check handler (GET /api/files/health)
 */
import { json, error } from '../utils/response.js';

export async function handleFilesHealth(req, env, ctx, user) {
  if (!env.FILES) {
    return error(req, 'FILES binding missing', 500);
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
    await withTimeout(env.FILES.list({ limit: 1 }), 3000);
    return json(req, { ok: true, message: 'R2 reachable' });
  } catch (err) {
    const message = err?.message || 'R2 health check failed';
    return error(req, `R2 unreachable: ${message}`, 503);
  }
}

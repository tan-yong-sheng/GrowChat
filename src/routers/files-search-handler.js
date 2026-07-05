/**
 * File search handler (GET /api/files/search)
 *
 * Searches user's documents by filename.
 */
import { createDB } from '../db.js';
import { json, error } from '../utils/response.js';
import { RATE_LIMITS, checkRateLimit } from '../services/rate-limit.js';
import { createLogger } from '../utils/logger.js';

export async function handleFileSearch(req, env, ctx, user, requestContext = {}) {
  const logger =
    requestContext.logger || createLogger(env, { requestId: requestContext.requestId });

  const searchLimit = await checkRateLimit(env, {
    action: 'file-search',
    subject: user.sub,
    ...RATE_LIMITS.fileSearch,
  });
  if (!searchLimit.allowed) {
    return error(req, 'Too many file searches', 429, {
      retry_after: Math.ceil((searchLimit.resetAt - Date.now()) / 1000),
    });
  }

  const db = createDB(env.DB);
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim();
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20'), 1), 100);
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0'), 0);

  if (q.length > 200) {
    return error(req, 'Search query exceeds 200 characters', 400);
  }

  try {
    const documents = await db.all(
      `SELECT id, filename, content_type, file_size, text_excerpt,
        extraction_status, created_at, updated_at
      FROM documents
      WHERE user_id = ? AND filename LIKE ?
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?`,
      [user.sub, `%${q}%`, limit, offset]
    );
    return json(req, { documents, query: q, limit, offset });
  } catch (err) {
    if (/no such table:\s*documents/i.test(String(err?.message || ''))) {
      return json(req, { documents: [], query: q, limit, offset });
    }
    logger.error('Document search failed', { error: err?.message || err });
    return error(req, 'Search failed', 500);
  }
}

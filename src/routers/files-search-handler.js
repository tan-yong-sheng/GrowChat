/**
 * File search handler (GET /api/files/search)
 *
 * Searches user's documents by filename.
 */
import { createDB } from '../db.js';
import { json, error } from '../utils/response.js';
import { HTTP_STATUS } from '../shared/http-status.js';
import { RATE_LIMITS, checkRateLimit } from '../services/rate-limit.js';

const MAX_SEARCH_QUERY_LENGTH = 200;

function parseSearchParams(url) {
  const q = (url.searchParams.get('q') || '').trim();
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20'), 1), 100);
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0'), 0);
  return { q, limit, offset };
}

async function runSearchQuery(db, opts) {
  return db.all(
    `SELECT id, filename, content_type, file_size, text_excerpt,
      extraction_status, created_at, updated_at
    FROM documents
    WHERE user_id = ? AND filename LIKE ?
    ORDER BY updated_at DESC
    LIMIT ? OFFSET ?`,
    [opts.userId, `%${opts.q}%`, opts.limit, opts.offset]
  );
}
async function searchDocuments(req, env, ctx, user, _requestContext) {
  const db = createDB(env.DB);
  const url = new URL(req.url);
  const { q, limit, offset } = parseSearchParams(url);

  if (q.length > MAX_SEARCH_QUERY_LENGTH) {
    return error(req, 'Search query exceeds 200 characters', HTTP_STATUS.BAD_REQUEST);
  }

  let documents;
  try {
    documents = await runSearchQuery(db, { userId: user.sub, q, limit, offset });
  } catch (err) {
    const errMsg = String(err?.message || '');
    if (/no such table:\s*documents/i.test(errMsg)) {
      return json(req, { documents: [], query: q, limit, offset });
    }
    _requestContext.logger?.error?.('Document search failed', {
      error: err?.message || err,
    });
    return error(req, 'Search failed', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
  return json(req, { documents, query: q, limit, offset });
}
export async function handleFileSearch(req, env, ctx, user, _requestContext = {}) {
  const searchLimit = await checkRateLimit(env, {
    action: 'file-search',
    subject: user.sub,
    ...RATE_LIMITS.fileSearch,
  });
  if (!searchLimit.allowed) {
    return error(req, 'Too many file searches', HTTP_STATUS.TOO_MANY_REQUESTS, {
      retry_after: Math.ceil((searchLimit.resetAt - Date.now()) / 1000),
    });
  }

  return searchDocuments(req, env, ctx, user, _requestContext);
}

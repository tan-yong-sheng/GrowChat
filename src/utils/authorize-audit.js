/**
 * Audit log query helper extracted from authorize.js.
 */
import { createRootLogger } from './logger.js';

const rootLogger = createRootLogger({});

const AUDIT_LIMIT_MIN = 1;
const AUDIT_LIMIT_MAX = 500;
const AUDIT_LIMIT_DEFAULT = 100;
const AUDIT_OFFSET_MIN = 0;
const AUDIT_OFFSET_DEFAULT = 0;

/**
 * Get audit log entries
 *
 * @param {Object} env - Cloudflare environment with DB binding
 * @param {Object} options - Query options
 * @param {string} options.actor_id - Filter by actor ID (optional)
 * @param {string} options.action - Filter by action (optional)
 * @param {string} options.resource_type - Filter by resource type (optional)
 * @param {string} options.resource_id - Filter by resource ID (optional)
 * @param {number} options.limit - Limit results (default 100, max 500)
 * @param {number} options.offset - Offset for pagination (default 0)
 * @returns {Promise<Object>} { entries, total, limit, offset }
 */
export async function getAuditLog(env, options = {}, logger = rootLogger) {
  const {
    actor_id,
    action,
    resource_type,
    resource_id,
    limit = AUDIT_LIMIT_DEFAULT,
    offset = AUDIT_OFFSET_DEFAULT,
  } = options;

  const safeLimit = Math.min(
    Math.max(parseInt(limit) || AUDIT_LIMIT_DEFAULT, AUDIT_LIMIT_MIN),
    AUDIT_LIMIT_MAX
  );
  const safeOffset = Math.max(parseInt(offset) || AUDIT_OFFSET_DEFAULT, AUDIT_OFFSET_MIN);

  try {
    const { whereClause, bindings } = buildAuditLogWhereClause({
      actor_id,
      action,
      resource_type,
      resource_id,
    });

    const total = await fetchAuditLogCount(env, whereClause, bindings);
    const entries = await fetchAuditLogEntries(env, {
      whereClause,
      bindings,
      safeLimit,
      safeOffset,
    });

    return {
      entries,
      total,
      limit: safeLimit,
      offset: safeOffset,
    };
  } catch (err) {
    logger.error('Failed to get audit log', { error: err?.message || err });
    return {
      entries: [],
      total: 0,
      limit: safeLimit,
      offset: safeOffset,
    };
  }
}

function buildAuditLogWhereClause({ actor_id, action, resource_type, resource_id }) {
  const conditions = [];
  const bindings = [];
  if (actor_id) {
    conditions.push('actor_id = ?');
    bindings.push(actor_id);
  }
  if (action) {
    conditions.push('action = ?');
    bindings.push(action);
  }
  if (resource_type) {
    conditions.push('resource_type = ?');
    bindings.push(resource_type);
  }
  if (resource_id) {
    conditions.push('resource_id = ?');
    bindings.push(resource_id);
  }
  const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, bindings };
}

async function fetchAuditLogCount(env, whereClause, bindings) {
  const countQuery = `SELECT COUNT(*) as count FROM audit_log${whereClause}`;
  const countResult = await env.DB.prepare(countQuery)
    .bind(...bindings)
    .first();
  return countResult?.count || 0;
}

async function fetchAuditLogEntries(env, { whereClause, bindings, safeLimit, safeOffset }) {
  const entriesQuery = `
      SELECT id, actor_id, action, resource_type, resource_id, metadata, created_at
      FROM audit_log
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;
  const allBindings = [...bindings, safeLimit, safeOffset];
  const entriesResult = await env.DB.prepare(entriesQuery)
    .bind(...allBindings)
    .all();
  return (entriesResult.results || []).map(parseAuditLogEntry);
}

function parseAuditLogEntry(entry) {
  return {
    ...entry,
    metadata: parseAuditLogMetadata(entry.metadata),
  };
}

function parseAuditLogMetadata(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

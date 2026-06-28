/**
 * Admin Connections Save Handler - PUT /api/admin/openai/connections
 */
import { error, json } from '../../utils/response.js';
import { isSafeOutboundUrl } from '../../utils/validation.js';
import {
  getAllOpenAIConnectionConfigs,
  getConnectionApiType,
  getConnectionDefaultBaseUrl,
  isConnectionUrlRequired,
  normalizeConnectionManualModels,
} from '../../llm/connections.js';
import { normalizeProviderFamily } from '../../llm/provider-registry.js';
import { normalizeConnectionModelSelectionMode } from '../../../public/js/shared/utils/connection-model-selection.js';
import { ensureAdminAclAccess, isValidModelAccessId } from './admin-helpers.js';
import { logAuditEvent } from '../../utils/authorize.js';
import { normalizeConnectionAclRule } from '../../utils/connection-acl.js';
import { isValidHttpUrl, normalizeHeaders } from '../../admin/tool-servers.js';

/**
 * Handle handleAdminConnectionsSave routes.
 * Returns Response if handled, null if path doesn't match.
 */
export async function handleAdminConnectionsSave(
  req,
  env,
  ctx,
  user,
  path,
  { db, logger, _requestContext }
) {
  if (req.method === 'PUT' && path === '/api/admin/openai/connections') {
    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const aclDecision = await ensureAdminAclAccess(env, user, 'connection');
    if (!aclDecision.allow) {
      const statusCodeMap = {
        server_error: 500,
        unauthorized: 401,
        not_found: 404,
      };
      const statusCode = statusCodeMap[aclDecision.code] || 403;
      return error(req, aclDecision.reason || 'Forbidden', statusCode);
    }

    const enabled = typeof body.enabled === 'boolean' ? body.enabled : true;
    const connections = Array.isArray(body.connections) ? body.connections : [];
    const modelUpdatesInput = Array.isArray(body.model_updates) ? body.model_updates : [];
    const accessUpdatesInput = Array.isArray(body.access_updates) ? body.access_updates : [];

    if (connections.length > 100) {
      return error(req, 'Too many connections (max 100)', 400);
    }
    if (modelUpdatesInput.length > 500) {
      return error(req, 'Too many model updates (max 500)', 400);
    }

    let currentConnectionMap = new Map();
    let sanitized;
    try {
      const currentConnections = await getAllOpenAIConnectionConfigs(env, {
        includeDisabled: true,
      });
      currentConnectionMap = new Map(
        (Array.isArray(currentConnections) ? currentConnections : []).map((connection) => [
          String(connection.id || ''),
          connection,
        ])
      );

      sanitized = connections
        .filter((conn) => !conn?.readOnly)
        .map((conn) => {
          const existingConnection = currentConnectionMap.get(String(conn.id || ''));
          const providerType = String(conn.providerType || 'openai').toLowerCase();
          if (
            ![
              'openai',
              'openai-compatible',
              'google',
              'gemini-compatible',
              'anthropic',
              'claude-compatible',
            ].includes(providerType)
          ) {
            throw new Error(
              'Provider type must be one of: openai, openai-compatible, google, gemini-compatible, anthropic, claude-compatible'
            );
          }
          const providerFamily =
            normalizeProviderFamily(providerType || conn.providerFamily) || 'openai';
          const rawUrl = String(conn.url || '').trim();
          const requiresUrl = isConnectionUrlRequired(providerType);
          const url = rawUrl || getConnectionDefaultBaseUrl(providerType || providerFamily);
          if (requiresUrl && !rawUrl) {
            throw new Error('Connection URL is required for compatible providers');
          }
          if (!isValidHttpUrl(url)) {
            throw new Error('Connection URL must start with http:// or https://');
          }
          const bulkUrlSafety = isSafeOutboundUrl(url);
          if (!bulkUrlSafety.safe) {
            throw new Error(bulkUrlSafety.reason);
          }
          const keyRaw = conn.key !== undefined ? String(conn.key || '').trim() : '';
          const key =
            keyRaw ||
            (existingConnection?.key && String(existingConnection.key).trim()
              ? String(existingConnection.key).trim()
              : '');
          if (key.length > 4096) {
            throw new Error('API key is too long');
          }
          const headers = normalizeHeaders(conn.headers);
          if (headers.length > 4096) {
            throw new Error('Headers are too long');
          }
          const defaultName =
            providerFamily === 'google'
              ? 'Gemini Compatible'
              : providerFamily === 'anthropic'
                ? 'Claude Compatible'
                : 'OpenAI Compatible';
          return {
            id: conn.id || crypto.randomUUID(),
            name: String(conn.name || defaultName).slice(0, 120),
            url,
            key,
            headers,
            providerType,
            providerFamily,
            apiType: getConnectionApiType(providerType),
            enabled: conn.enabled !== false,
            manualModels: normalizeConnectionManualModels(conn.manualModels),
            manualModelsMode:
              normalizeConnectionModelSelectionMode(
                conn.manualModelsMode || conn.manual_models_mode
              ) || 'all',
          };
        })
        .filter(Boolean);
    } catch (err) {
      return error(req, err.message || 'Invalid connection data', 400);
    }

    const modelUpdates = modelUpdatesInput
      .map((item) => ({
        id: String(item?.id || '').trim(),
        enabled: item?.enabled !== false,
      }))
      .filter((item) => isValidModelAccessId(item.id));
    if (modelUpdates.length !== modelUpdatesInput.length) {
      return error(req, 'Invalid model id in updates', 400);
    }

    try {
      const groups = await db.all('SELECT id FROM groups');
      const validGroupIds = new Set(groups.map((group) => group.id));
      const normalizedAccessUpdates = [];
      for (const entry of accessUpdatesInput) {
        const connectionId = String(entry?.connection_id || entry?.connectionId || '').trim();
        const currentConnection = currentConnectionMap.get(connectionId);
        if (!connectionId || !currentConnection) {
          return error(req, 'Invalid connection_id in access_updates', 400);
        }
        if (currentConnection.enabled === false) {
          return error(req, 'Disabled connections cannot be edited', 409);
        }
        const incomingRules = Array.isArray(entry?.rules) ? entry.rules : [];
        const filteredRules = [];
        const invalidPrincipalTypes = [];
        for (const rule of incomingRules) {
          const normalized = normalizeConnectionAclRule({
            ...rule,
            connection_id: connectionId,
          });
          if (!normalized) continue;
          if (normalized.principal_type !== 'group') {
            invalidPrincipalTypes.push(normalized.principal_type);
            continue;
          }
          if (!validGroupIds.has(normalized.principal_id)) continue;
          filteredRules.push(normalized);
        }
        if (invalidPrincipalTypes.length) {
          return error(req, 'Invalid principal_type for connection access', 400, {
            invalid: Array.from(new Set(invalidPrincipalTypes)),
          });
        }
        normalizedAccessUpdates.push({
          connection_id: connectionId,
          rules: filteredRules,
        });
      }

      if (normalizedAccessUpdates.length > 0) {
        const aclDecision = await ensureAdminAclAccess(env, user, 'connection');
        if (!aclDecision.allow) {
          const statusCodeMap = {
            server_error: 500,
            unauthorized: 401,
            not_found: 404,
          };
          const statusCode = statusCodeMap[aclDecision.code] || 403;
          return error(req, aclDecision.reason || 'Forbidden', statusCode);
        }
      }

      const statements = [
        db.prepare(
          `CREATE TABLE IF NOT EXISTS model_access (
            model_id TEXT PRIMARY KEY,
            is_enabled INTEGER NOT NULL DEFAULT 1,
            updated_at INTEGER NOT NULL DEFAULT (unixepoch())
          )`
        ),
        db.prepare(
          'CREATE INDEX IF NOT EXISTS idx_model_access_enabled ON model_access (is_enabled)'
        ),
        db.prepare(
          `CREATE TABLE IF NOT EXISTS connection_acl_rules (
            id TEXT PRIMARY KEY,
            connection_id TEXT NOT NULL,
            principal_type TEXT NOT NULL CHECK (principal_type IN ('user', 'group')),
            principal_id TEXT NOT NULL,
            effect TEXT NOT NULL CHECK (effect IN ('allow', 'deny')),
            action TEXT NOT NULL DEFAULT 'use',
            created_at INTEGER NOT NULL DEFAULT (unixepoch()),
            updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
            UNIQUE(connection_id, principal_type, principal_id, effect, action)
          )`
        ),
        db.prepare(
          'CREATE INDEX IF NOT EXISTS idx_connection_acl_rules_connection_id ON connection_acl_rules(connection_id)'
        ),
        db.prepare(
          'CREATE INDEX IF NOT EXISTS idx_connection_acl_rules_principal ON connection_acl_rules(principal_type, principal_id)'
        ),
        db.prepare(
          'INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, unixepoch()) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()',
          ['openai_connections', JSON.stringify(sanitized)]
        ),
        db.prepare(
          'INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, unixepoch()) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()',
          ['openai_enabled', enabled ? 'true' : 'false']
        ),
      ];

      for (const update of modelUpdates) {
        statements.push(
          db.prepare(
            `INSERT INTO model_access (model_id, is_enabled, updated_at)
             VALUES (?, ?, unixepoch())
             ON CONFLICT(model_id) DO UPDATE SET is_enabled = excluded.is_enabled, updated_at = unixepoch()`,
            [update.id, update.enabled ? 1 : 0]
          )
        );
      }

      for (const entry of normalizedAccessUpdates) {
        statements.push(
          db.prepare('DELETE FROM connection_acl_rules WHERE connection_id = ?', [
            entry.connection_id,
          ])
        );
        for (const rule of entry.rules) {
          statements.push(
            db.prepare(
              `INSERT INTO connection_acl_rules (id, connection_id, principal_type, principal_id, effect, action, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())`,
              [
                crypto.randomUUID(),
                rule.connection_id,
                rule.principal_type,
                rule.principal_id,
                rule.effect,
                rule.action,
              ]
            )
          );
        }
      }

      await db.batch(statements);
      await logAuditEvent(
        env,
        {
          actor_id: user.sub,
          action: 'openai_connections_updated',
          resource_type: 'admin',
          resource_id: 'openai-connections',
          metadata: {
            connections: sanitized.length,
            model_updates: modelUpdates.length,
            access_updates: normalizedAccessUpdates.length,
          },
        },
        logger
      );
      return json(req, {
        ok: true,
        model_updates: modelUpdates.length,
        access_updates: normalizedAccessUpdates.map((entry) => ({
          connection_id: entry.connection_id,
          rules: entry.rules.map((rule) => ({
            principal_type: rule.principal_type,
            principal_id: rule.principal_id,
            effect: rule.effect,
            action: rule.action,
          })),
        })),
      });
    } catch (err) {
      logger.error('OpenAI connections update failed', { error: err?.message || err });
      return error(req, 'Failed to update connections', 500);
    }
  }

  return null;
}

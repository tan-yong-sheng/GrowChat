// fallow-ignore-file code-duplication
/**
 * Users Admin Access Handler
 */
import { loadUserResourceOverrides } from '../../../public/js/shared/utils/user-resource-overrides.js';
import { loadToolServers } from '../../admin/tool-servers.js';
import { createDB } from '../../db.js';
import { getAllOpenAIConnectionConfigs } from '../../llm/connections.js';
import { authorize, resolvePermissions } from '../../utils/authorize.js';
import { loadConnectionAclRules } from '../../utils/connection-acl.js';
import { loadModelAclRules } from '../../utils/model-acl.js';
import { authError, error, json } from '../../utils/response.js';
import { loadToolServerAclRules } from '../../utils/tool-server-acl.js';
import { loadPrimaryRole } from '../../utils/user-role.js';
import { loadModelEnabledMap, normalizeAccountStatus } from './users-helpers.js';

/**
 * Handle users/admin/access routes.
 * Returns Response if handled, null if path doesn't match.
 */
export async function handleUsersAdminAccess(
  req,
  env,
  ctx,
  user,
  path,
  { _db, logger, _requestContext }
) {
  if (req.method === 'GET' && path.match(/^\/api\/admin\/users\/[^/]+\/access$/)) {
    const userId = path.split('/').slice(-2, -1)[0];
    const authDecision = await authorize(env, user, {
      action: 'admin.user.read',
      resource: 'user',
      resourceId: userId,
    });

    if (!authDecision.allow) {
      return authError(req, authDecision);
    }

    const db = createDB(env.DB);
    try {
      const targetUser = await db.first(
        'SELECT id, email, name, account_status FROM users WHERE id = ?',
        [userId]
      );
      if (!targetUser) {
        return error(req, 'User not found', 404);
      }
      const primaryRole = (await loadPrimaryRole(db, userId)) || 'member';

      const groupRows = await db.all(
        `SELECT g.id, g.name, g.description, g.is_system
         FROM group_members gm
         INNER JOIN groups g ON g.id = gm.group_id
         WHERE gm.user_id = ?
         ORDER BY g.is_system DESC, g.name ASC`,
        [userId]
      );
      const groupIds = new Set(
        (Array.isArray(groupRows) ? groupRows : []).map((group) => group.id).filter(Boolean)
      );
      const groupMap = new Map(
        (Array.isArray(groupRows) ? groupRows : []).map((group) => [group.id, group.name])
      );
      const userPermissions = await resolvePermissions(db, {
        sub: userId,
        role: primaryRole,
      });
      const modelEnabledMap = await loadModelEnabledMap(db, logger);
      const connectionEnabledMap = new Map(
        (
          await getAllOpenAIConnectionConfigs(env, {
            includeDisabled: true,
            includeHiddenForUser: true,
          })
        ).map((connection) => [String(connection.id || ''), connection.enabled !== false])
      );
      const toolServerEnabledMap = new Map(
        (await loadToolServers(db, { includeHiddenForUser: true })).map((server) => [
          String(server.id || ''),
          server.enabled !== false,
        ])
      );
      const userResourceOverrides = await loadUserResourceOverrides(db, userId);
      const hiddenConnectionIds = new Set(userResourceOverrides?.connections?.hidden_ids || []);
      const hiddenModelIds = new Set(userResourceOverrides?.models?.hidden_ids || []);
      const hiddenToolServerIds = new Set(userResourceOverrides?.tool_servers?.hidden_ids || []);

      const decorateRules = (
        rules = [],
        familyLabel,
        enabledMap = new Map(),
        hiddenIds = new Set()
      ) =>
        (Array.isArray(rules) ? rules : [])
          .filter((rule) => {
            if (rule?.principal_type === 'user') {
              return String(rule.principal_id || '') === String(userId || '');
            }
            return groupIds.has(String(rule.principal_id || ''));
          })
          .map((rule) => {
            const resourceId =
              rule.resource_id || rule.model_id || rule.connection_id || rule.tool_server_id || '';
            const resourceEnabled = enabledMap.has(resourceId) ? enabledMap.get(resourceId) : true;
            const hiddenForUser = hiddenIds.has(resourceId);
            const effect = String(rule.effect || 'allow')
              .trim()
              .toLowerCase();
            const accessState = !resourceEnabled
              ? 'disabled'
              : hiddenForUser
                ? 'hidden_for_user'
                : effect === 'deny'
                  ? 'revoked'
                  : rule.principal_type === 'group'
                    ? 'shared'
                    : 'personal';
            return {
              family: familyLabel,
              resource_id: resourceId,
              resource_enabled: resourceEnabled,
              visible_for_user: !hiddenForUser && resourceEnabled,
              hidden_for_user: hiddenForUser,
              access_state: accessState,
              principal_type: rule.principal_type,
              principal_id: rule.principal_id,
              principal_label:
                rule.principal_type === 'group'
                  ? `Group: ${groupMap.get(rule.principal_id) || rule.principal_id}`
                  : 'Direct user',
              effect,
              action: rule.action,
            };
          });

      const modelRules = decorateRules(
        await loadModelAclRules(db),
        'model',
        modelEnabledMap,
        hiddenModelIds
      );
      const connectionRules = decorateRules(
        await loadConnectionAclRules(db),
        'connection',
        connectionEnabledMap,
        hiddenConnectionIds
      );
      const toolServerRules = decorateRules(
        await loadToolServerAclRules(db),
        'mcp_server',
        toolServerEnabledMap,
        hiddenToolServerIds
      );

      return json(req, {
        user: {
          id: targetUser.id,
          email: targetUser.email,
          name: targetUser.name,
          account_status: normalizeAccountStatus(targetUser.account_status),
          primary_role: primaryRole,
        },
        groups: Array.from(groupMap.entries()).map(([id, name]) => ({
          id,
          name,
        })),
        role_permissions: userPermissions,
        access: {
          models: modelRules,
          connections: connectionRules,
          mcp_servers: toolServerRules,
        },
      });
    } catch (err) {
      logger.error('Inspect user access failed', { error: err?.message || err });
      return error(req, 'Failed to inspect user access', 500);
    }
  }

  // POST /api/admin/users - Create user (admin only)
  return null;
}

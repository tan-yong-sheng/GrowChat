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
      const targetUser = await findUserById(db, userId);
      if (!targetUser) {
        return error(req, 'User not found', 404);
      }

      const primaryRole = (await loadPrimaryRole(db, userId)) ?? 'member';
      const { groupRows, groupIds, groupMap } = await loadUserGroupInfo(db, userId);
      const userPermissions = await resolvePermissions(db, {
        sub: userId,
        role: primaryRole,
      });
      const modelEnabledMap = await loadModelEnabledMap(db, logger);
      const connectionEnabledMap = await buildConnectionEnabledMap(env);
      const toolServerEnabledMap = await buildToolServerEnabledMap(db);

      const userResourceOverrides = await loadUserResourceOverrides(db, userId);
      const hiddenConnectionIds = new Set(userResourceOverrides?.connections?.hidden_ids ?? []);
      const hiddenModelIds = new Set(userResourceOverrides?.models?.hidden_ids ?? []);
      const hiddenToolServerIds = new Set(userResourceOverrides?.tool_servers?.hidden_ids ?? []);

      const modelRules = await buildModelRules(
        db,
        modelEnabledMap,
        hiddenModelIds,
        userId,
        groupIds,
        groupMap
      );
      const connectionRules = await buildConnectionRules(
        db,
        connectionEnabledMap,
        hiddenConnectionIds,
        userId,
        groupIds,
        groupMap
      );
      const toolServerRules = await buildToolServerRules(
        db,
        toolServerEnabledMap,
        hiddenToolServerIds,
        userId,
        groupIds,
        groupMap
      );

      return json(
        req,
        buildAccessResponse(
          targetUser,
          primaryRole,
          groupMap,
          userPermissions,
          modelRules,
          connectionRules,
          toolServerRules
        )
      );
    } catch (err) {
      logger.error('Inspect user access failed', { error: err?.message ?? err });
      return error(req, 'Failed to inspect user access', 500);
    }
  }

  return null;
}

async function findUserById(db, userId) {
  const targetUser = await db.first(
    'SELECT id, email, name, account_status FROM users WHERE id = ?',
    [userId]
  );
  return targetUser;
}

async function loadUserGroupInfo(db, userId) {
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
  return { groupRows, groupIds, groupMap };
}

async function buildConnectionEnabledMap(env) {
  const connections = await getAllOpenAIConnectionConfigs(env, {
    includeDisabled: true,
    includeHiddenForUser: true,
  });
  return new Map(
    connections.map((connection) => [String(connection.id || ''), connection.enabled !== false])
  );
}

async function buildToolServerEnabledMap(db) {
  const servers = await loadToolServers(db, { includeHiddenForUser: true });
  return new Map(servers.map((server) => [String(server.id || ''), server.enabled !== false]));
}

function buildAccessResponse(
  targetUser,
  primaryRole,
  groupMap,
  userPermissions,
  modelRules,
  connectionRules,
  toolServerRules
) {
  return {
    user: {
      id: targetUser.id,
      email: targetUser.email,
      name: targetUser.name,
      account_status: normalizeAccountStatus(targetUser.account_status),
      primary_role: primaryRole,
    },
    groups: Array.from(groupMap.entries()).map(([id, name]) => ({ id, name })),
    role_permissions: userPermissions,
    access: {
      models: modelRules,
      connections: connectionRules,
      mcp_servers: toolServerRules,
    },
  };
}

function matchesRulePrincipal(rule, userId, groupIds) {
  if (rule?.principal_type === 'user') {
    return String(rule.principal_id || '') === String(userId || '');
  }
  return groupIds.has(String(rule.principal_id || ''));
}

function buildDecoratedRule(rule, familyLabel, enabledMap, hiddenIds, userId, groupIds, groupMap) {
  const resourceId =
    rule.resource_id || rule.model_id || rule.connection_id || rule.tool_server_id || '';
  const resourceEnabled = enabledMap.has(resourceId) ? enabledMap.get(resourceId) : true;
  const hiddenForUser = hiddenIds.has(resourceId);
  const effect = String(rule.effect || 'allow')
    .trim()
    .toLowerCase();
  const accessState = resolveAccessState(rule, effect, resourceEnabled, hiddenForUser);
  return {
    family: familyLabel,
    resource_id: resourceId,
    resource_enabled: resourceEnabled,
    visible_for_user: !hiddenForUser && resourceEnabled,
    hidden_for_user: hiddenForUser,
    access_state: accessState,
    principal_type: rule.principal_type,
    principal_id: rule.principal_id,
    principal_label: rulePrincipalLabel(rule, groupMap),
    effect,
    action: rule.action,
  };
}

function resolveAccessState(rule, effect, resourceEnabled, hiddenForUser) {
  if (!resourceEnabled) return 'disabled';
  if (hiddenForUser) return 'hidden_for_user';
  if (effect === 'deny') return 'revoked';
  if (rule.principal_type === 'group') return 'shared';
  return 'personal';
}

function rulePrincipalLabel(rule, groupMap) {
  if (rule.principal_type === 'group') {
    return `Group: ${groupMap.get(rule.principal_id) || rule.principal_id}`;
  }
  return 'Direct user';
}

async function buildModelRules(db, modelEnabledMap, hiddenModelIds, userId, groupIds, groupMap) {
  const ids = [...modelEnabledMap.keys()].filter((id) => !hiddenModelIds.has(id));
  const rules = await loadModelAclRules(db, null, new Set(ids));
  return rules.map((rule) =>
    buildDecoratedRule(rule, 'model', modelEnabledMap, hiddenModelIds, userId, groupIds, groupMap)
  );
}

async function buildConnectionRules(
  db,
  connectionEnabledMap,
  hiddenConnectionIds,
  userId,
  groupIds,
  groupMap
) {
  const ids = [...connectionEnabledMap.keys()].filter((id) => !hiddenConnectionIds.has(id));
  const rules = await loadConnectionAclRules(db, null, new Set(ids));
  return rules.map((rule) =>
    buildDecoratedRule(
      rule,
      'connection',
      connectionEnabledMap,
      hiddenConnectionIds,
      userId,
      groupIds,
      groupMap
    )
  );
}

async function buildToolServerRules(
  db,
  toolServerEnabledMap,
  hiddenToolServerIds,
  userId,
  groupIds,
  groupMap
) {
  const ids = [...toolServerEnabledMap.keys()].filter((id) => !hiddenToolServerIds.has(id));
  const rules = await loadToolServerAclRules(db, null, new Set(ids));
  return rules.map((rule) =>
    buildDecoratedRule(
      rule,
      'tool_server',
      toolServerEnabledMap,
      hiddenToolServerIds,
      userId,
      groupIds,
      groupMap
    )
  );
}

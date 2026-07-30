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

const HTTP_STATUS_NOT_FOUND = 404;
const HTTP_STATUS_INTERNAL_ERROR = 500;
const USER_PATH_ID_INDEX = -2;

async function authorizeAdminRead(env, user, userId, req) {
  const authDecision = await authorize(env, user, {
    action: 'admin.user.read',
    resource: 'user',
    resourceId: userId,
  });
  if (!authDecision.allow) {
    return { error: authError(req, authDecision) };
  }
  return { error: null };
}

async function findUserOrError(db, userId, req) {
  const targetUser = await findUserById(db, userId);
  if (!targetUser) {
    return { user: null, error: error(req, 'User not found', HTTP_STATUS_NOT_FOUND) };
  }
  return { user: targetUser, error: null };
}

async function loadUserAccessContext(db, env, logger, userId) {
  const primaryRole = (await loadPrimaryRole(db, userId)) ?? 'member';
  const groupInfo = await loadUserGroupInfo(db, userId);
  const userPermissions = await resolvePermissions(db, {
    sub: userId,
    role: primaryRole,
  });
  const enabledMaps = await loadResourceEnabledMaps(db, env, logger);
  const overrides = await loadUserResourceOverrides(db, userId);
  const hiddenIds = extractHiddenIds(overrides);
  return {
    primaryRole,
    groupIds: groupInfo.groupIds,
    groupMap: groupInfo.groupMap,
    userPermissions,
    modelEnabledMap: enabledMaps.modelEnabledMap,
    connectionEnabledMap: enabledMaps.connectionEnabledMap,
    toolServerEnabledMap: enabledMaps.toolServerEnabledMap,
    hiddenIds,
  };
}

async function loadResourceEnabledMaps(db, env, logger) {
  const modelEnabledMap = await loadModelEnabledMap(db, logger);
  const connectionEnabledMap = await buildConnectionEnabledMap(env);
  const toolServerEnabledMap = await buildToolServerEnabledMap(db);
  return { modelEnabledMap, connectionEnabledMap, toolServerEnabledMap };
}

function extractHiddenIds(overrides) {
  return {
    connections: new Set(overrides?.connections?.hidden_ids ?? []),
    models: new Set(overrides?.models?.hidden_ids ?? []),
    tool_servers: new Set(overrides?.tool_servers?.hidden_ids ?? []),
  };
}

async function buildAccessRules(db, context) {
  const { modelEnabledMap, connectionEnabledMap, toolServerEnabledMap, hiddenIds } = context;
  const modelRules = await buildModelRules({
    db,
    enabledMap: modelEnabledMap,
    hiddenIds: hiddenIds.models,
    groupMap: context.groupMap,
  });
  const connectionRules = await buildConnectionRules({
    db,
    enabledMap: connectionEnabledMap,
    hiddenIds: hiddenIds.connections,
    groupMap: context.groupMap,
  });
  const toolServerRules = await buildToolServerRules({
    db,
    enabledMap: toolServerEnabledMap,
    hiddenIds: hiddenIds.tool_servers,
    groupMap: context.groupMap,
  });
  return { modelRules, connectionRules, toolServerRules };
}

/**
 * Handle users/admin/access routes.
 * Returns Response if handled, null if path doesn't match.
 */
export async function handleUsersAdminAccess({ req, env, user, path, deps }) {
  const ACCESS_PATH_PATTERN = /^\/api\/admin\/users\/[^/]+\/access$/;
  if (req.method === 'GET' && ACCESS_PATH_PATTERN.test(path)) {
    const userId = path.split('/').slice(USER_PATH_ID_INDEX, -1)[0];
    const { logger } = deps;

    const auth = await authorizeAdminRead(env, user, userId, req);
    if (auth.error) return auth.error;

    const db = createDB(env.DB);
    try {
      const { user: targetUser, error: findError } = await findUserOrError(db, userId, req);
      if (findError) return findError;

      const context = await loadUserAccessContext(db, env, logger, userId);
      const rules = await buildAccessRules(db, context);

      return json(req, buildAccessResponse({ targetUser, context, rules }));
    } catch (err) {
      logger.error('Inspect user access failed', { error: err?.message ?? err });
      return error(req, 'Failed to inspect user access', HTTP_STATUS_INTERNAL_ERROR);
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
  return { groupIds, groupMap };
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

function buildAccessResponse({ targetUser, context, rules }) {
  return {
    user: {
      id: targetUser.id,
      email: targetUser.email,
      name: targetUser.name,
      account_status: normalizeAccountStatus(targetUser.account_status),
      primary_role: context.primaryRole,
    },
    groups: Array.from(context.groupMap.entries()).map(([id, name]) => ({ id, name })),
    role_permissions: context.userPermissions,
    access: {
      models: rules.modelRules,
      connections: rules.connectionRules,
      mcp_servers: rules.toolServerRules,
    },
  };
}

function buildDecoratedRule({ rule, familyLabel, enabledMap, hiddenIds, groupMap }) {
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

function buildFamilyRules({ rules, familyLabel, enabledMap, hiddenIds, groupMap }) {
  return rules.map((rule) =>
    buildDecoratedRule({ rule, familyLabel, enabledMap, hiddenIds, groupMap })
  );
}

async function buildModelRules({ db, enabledMap, hiddenIds, groupMap }) {
  const ids = [...enabledMap.keys()].filter((id) => !hiddenIds.has(id));
  const rules = await loadModelAclRules(db, null, new Set(ids));
  return buildFamilyRules({ rules, familyLabel: 'model', enabledMap, hiddenIds, groupMap });
}

async function buildConnectionRules({ db, enabledMap, hiddenIds, groupMap }) {
  const ids = [...enabledMap.keys()].filter((id) => !hiddenIds.has(id));
  const rules = await loadConnectionAclRules(db, null, new Set(ids));
  return buildFamilyRules({ rules, familyLabel: 'connection', enabledMap, hiddenIds, groupMap });
}

async function buildToolServerRules({ db, enabledMap, hiddenIds, groupMap }) {
  const ids = [...enabledMap.keys()].filter((id) => !hiddenIds.has(id));
  const rules = await loadToolServerAclRules(db, null, new Set(ids));
  return buildFamilyRules({ rules, familyLabel: 'tool_server', enabledMap, hiddenIds, groupMap });
}

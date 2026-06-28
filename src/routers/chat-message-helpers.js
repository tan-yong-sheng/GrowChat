import { error } from '../utils/response.js';
import { createRealtimeBus } from '../services/realtime-bus.js';
import { authorize } from '../utils/authorize.js';
import { resolveProviderForModel } from './chat-core.js';
import {
  buildModelAclIndex,
  evaluateModelAclAccess,
  loadModelAclRules,
} from '../utils/model-acl.js';

export async function ensureModelAllowed(req, env, db, user, model) {
  const useDecision = await authorize(env, user, {
    action: 'model.use',
    resource: 'model',
    resourceId: model,
  });
  if (!useDecision.allow) {
    const statusCodeMap = {
      server_error: 500,
      unauthorized: 401,
      not_found: 404,
    };
    const statusCode = statusCodeMap[useDecision.code] || 403;
    return {
      error: error(req, useDecision.reason || useDecision.message || 'Forbidden', statusCode),
    };
  }

  const providerInfo = await resolveProviderForModel(env, model, {
    userId: user?.sub || '',
    userRole: user?.primary_role || 'member',
  });
  if (providerInfo?.error) {
    return { error: error(req, providerInfo.error, 400) };
  }

  const groupRows = user?.sub
    ? await db.all('SELECT group_id FROM group_members WHERE user_id = ?', [user.sub])
    : [];
  const userGroupIds = new Set(
    (Array.isArray(groupRows) ? groupRows : []).map((row) => row.group_id).filter(Boolean)
  );

  const aclRules = await loadModelAclRules(db, model);
  const aclIndex = buildModelAclIndex(aclRules);
  const access = evaluateModelAclAccess(
    { connection_source: providerInfo?.connection?.source },
    { user, userGroupIds, rules: aclIndex.get(model) || [] }
  );
  if (!access.allowed) {
    return { error: error(req, 'Model not allowed', 403) };
  }

  return { providerInfo, access };
}

export function normalizeSelectedToolNames(input) {
  if (!Array.isArray(input)) return null;
  const seen = new Set();
  const names = [];
  for (const value of input) {
    const name = String(value || '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

export async function publishRealtimeNow(env, event) {
  try {
    return await createRealtimeBus(env).publish(event);
  } catch {
    return false;
  }
}

export async function requireChatPermission(req, env, user, action, chatId) {
  const authDecision = await authorize(env, user, {
    action,
    resource: 'chat',
    resourceId: chatId,
  });
  if (!authDecision.allow) {
    const statusCodeMap = {
      server_error: 500,
      unauthorized: 401,
      not_found: 404,
    };
    const statusCode = statusCodeMap[authDecision.code] || 403;
    return error(req, authDecision.reason || authDecision.message || 'Forbidden', statusCode);
  }
  return null;
}

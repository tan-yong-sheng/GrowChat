import { error } from '../utils/response.js';
import { createRealtimeBus } from '../services/realtime-bus.js';
import { authorize } from '../utils/authorize.js';
import { requireOwnedChat, resolveDefaultModel, resolveProviderForModel } from './chat-core.js';
import { mergeTextAttachmentParts } from '../chat/attachments.js';
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

export async function requireOwnedChatWithPermission(req, env, db, user, action, chatId) {
  const permissionError = await requireChatPermission(req, env, user, action, chatId);
  if (permissionError) return { error: permissionError };
  const owned = await requireOwnedChat(req, db, chatId, user.sub);
  if (owned.error) return { error: owned.error };
  return { chat: owned.chat };
}

async function resolveRequestedModel(req, env, db, user, modelOrChat) {
  const requested = String(modelOrChat.model || '').trim();
  if (requested) return requested;
  return resolveDefaultModel(env, db, user.sub);
}

function buildResolvedModel(model, modelDecision) {
  if (modelDecision?.error) return modelDecision;
  return { model, providerInfo: modelDecision.providerInfo };
}

export async function resolveChatModel(req, env, db, user, modelOrChat) {
  const model = await resolveRequestedModel(req, env, db, user, modelOrChat);
  const modelDecision = await ensureModelAllowed(req, env, db, user, model);
  return buildResolvedModel(model, modelDecision);
}

export function buildUserMessageContent(content, attachmentParts) {
  const hasNonText = attachmentParts.some((part) => part?.type && part.type !== 'text');
  if (hasNonText) {
    return {
      role: 'user',
      content: [{ type: 'text', text: content }, ...attachmentParts],
    };
  }
  return {
    role: 'user',
    content: mergeTextAttachmentParts(content, attachmentParts),
  };
}

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

const HTTP_FORBIDDEN = 403;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const HTTP_SERVER_ERROR = 500;
const DEFAULT_USER_ROLE = 'member';

const AUTH_STATUS_CODE_BY_CODE = {
  server_error: HTTP_SERVER_ERROR,
  unauthorized: HTTP_UNAUTHORIZED,
  not_found: HTTP_NOT_FOUND,
};

function resolveAuthStatusCode(decision, fallback = HTTP_FORBIDDEN) {
  return AUTH_STATUS_CODE_BY_CODE[decision?.code] || fallback;
}

function buildAuthErrorResponse(req, decision, fallbackMessage = 'Forbidden') {
  const statusCode = resolveAuthStatusCode(decision);
  return error(req, decision?.reason || decision?.message || fallbackMessage, statusCode);
}

async function authorizeModelAccess({ env, user, model }) {
  return authorize(env, user, {
    action: 'model.use',
    resource: 'model',
    resourceId: model,
  });
}

async function loadUserGroupIds(db, userId) {
  if (!userId) return new Set();
  const rows = await db.all('SELECT group_id FROM group_members WHERE user_id = ?', [userId]);
  const list = Array.isArray(rows) ? rows : [];
  return new Set(list.map((row) => row.group_id).filter(Boolean));
}

async function loadAclAccess({ db, model, providerInfo, user, userGroupIds }) {
  const aclRules = await loadModelAclRules(db, model);
  const aclIndex = buildModelAclIndex(aclRules);
  return evaluateModelAclAccess(
    { connection_source: providerInfo?.connection?.source },
    { user, userGroupIds, rules: aclIndex.get(model) || [] }
  );
}

async function resolveProvider({ env, model, user }) {
  return resolveProviderForModel(env, model, {
    userId: user?.sub || '',
    userRole: user?.primary_role || DEFAULT_USER_ROLE,
  });
}

export async function ensureModelAllowed({ req, env, db, user, model }) {
  const useDecision = await authorizeModelAccess({ env, user, model });
  if (!useDecision.allow) {
    return { error: buildAuthErrorResponse(req, useDecision) };
  }

  const providerInfo = await resolveProvider({ env, model, user });
  if (providerInfo?.error) {
    return { error: error(req, providerInfo.error, HTTP_BAD_REQUEST) };
  }

  const userGroupIds = await loadUserGroupIds(db, user?.sub);
  const access = await loadAclAccess({ db, model, providerInfo, user, userGroupIds });
  if (!access.allowed) {
    return { error: error(req, 'Model not allowed', HTTP_FORBIDDEN) };
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

export async function requireChatPermission({ req, env, user, action, chatId }) {
  const authDecision = await authorize(env, user, {
    action,
    resource: 'chat',
    resourceId: chatId,
  });
  if (!authDecision.allow) return buildAuthErrorResponse(req, authDecision);
  return null;
}

export async function requireOwnedChatWithPermission({ req, env, db, user, action, chatId }) {
  const permissionError = await requireChatPermission({ req, env, user, action, chatId });
  if (permissionError) return { error: permissionError };
  const owned = await requireOwnedChat(req, db, chatId, user.sub);
  if (owned.error) return { error: owned.error };
  return { chat: owned.chat };
}

export async function resolveRequestedModel({ env, db, user, modelOrChat }) {
  const requested = String(modelOrChat.model || '').trim();
  if (requested) return requested;
  return resolveDefaultModel(env, db, user.sub);
}

function buildResolvedModel(model, modelDecision) {
  if (modelDecision?.error) return modelDecision;
  return { model, providerInfo: modelDecision.providerInfo };
}

export async function resolveChatModel({ req, env, db, user, modelOrChat }) {
  const model = await resolveRequestedModel({ env, db, user, modelOrChat });
  const modelDecision = await ensureModelAllowed({ req, env, db, user, model });
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

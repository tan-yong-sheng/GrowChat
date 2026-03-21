import { createDB } from '../db.js';
import { error, json, jsonCached, sseData, sseHeaders, createWeakEtag } from '../utils/response.js';
import { SseLineParser, streamLLM } from '../llm.js';
import { runAsyncSessionProcessor } from '../async-session-processor.js';
import { resolveTurnContinuation } from '../llm/turn-policy.js';
import { queryFAQs, queryDocumentChunks } from '../services/embeddings.js';
import { createRealtimeEvent, getOriginSessionId } from '../realtime.js';
import { RATE_LIMITS, checkRateLimit } from '../services/rate-limit.js';
import { createChatRepository } from '../repositories/chat-repository.js';
import { createRealtimeBus } from '../services/realtime-bus.js';
import { getConfigValue, setConfigValue } from '../utils/app-config.js';
import { getAllOpenAIConnectionConfigs } from '../llm/connections.js';
import { normalizeProviderFamily, parseModelId, parseProviderId } from '../llm/provider-registry.js';
import { buildMetadataSystemPrompt } from '../llm/system-prompt.js';
import { trimTrailingAssistantMessages } from './chat-history.js';
import {
  buildMcpTools,
  executeMcpToolCall,
  loadToolServers,
  parseToolArguments,
  stringifyToolPayload,
} from '../chat/mcp.js';
import {
  applyToolCallDelta,
  buildUnknownToolPrompt,
  normalizeToolCalls,
} from '../chat/tools.js';
import { createAssistantRunner } from '../chat/assistant-runner.js';
import { createAssistantStreamLifecycle } from '../chat/stream-lifecycle.js';
import { finalizeAssistantStream } from '../chat/stream-finalize.js';
import {
  ATTACHMENT_KIND_ORDER,
  DEFAULT_ATTACHMENT_CAPS,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_TOTAL_BYTES,
  MAX_TEXT_ATTACHMENT_CHARS,
  MODEL_ATTACHMENT_CAPS_KEY,
  STRICT_ATTACHMENT_CAPS,
  applyAttachmentDefaults,
  arrayBufferToBase64,
  formatUnsupportedAttachmentMessage,
  getAttachmentKinds,
  getModelAttachmentCapsEntry,
  getUnsupportedAttachmentKinds,
  getUnsupportedAttachmentKindsStrict,
  inferUnsupportedAttachmentKind,
  isSupportedAttachmentType,
  isTextLikeContentType,
  isTransientModelError,
  loadModelAttachmentCaps,
  mergeTextAttachmentParts,
  normalizeAttachmentIds,
  recordAttachmentCapabilityFailure,
  saveModelAttachmentCaps,
} from '../chat/attachments.js';

function defaultModel(env) {
  const envDefault = env.DEFAULT_MODELS;
  if (envDefault && envDefault.trim()) {
    // If it's a comma-separated list, use the first model
    const models = envDefault.split(',').map(m => m.trim()).filter(m => m);
    return models[0] || null;
  }
  return null;
}

async function getUserDefaultModelId(db, userId) {
  if (!userId) return null;
  try {
    const row = await db.first('SELECT preferences FROM users WHERE id = ?', [userId]);
    if (!row?.preferences) return null;
    const prefs = JSON.parse(row.preferences);
    const raw = prefs?.defaultModelId;
    if (!raw) return null;
    const value = String(raw).trim();
    if (!value || value.length > 200 || /\s/.test(value)) return null;
    return value;
  } catch {
    return null;
  }
}

async function getGlobalDefaultModelId(db) {
  try {
    const raw = await getConfigValue(db, 'default_model_id', null);
    if (!raw) return null;
    const value = String(raw).trim();
    if (!value || value.length > 200 || /\s/.test(value)) return null;
    return value;
  } catch {
    return null;
  }
}

async function resolveDefaultModel(env, db, userId) {
  const userDefault = await getUserDefaultModelId(db, userId);
  if (userDefault) return userDefault;
  const globalDefault = await getGlobalDefaultModelId(db);
  if (globalDefault) return globalDefault;
  return defaultModel(env);
}

async function resolveProviderForModel(env, model) {
  if (!model) return { error: 'Model is required' };
  let parsed = parseModelId(model);
  let connection = null;
  let providerFamily = null;

  if (!parsed) {
    const enabledConnections = await getAllOpenAIConnectionConfigs(env);
    if (enabledConnections.length === 0) {
      return { error: 'No provider connection configured' };
    }
    if (enabledConnections.length > 1) {
      return { error: 'Model id must include provider prefix when multiple providers are enabled' };
    }
    connection = enabledConnections[0];
  } else {
    const providerInfo = parseProviderId(parsed.providerId);
    if (!providerInfo?.connectionId) {
      return { error: 'Invalid provider id' };
    }
    const allConnections = await getAllOpenAIConnectionConfigs(env, { includeDisabled: true });
    connection = allConnections.find((conn) => {
      if (String(conn.id) !== providerInfo.connectionId) return false;
      const family = normalizeProviderFamily(conn.providerFamily || conn.providerType) || 'openai';
      return family === providerInfo.providerFamily;
    });
  }

  if (!connection) {
    return { error: 'No matching provider connection configured' };
  }
  if (connection.enabled === false) {
    return { error: 'Provider connection is disabled' };
  }

  providerFamily = normalizeProviderFamily(connection.providerFamily || connection.providerType) || 'openai';
  return { providerFamily, connection };
}

async function loadAttachmentDocuments(db, userId, attachmentIds) {
  if (!attachmentIds.length) return [];
  const placeholders = attachmentIds.map(() => '?').join(', ');
  const rows = await db.all(
    `SELECT id, filename, content_type, file_size, r2_key
     FROM documents
     WHERE id IN (${placeholders}) AND user_id = ?`,
    [...attachmentIds, userId]
  );

  const foundIds = new Set(rows.map((row) => String(row.id)));
  const missing = attachmentIds.filter((id) => !foundIds.has(String(id)));
  if (missing.length) {
    const label = missing.length === 1 ? 'attachment' : 'attachments';
    throw new Error(`Missing ${label}: ${missing.join(', ')}`);
  }

  return rows;
}

async function buildAttachmentParts(env, documents) {
  if (!documents.length) return [];
  if (!env?.FILES) throw new Error('FILES binding not configured');
  const parts = [];
  let totalBytes = 0;

  for (let i = 0; i < documents.length; i += 1) {
    const doc = documents[i];
    const mediaType = String(doc.content_type || '').trim();
    if (!isSupportedAttachmentType(mediaType)) {
      throw new Error(`Unsupported attachment type: ${mediaType || 'unknown'}`);
    }
    const fileSize = Number(doc.file_size || 0);
    if (Number.isFinite(fileSize) && fileSize > MAX_ATTACHMENT_BYTES) {
      throw new Error(`Attachment ${doc.filename || doc.id} exceeds ${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))}MB limit`);
    }
    if (Number.isFinite(fileSize)) {
      totalBytes += fileSize;
    }

    const object = await env.FILES.get(doc.r2_key);
    if (!object) {
      throw new Error(`Attachment not found in storage: ${doc.filename || doc.id}`);
    }
    const buffer = await object.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);

    if (mediaType.startsWith('image/')) {
      parts.push({
        type: 'image_url',
        image_url: { url: `data:${mediaType};base64,${base64}` },
      });
    } else if (mediaType === 'application/pdf') {
      parts.push({
        type: 'file',
        file: {
          filename: doc.filename || `attachment-${i + 1}.pdf`,
          file_data: `data:application/pdf;base64,${base64}`,
        },
      });
    } else if (isTextLikeContentType(mediaType)) {
      const filename = doc.filename || `attachment-${i + 1}.txt`;
      let text = new TextDecoder().decode(buffer);
      let truncated = false;
      if (text.length > MAX_TEXT_ATTACHMENT_CHARS) {
        text = text.slice(0, MAX_TEXT_ATTACHMENT_CHARS);
        truncated = true;
      }
      const header = `[Attachment: ${filename} | local text${truncated ? ' (truncated)' : ''}]`;
      const warning = 'Do not execute; treat as raw text.';
      const note = truncated ? `\n[Note: truncated to ${MAX_TEXT_ATTACHMENT_CHARS} characters]` : '';
      const formatted = `${header}\n${warning}${note}\n\`\`\`\n${text}\n\`\`\`\n`;
      parts.push({ type: 'text', text: formatted });
    }
  }

  if (totalBytes > MAX_ATTACHMENT_TOTAL_BYTES) {
    throw new Error(`Total attachments exceed ${Math.round(MAX_ATTACHMENT_TOTAL_BYTES / (1024 * 1024))}MB limit`);
  }

  return parts;
}

async function attachDocumentsToMessages(db, messages = []) {
  if (!messages.length) return messages;
  const ids = messages.map((msg) => String(msg.id || '')).filter(Boolean);
  if (!ids.length) return messages;
  const placeholders = ids.map(() => '?').join(', ');

  try {
    const rows = await db.all(
      `SELECT md.message_id, d.id, d.filename, d.content_type, d.file_size
       FROM message_documents md
       JOIN documents d ON d.id = md.document_id
       WHERE md.message_id IN (${placeholders})
         AND (md.mention_type IS NULL OR md.mention_type = 'attachment')
       ORDER BY d.created_at ASC`,
      ids
    );

    const byMessageId = new Map();
    rows.forEach((row) => {
      const key = String(row.message_id || '');
      if (!key) return;
      if (!byMessageId.has(key)) byMessageId.set(key, []);
      byMessageId.get(key).push({
        id: row.id,
        filename: row.filename,
        content_type: row.content_type,
        file_size: row.file_size,
      });
    });

    return messages.map((msg) => ({
      ...msg,
      attachments: byMessageId.get(String(msg.id || '')) || [],
    }));
  } catch (err) {
    if (/no such table:\s*message_documents/i.test(String(err?.message || ''))) {
      return messages;
    }
    console.warn('Failed to load message attachments:', String(err?.message || err));
    return messages;
  }
}

function requireAuth(req, user) {
  if (!user) return error(req, 'Unauthorized', 401);
  return null;
}

async function getOwnedChat(db, chatId, userId) {
  return createChatRepository(db).findOwnedChat(chatId, userId);
}

async function getMessageSnapshot(db, messageId) {
  return createChatRepository(db).getMessageSnapshot(messageId);
}

async function getChatMessages(db, chatId) {
  return createChatRepository(db).getChatMessages(chatId);
}

function normalizeErrorMessage(err, fallback = 'LLM request failed', maxLen = 500) {
  const raw = String(err?.message || err || fallback || '').trim();
  if (!raw) return fallback;
  return Number.isFinite(maxLen) && maxLen > 0 ? raw.slice(0, maxLen) : raw;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assistantStreamRunner = createAssistantRunner({
  sseData,
  sseHeaders,
  SseLineParser,
  streamLLM,
  runAsyncSessionProcessor,
  resolveTurnContinuation,
  normalizeProviderFamily,
  buildMcpTools,
  loadToolServers,
  executeMcpToolCall,
  parseToolArguments,
  stringifyToolPayload,
  applyToolCallDelta,
  buildUnknownToolPrompt,
  normalizeToolCalls,
  createAssistantStreamLifecycle,
  finalizeAssistantStream,
  recordAttachmentCapabilityFailure,
  createRealtimeEvent,
  getOriginSessionId,
  publishRealtimeNow,
  getMessageSnapshot,
  getOwnedChat,
  normalizeErrorMessage,
  sleep,
});

async function publishRealtimeNow(env, event) {
  try {
    return await createRealtimeBus(env).publish(event);
  } catch {
    return false;
  }
}

export async function chatRouter(req, env, ctx, user, path) {
  const isChatPath = path === '/api/chats' || path === '/api/chats/shared' || path === '/api/chats/archived' || /^\/api\/chats\/[^/]+(?:\/messages(?:\/[^/]+(?:\/(?:branch|regenerate|cancel|status|resume))?)?|\/(?:share|archive|pin|clone))?$/.test(path);
  if (!isChatPath) return null;

  const unauthorized = requireAuth(req, user);
  if (unauthorized) return unauthorized;

  const db = createDB(env.DB);
  const originSessionId = getOriginSessionId(req);

  if (req.method === 'GET' && path === '/api/chats') {
    const url = new URL(req.url);

    // Strict validation for query parameter 'q'
    let qRaw = url.searchParams.get('q') || '';
    qRaw = qRaw.trim();

    // Validate 'q' parameter: 1-200 alphanumeric characters (whitespace allowed)
    if (qRaw.length > 200) {
      return error(req, 'Query parameter "q" exceeds 200 characters', 400);
    }
    if (!/^[^\x00-\x1F\x7F]*$/.test(qRaw)) {
      return error(req, 'Query parameter "q" contains invalid characters', 400);
    }

    const limitParamStr = url.searchParams.get('limit') || '100';
    if (!/^[1-9]\d{0,2}$/.test(limitParamStr)) {
      return error(req, 'Query parameter "limit" must be a positive integer between 1 and 100', 400);
    }
    const limit = Number.parseInt(limitParamStr, 10);
    if (limit > 100) {
      return error(req, 'Query parameter "limit" must be a positive integer between 1 and 100', 400);
    }

    const offsetParamStr = url.searchParams.get('offset') || '0';
    if (!/^\d+$/.test(offsetParamStr)) {
      return error(req, 'Query parameter "offset" must be a non-negative integer', 400);
    }
    const offset = Number.parseInt(offsetParamStr, 10);
    const queryLimit = limit + 1;
    let chats;
    if (qRaw) {
      const like = `%${qRaw}%`;
      chats = await db.all(
        `SELECT DISTINCT c.id, c.title, c.model, c.pinned, c.tags, c.created_at, c.updated_at
         FROM chats c
         LEFT JOIN messages m ON c.id = m.chat_id
         WHERE c.user_id = ?
         AND c.archived = 0
         AND (c.title LIKE ? OR m.content LIKE ?)
         ORDER BY c.updated_at DESC, c.created_at DESC
         LIMIT ? OFFSET ?`,
        [user.sub, like, like, queryLimit, offset]
      );
    } else {
      chats = await db.all(
        'SELECT id, title, model, pinned, tags, created_at, updated_at FROM chats WHERE user_id = ? AND archived = 0 ORDER BY updated_at DESC, created_at DESC LIMIT ? OFFSET ?',
        [user.sub, queryLimit, offset]
      );
    }

    const has_more = chats.length > limit;
    const items = has_more ? chats.slice(0, limit) : chats;

    const itemsTag = items
      .map((chat) => `${chat.id || ''}:${chat.updated_at || 0}`)
      .join('|');
    const etag = createWeakEtag(`${user.sub}|${qRaw}|${limit}|${offset}|${itemsTag}`);

    return jsonCached(req, { chats: items, limit, offset, query: qRaw, has_more }, {
      etag,
      cacheControl: 'private, max-age=30, stale-while-revalidate=120',
      vary: 'Authorization',
    });
  }

  if (req.method === 'POST' && path === '/api/chats') {
    let body = {};
    try {
      body = await req.json();
    } catch {
      // optional
    }

    const id = crypto.randomUUID();
    const title = String(body.title || 'New Chat').trim() || 'New Chat';
    const fallbackModel = await resolveDefaultModel(env, db, user.sub);
    const model = String(body.model || fallbackModel).trim() || fallbackModel;

    await db.run(
      'INSERT INTO chats (id, user_id, title, model, tags, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, unixepoch(), unixepoch())',
      [id, user.sub, title, model, '[]']
    );

    const chat = await db.first('SELECT * FROM chats WHERE id = ?', [id]);
    await publishRealtimeNow(env, createRealtimeEvent({
      type: 'chat.created',
      userId: user.sub,
      chatId: id,
      originSessionId,
      data: { model, chat },
    }));
    return json(req, { chat }, 201);
  }

  // Route: GET /api/chats/shared - List shared chats
  if (req.method === 'GET' && path === '/api/chats/shared') {
    const sharedChats = await db.all(
      'SELECT id, title, model, pinned, tags, share_id, created_at, updated_at FROM chats WHERE user_id = ? AND share_id IS NOT NULL ORDER BY updated_at DESC',
      [user.sub]
    );
    return json(req, { chats: sharedChats });
  }

  // Route: GET /api/chats/archived - List archived chats
  if (req.method === 'GET' && path === '/api/chats/archived') {
    const archivedChats = await db.all(
      'SELECT id, title, model, pinned, tags, created_at, updated_at FROM chats WHERE user_id = ? AND archived = 1 ORDER BY updated_at DESC',
      [user.sub]
    );
    return json(req, { chats: archivedChats });
  }

  const chatIdMatch = path.match(/^\/api\/chats\/([^/]+)$/);
  if (chatIdMatch) {
    const chatId = chatIdMatch[1];

    if (req.method === 'GET') {
      const chat = await getOwnedChat(db, chatId, user.sub);
      if (!chat) return error(req, 'Chat not found', 404);

      const messages = await getChatMessages(db, chatId);
      const withAttachments = await attachDocumentsToMessages(db, messages);
      const lastMessageAt = messages.reduce((max, msg) => Math.max(max, Number(msg?.created_at || 0)), 0);
      const etag = createWeakEtag(
        `${user.sub}|${chatId}|${chat.updated_at || 0}|${chat.current_message_id || ''}|${messages.length}|${lastMessageAt}`
      );

      return jsonCached(req, { chat, messages: withAttachments }, {
        etag,
        cacheControl: 'private, max-age=15, stale-while-revalidate=30',
        vary: 'Authorization',
      });
    }

    if (req.method === 'PUT') {
      const chat = await getOwnedChat(db, chatId, user.sub);
      if (!chat) return error(req, 'Chat not found', 404);

      let body;
      try {
        body = await req.json();
      } catch {
        return error(req, 'Invalid JSON body', 400);
      }

      const title = body.title !== undefined ? String(body.title).trim() : chat.title;
      const pinned = body.pinned !== undefined ? (body.pinned ? 1 : 0) : chat.pinned;
      const tagsArray = Array.isArray(body.tags) ? body.tags : [];
      const tags = body.tags !== undefined ? JSON.stringify(tagsArray) : chat.tags;

      await db.run(
        'UPDATE chats SET title = ?, pinned = ?, tags = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
        [title || 'New Chat', pinned, tags, chatId, user.sub]
      );

      const updated = await getOwnedChat(db, chatId, user.sub);
      await publishRealtimeNow(env, createRealtimeEvent({
        type: 'chat.updated',
        userId: user.sub,
        chatId,
        originSessionId,
        data: { chat: updated },
      }));
      return json(req, { chat: updated });
    }

    if (req.method === 'DELETE') {
      const chat = await getOwnedChat(db, chatId, user.sub);
      if (!chat) return error(req, 'Chat not found', 404);

      await db.run('DELETE FROM chats WHERE id = ? AND user_id = ?', [chatId, user.sub]);
      await publishRealtimeNow(env, createRealtimeEvent({
        type: 'chat.deleted',
        userId: user.sub,
        chatId,
        originSessionId,
      }));
      await publishRealtimeNow(env, createRealtimeEvent({
        type: 'chat.updated',
        userId: user.sub,
        chatId,
        originSessionId,
        data: { shared: false, chat: await getOwnedChat(db, chatId, user.sub) },
      }));

      return json(req, { ok: true });
    }
  }

  // Route: POST /api/chats/:id/pin - Toggle pinned state
  const pinMatch = path.match(/^\/api\/chats\/([^/]+)\/pin$/);
  if (pinMatch && req.method === 'POST') {
    const chatId = pinMatch[1];
    const chat = await getOwnedChat(db, chatId, user.sub);
    if (!chat) return error(req, 'Chat not found', 404);

    const nextPinned = chat.pinned ? 0 : 1;
    await db.run(
      'UPDATE chats SET pinned = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
      [nextPinned, chatId, user.sub]
    );

    const updated = await getOwnedChat(db, chatId, user.sub);
    await publishRealtimeNow(env, createRealtimeEvent({
      type: 'chat.updated',
      userId: user.sub,
      chatId,
      originSessionId,
      data: { chat: updated },
    }));

    return json(req, { chat: updated });
  }

  // Route: POST /api/chats/:id/clone - Duplicate chat and messages
  const cloneMatch = path.match(/^\/api\/chats\/([^/]+)\/clone$/);
  if (cloneMatch && req.method === 'POST') {
    const sourceChatId = cloneMatch[1];
    const sourceChat = await getOwnedChat(db, sourceChatId, user.sub);
    if (!sourceChat) return error(req, 'Chat not found', 404);

    const sourceMessages = await db.all(
      'SELECT id, role, content, model, citations, parent_id, created_at FROM messages WHERE chat_id = ? ORDER BY created_at ASC, rowid ASC',
      [sourceChatId]
    );

    const newChatId = crypto.randomUUID();
    const newTitle = `${String(sourceChat.title || 'New Chat').trim() || 'New Chat'} (Copy)`;

    const statements = [
      db.prepare(
        'INSERT INTO chats (id, user_id, title, model, tags, pinned, share_id, archived, current_message_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, NULL, 0, NULL, unixepoch(), unixepoch())'
      ).bind(
        newChatId,
        user.sub,
        newTitle,
        sourceChat.model || (await resolveDefaultModel(env, db, user.sub)),
        sourceChat.tags || '[]'
      ),
    ];

    const messageIdMap = new Map();
    for (const message of sourceMessages) {
      messageIdMap.set(String(message.id), crypto.randomUUID());
    }

    for (const message of sourceMessages) {
      const mappedParentId = message.parent_id ? messageIdMap.get(String(message.parent_id)) || null : null;
      statements.push(
        db.prepare(
          'INSERT INTO messages (id, chat_id, role, content, model, citations, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())'
        ).bind(
          messageIdMap.get(String(message.id)),
          newChatId,
          message.role,
          message.content,
          message.model,
          message.citations || null,
          mappedParentId
        )
      );
    }

    const mappedCurrentMessageId = sourceChat.current_message_id
      ? messageIdMap.get(String(sourceChat.current_message_id)) || null
      : null;
    if (mappedCurrentMessageId) {
      statements.push(
        db.prepare(
          'UPDATE chats SET current_message_id = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?'
        ).bind(mappedCurrentMessageId, newChatId, user.sub)
      );
    }

    await db.batch(statements);

    const createdChat = await getOwnedChat(db, newChatId, user.sub);
    await publishRealtimeNow(env, createRealtimeEvent({
      type: 'chat.created',
      userId: user.sub,
      chatId: newChatId,
      originSessionId,
      data: { model: createdChat?.model, chat: createdChat },
    }));

    return json(req, { chat: createdChat }, 201);
  }

  // Route: POST /api/chats/:id/share - Create or get share link
  const shareMatch = path.match(/^\/api\/chats\/([^/]+)\/share$/);
  if (shareMatch && req.method === 'POST') {
    const chatId = shareMatch[1];
    const chat = await getOwnedChat(db, chatId, user.sub);
    if (!chat) return error(req, 'Chat not found', 404);

    let shareId = chat.share_id;
    if (!shareId) {
      shareId = crypto.randomUUID();
      await db.run(
        'UPDATE chats SET share_id = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
        [shareId, chatId, user.sub]
      );
    }

    await publishRealtimeNow(env, createRealtimeEvent({
      type: 'chat.updated',
      userId: user.sub,
      chatId,
      originSessionId,
      data: { shared: true, chat: await getOwnedChat(db, chatId, user.sub) },
    }));

    return json(req, {
      share_id: shareId,
      share_url: `/s/${shareId}`,
      chat_id: chatId,
    }, 200);
  }

  // Route: DELETE /api/chats/:id/share - Revoke share link
  const unshareMatch = path.match(/^\/api\/chats\/([^/]+)\/share$/);
  if (unshareMatch && req.method === 'DELETE') {
    const chatId = unshareMatch[1];
    const chat = await getOwnedChat(db, chatId, user.sub);
    if (!chat) return error(req, 'Chat not found', 404);

    if (chat.share_id) {
      await db.run(
        'UPDATE chats SET share_id = NULL, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
        [chatId, user.sub]
      );
    }

    return json(req, { ok: true });
  }

  // Route: POST /api/chats/:id/archive - Toggle archive state
  const archiveMatch = path.match(/^\/api\/chats\/([^/]+)\/archive$/);
  if (archiveMatch && req.method === 'POST') {
    const chatId = archiveMatch[1];
    const chat = await getOwnedChat(db, chatId, user.sub);
    if (!chat) return error(req, 'Chat not found', 404);

    const newArchived = chat.archived ? 0 : 1;
    await db.run(
      'UPDATE chats SET archived = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
      [newArchived, chatId, user.sub]
    );

    const updated = await getOwnedChat(db, chatId, user.sub);
    await publishRealtimeNow(env, createRealtimeEvent({
      type: 'chat.updated',
      userId: user.sub,
      chatId,
      originSessionId,
      data: { archived: newArchived === 1 },
    }));
    return json(req, { chat: updated, archived: newArchived === 1 });
  }

  const sendMatch = path.match(/^\/api\/chats\/([^/]+)\/messages$/);
  if (sendMatch && req.method === 'POST') {
    const chatId = sendMatch[1];
    const chat = await getOwnedChat(db, chatId, user.sub);
    if (!chat) return error(req, 'Chat not found', 404);

    const sendLimit = await checkRateLimit(env.CACHE, {
      action: 'chat-send',
      subject: user.sub,
      ...RATE_LIMITS.chatSend,
    });
    if (!sendLimit.allowed) {
      return error(req, 'Too many messages sent', 429, {
        retry_after: Math.ceil((sendLimit.resetAt - Date.now()) / 1000),
      });
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const content = String(body.message || '').trim();
    if (!content) return error(req, 'message is required', 400);

    let model = String(body.model || chat.model || '').trim();
    if (!model) {
      model = await resolveDefaultModel(env, db, user.sub);
    }

    const providerInfo = await resolveProviderForModel(env, model);
    if (providerInfo?.error) {
      return error(req, providerInfo.error, 400);
    }

    let attachmentParts = [];
    const rawAttachmentIds = Array.isArray(body.attachments) ? body.attachments : [];
    if (rawAttachmentIds.length > MAX_ATTACHMENTS) {
      return error(req, `Too many attachments (max ${MAX_ATTACHMENTS})`, 400);
    }
    const attachmentIds = normalizeAttachmentIds(rawAttachmentIds);
    let attachmentDocs = [];
    let attachmentKinds = [];
    if (attachmentIds.length > 0) {
      if (!env.FILES) {
        return error(req, 'FILES binding missing', 500);
      }
      try {
        attachmentDocs = await loadAttachmentDocuments(db, user.sub, attachmentIds);
      } catch (err) {
        return error(req, normalizeErrorMessage(err, 'Invalid attachments'), 400);
      }
      const unsupported = attachmentDocs.filter((doc) => {
        const type = String(doc.content_type || '').trim();
        return !isSupportedAttachmentType(type);
      });
      if (unsupported.length > 0) {
        const list = unsupported.map((doc) => doc.filename || doc.id).join(', ');
        return error(req, `Unsupported attachment type for: ${list}`, 400);
      }
      try {
        attachmentParts = await buildAttachmentParts(env, attachmentDocs);
      } catch (err) {
        return error(req, normalizeErrorMessage(err, 'Failed to load attachments'), 400);
      }
    }
    if (attachmentDocs.length > 0) {
      attachmentKinds = getAttachmentKinds(attachmentDocs);
      const nonLocalKinds = attachmentKinds.filter((kind) => kind !== 'text');
      const caps = await loadModelAttachmentCaps(db);
      const modelCaps = getModelAttachmentCapsEntry(caps, model);
      const unsupported = nonLocalKinds.length
        ? (STRICT_ATTACHMENT_CAPS
          ? getUnsupportedAttachmentKindsStrict(modelCaps, nonLocalKinds)
          : getUnsupportedAttachmentKinds(modelCaps, nonLocalKinds))
        : [];
      if (attachmentKinds.includes('text') && modelCaps?.text !== true) {
        unsupported.push('text');
      }
      if (unsupported.length > 0) {
        return error(req, 'attachments_not_supported', 400, {
          message: modelCaps
            ? formatUnsupportedAttachmentMessage(unsupported)
            : 'Attachment capabilities not configured for this model.',
          unsupported_types: unsupported,
          resumable: false,
        });
      }
      attachmentKinds = nonLocalKinds;
    }

    const userMsgId = crypto.randomUUID();
    const parentId = chat.current_message_id || null;
    await db.batch([
      db.prepare(
        'INSERT INTO messages (id, chat_id, role, content, model, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, unixepoch())'
      ).bind(userMsgId, chatId, 'user', content, model, parentId),
      db.prepare(
        'UPDATE chats SET current_message_id = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?'
      ).bind(userMsgId, chatId, user.sub),
    ]);

    const createdUserMessage = await getMessageSnapshot(db, userMsgId);
    const updatedChatAfterUserMessage = await getOwnedChat(db, chatId, user.sub);

    if (attachmentDocs.length > 0) {
      try {
        const statements = attachmentDocs.map((doc) => db.prepare(
          'INSERT INTO message_documents (id, message_id, document_id, mention_type, created_at) VALUES (?, ?, ?, ?, unixepoch())'
        ).bind(
          crypto.randomUUID(),
          userMsgId,
          doc.id,
          'attachment'
        ));
        await db.batch(statements);
      } catch (err) {
        console.warn('Failed to persist message attachments:', String(err?.message || err));
      }
    }

    if (createdUserMessage && attachmentDocs.length > 0) {
      createdUserMessage.attachments = attachmentDocs.map((doc) => ({
        id: doc.id,
        filename: doc.filename,
        content_type: doc.content_type,
        file_size: doc.file_size,
      }));
    }

    await publishRealtimeNow(env, createRealtimeEvent({
      type: 'message.created',
      userId: user.sub,
      chatId,
      messageId: userMsgId,
      originSessionId,
      data: { role: 'user', model, message: createdUserMessage, chat: updatedChatAfterUserMessage },
    }));

    const history = await db.all(
      'SELECT role, content FROM messages WHERE chat_id = ? ORDER BY created_at ASC, rowid ASC LIMIT 30',
      [chatId]
    );

    let ragContext = '';
    let citations = [];

    try {
      const faqResults = await queryFAQs(env, db, user.sub, content, 3, 0.5);
      if (faqResults.length > 0) {
        ragContext += '\n## Relevant FAQs\n';
        for (const faq of faqResults) {
          ragContext += `\n**Q: ${faq.question}**\nA: ${faq.answer}\n`;
          if (faq.id) citations.push(faq.id);
        }
      }

      const chunkResults = await queryDocumentChunks(env, db, user.sub, content, 5, 0.5);
      if (chunkResults.length > 0) {
        ragContext += '\n## Relevant Documents\n';
        const seenDocs = new Set();
        for (const chunk of chunkResults) {
          const docId = chunk.doc_id || chunk.document_id;
          const docName = chunk.filename || 'Document';

          if (!seenDocs.has(docId)) {
            ragContext += `\n**${docName}**\n`;
            seenDocs.add(docId);
          }
          ragContext += `${chunk.chunk_text}\n`;
        }
      }
    } catch (err) {
      console.error('RAG query failed:', err);
    }

    const metadataPrompt = buildMetadataSystemPrompt({
      appName: env.APP_NAME || 'GrowChat',
      model,
      providerFamily: providerInfo.providerFamily,
      timeZone: env.TIME_ZONE || env.TZ,
    });

    let enhancedHistory = [
      {
        role: 'system',
        content: metadataPrompt,
      },
    ];
    if (ragContext) {
      enhancedHistory.push({
        role: 'system',
        content: `You are a helpful assistant. Use the following context to answer the user's question:\n${ragContext}`,
      });
    }
    enhancedHistory.push(...history);

    if (attachmentParts.length > 0) {
      const lastIdx = enhancedHistory.length - 1;
      if (lastIdx >= 0 && enhancedHistory[lastIdx]?.role === 'user') {
        const hasNonText = attachmentParts.some((part) => part?.type && part.type !== 'text');
        if (hasNonText) {
          enhancedHistory[lastIdx] = {
            role: 'user',
            content: [
              { type: 'text', text: content },
              ...attachmentParts,
            ],
          };
        } else {
          enhancedHistory[lastIdx] = {
            role: 'user',
            content: mergeTextAttachmentParts(content, attachmentParts),
          };
        }
      }
    }

    const { response } = await assistantStreamRunner({
      req,
      env,
      ctx,
      db,
      user,
      chatId,
      userMsgId,
      parentId: userMsgId,
      model,
      history: enhancedHistory,
      citations,
      attachmentKinds,
      providerFamily: providerInfo.providerFamily,
    });

    return response;
  }

  // Route: POST /api/chats/:id/messages/:msgId/branch
  // Supports both user and assistant message branching
  // For user messages: creates new user message + calls LLM + streams response
  // For assistant messages (no_reply=true): creates new sibling message without LLM
  const branchMatch = path.match(/^\/api\/chats\/([^/]+)\/messages\/([^/]+)\/branch$/);
  if (branchMatch && req.method === 'POST') {
    const chatId = branchMatch[1];
    const msgId = branchMatch[2];

    async function getBranchHistory(leafMessageId) {
      return db.all(
        `WITH RECURSIVE lineage AS (
          SELECT id, parent_id, role, content, created_at, rowid
          FROM messages
          WHERE id = ? AND chat_id = ?

          UNION ALL

          SELECT m.id, m.parent_id, m.role, m.content, m.created_at, m.rowid
          FROM messages m
          JOIN lineage l ON m.id = l.parent_id
          WHERE m.chat_id = ?
        )
        SELECT role, content FROM (
          SELECT role, content, created_at, rowid
          FROM lineage
          ORDER BY created_at DESC, rowid DESC
          LIMIT 30
        )
        ORDER BY created_at ASC, rowid ASC`,
        [leafMessageId, chatId, chatId]
      );
    }

    const chat = await getOwnedChat(db, chatId, user.sub);
    if (!chat) return error(req, 'Chat not found', 404);

    const sourceMsg = await db.first(
      'SELECT role, parent_id, model, citations FROM messages WHERE id = ? AND chat_id = ?',
      [msgId, chatId]
    );
    if (!sourceMsg) return error(req, 'Message not found', 404);

    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const content = String(body.content || '').trim();
    if (!content) return error(req, 'content is required', 400);

    const role = String(body.role || 'user').trim().toLowerCase();
    if (role !== 'user' && role !== 'assistant') {
      return error(req, "role must be 'user' or 'assistant'", 400);
    }

    const noReply = body.no_reply === true;

    // Validate role/no_reply combination
    if (role === 'user' && noReply) {
      return error(req, "User message branching does not support no_reply=true", 400);
    }
    if (role === 'assistant' && !noReply) {
      return error(req, "Assistant message branching requires no_reply=true", 400);
    }

    if (sourceMsg.role !== role) {
      return error(req, `Cannot branch a ${sourceMsg.role} message as ${role}`, 400);
    }

    // === ASSISTANT MESSAGE BRANCHING (no_reply=true) ===
    if (role === 'assistant' && noReply) {
      const newAssistantMsgId = crypto.randomUUID();

      await db.batch([
        db.prepare(
          'INSERT INTO messages (id, chat_id, role, content, model, citations, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())',
          [
            newAssistantMsgId,
            chatId,
            'assistant',
            content,
            sourceMsg.model,
            sourceMsg.citations,
            sourceMsg.parent_id,
          ]
        ),
        db.prepare(
          'UPDATE chats SET current_message_id = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
          [newAssistantMsgId, chatId, user.sub]
        ),
      ]);

      const newMsg = await db.first(
        'SELECT id, chat_id, role, content, model, citations, parent_id, created_at FROM messages WHERE id = ?',
        [newAssistantMsgId]
      );
      const updatedChat = await getOwnedChat(db, chatId, user.sub);

      await publishRealtimeNow(env, createRealtimeEvent({
        type: 'message.completed',
        userId: user.sub,
        chatId,
        messageId: newAssistantMsgId,
        originSessionId,
        data: { role: 'assistant', model: sourceMsg.model, message: newMsg, chat: updatedChat },
      }));

      return json(req, { message: newMsg }, 200);
    }

    // === USER MESSAGE BRANCHING (role='user' or default) ===
    let model = String(body.model || chat.model || '').trim();
    if (!model) {
      model = await resolveDefaultModel(env, db, user.sub);
    }

    const providerInfo = await resolveProviderForModel(env, model);
    if (providerInfo?.error) {
      return error(req, providerInfo.error, 400);
    }

    let attachmentParts = [];
    let attachmentDocs = [];
    let attachmentKinds = [];
    let attachmentIds = normalizeAttachmentIds(Array.isArray(body.attachments) ? body.attachments : []);
    if (attachmentIds.length === 0) {
      try {
        const inherited = await db.all(
          `SELECT document_id FROM message_documents
           WHERE message_id = ?
             AND (mention_type IS NULL OR mention_type = 'attachment')`,
          [msgId]
        );
        attachmentIds = normalizeAttachmentIds(inherited.map((row) => row.document_id));
      } catch (err) {
        if (!/no such table:\s*message_documents/i.test(String(err?.message || ''))) {
          console.warn('Failed to load inherited attachments:', String(err?.message || err));
        }
      }
    }
    if (attachmentIds.length > MAX_ATTACHMENTS) {
      return error(req, `Too many attachments (max ${MAX_ATTACHMENTS})`, 400);
    }
    if (attachmentIds.length > 0) {
      if (!env.FILES) {
        return error(req, 'FILES binding missing', 500);
      }
      try {
        attachmentDocs = await loadAttachmentDocuments(db, user.sub, attachmentIds);
      } catch (err) {
        return error(req, normalizeErrorMessage(err, 'Invalid attachments'), 400);
      }
      const unsupported = attachmentDocs.filter((doc) => {
        const type = String(doc.content_type || '').trim();
        return !isSupportedAttachmentType(type);
      });
      if (unsupported.length > 0) {
        const list = unsupported.map((doc) => doc.filename || doc.id).join(', ');
        return error(req, `Unsupported attachment type for: ${list}`, 400);
      }
      try {
        attachmentParts = await buildAttachmentParts(env, attachmentDocs);
      } catch (err) {
        return error(req, normalizeErrorMessage(err, 'Failed to load attachments'), 400);
      }
    }
    if (attachmentDocs.length > 0) {
      attachmentKinds = getAttachmentKinds(attachmentDocs);
      const nonLocalKinds = attachmentKinds.filter((kind) => kind !== 'text');
      const caps = await loadModelAttachmentCaps(db);
      const modelCaps = getModelAttachmentCapsEntry(caps, model);
      const unsupported = nonLocalKinds.length
        ? (STRICT_ATTACHMENT_CAPS
          ? getUnsupportedAttachmentKindsStrict(modelCaps, nonLocalKinds)
          : getUnsupportedAttachmentKinds(modelCaps, nonLocalKinds))
        : [];
      if (attachmentKinds.includes('text') && modelCaps?.text !== true) {
        unsupported.push('text');
      }
      if (unsupported.length > 0) {
        return error(req, 'attachments_not_supported', 400, {
          message: modelCaps
            ? formatUnsupportedAttachmentMessage(unsupported)
            : 'Attachment capabilities not configured for this model.',
          unsupported_types: unsupported,
          resumable: false,
        });
      }
      attachmentKinds = nonLocalKinds;
    }

    const newUserMsgId = crypto.randomUUID();
    await db.batch([
      db.prepare(
        'INSERT INTO messages (id, chat_id, role, content, model, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, unixepoch())'
      ).bind(newUserMsgId, chatId, 'user', content, model, sourceMsg.parent_id),
      db.prepare(
        'UPDATE chats SET current_message_id = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?'
      ).bind(newUserMsgId, chatId, user.sub),
    ]);

    const createdBranchUserMessage = await getMessageSnapshot(db, newUserMsgId);
    const updatedBranchChat = await getOwnedChat(db, chatId, user.sub);

    if (attachmentDocs.length > 0) {
      try {
        const statements = attachmentDocs.map((doc) => db.prepare(
          'INSERT INTO message_documents (id, message_id, document_id, mention_type, created_at) VALUES (?, ?, ?, ?, unixepoch())'
        ).bind(
          crypto.randomUUID(),
          newUserMsgId,
          doc.id,
          'attachment'
        ));
        await db.batch(statements);
      } catch (err) {
        console.warn('Failed to persist branch attachments:', String(err?.message || err));
      }
    }

    if (createdBranchUserMessage && attachmentDocs.length > 0) {
      createdBranchUserMessage.attachments = attachmentDocs.map((doc) => ({
        id: doc.id,
        filename: doc.filename,
        content_type: doc.content_type,
        file_size: doc.file_size,
      }));
    }

    await publishRealtimeNow(env, createRealtimeEvent({
      type: 'message.created',
      userId: user.sub,
      chatId,
      messageId: newUserMsgId,
      originSessionId,
      data: { role: 'user', model, message: createdBranchUserMessage, chat: updatedBranchChat },
    }));

    const history = await getBranchHistory(newUserMsgId);
    if (attachmentParts.length > 0) {
      const lastIdx = history.length - 1;
      if (lastIdx >= 0 && history[lastIdx]?.role === 'user') {
        const hasNonText = attachmentParts.some((part) => part?.type && part.type !== 'text');
        if (hasNonText) {
          history[lastIdx] = {
            role: 'user',
            content: [
              { type: 'text', text: content },
              ...attachmentParts,
            ],
          };
        } else {
          history[lastIdx] = {
            role: 'user',
            content: mergeTextAttachmentParts(content, attachmentParts),
          };
        }
      }
    }
    const { response } = await assistantStreamRunner({
      req,
      env,
      ctx,
      db,
      user,
      chatId,
      userMsgId: newUserMsgId,
      parentId: sourceMsg.parent_id,
      model,
      history,
      citations: null,
      attachmentKinds,
      providerFamily: providerInfo.providerFamily,
    });

    return response;
  }

  // Route: POST /api/chats/:id/messages/:msgId/regenerate
  const regenerateMatch = path.match(/^\/api\/chats\/([^/]+)\/messages\/([^/]+)\/regenerate$/);
  if (regenerateMatch && req.method === 'POST') {
    const chatId = regenerateMatch[1];
    const msgId = regenerateMatch[2];

    const chat = await getOwnedChat(db, chatId, user.sub);
    if (!chat) return error(req, 'Chat not found', 404);

    const sourceMsg = await db.first(
      'SELECT role, parent_id FROM messages WHERE id = ? AND chat_id = ?',
      [msgId, chatId]
    );
    if (!sourceMsg) return error(req, 'Message not found', 404);
    if (sourceMsg.role !== 'assistant') return error(req, 'Can only regenerate assistant messages', 400);

    let model = String(chat.model || '').trim();
    if (!model) {
      model = await resolveDefaultModel(env, db, user.sub);
    }

    const providerInfo = await resolveProviderForModel(env, model);
    if (providerInfo?.error) {
      return error(req, providerInfo.error, 400);
    }

    const history = trimTrailingAssistantMessages(await db.all(
      `SELECT role, content
       FROM messages
       WHERE chat_id = ?
         AND (
           created_at < (SELECT created_at FROM messages WHERE id = ?)
           OR (
             created_at = (SELECT created_at FROM messages WHERE id = ?)
             AND rowid <= (SELECT rowid FROM messages WHERE id = ?)
           )
         )
       ORDER BY created_at ASC, rowid ASC
       LIMIT 30`,
      [chatId, sourceMsg.parent_id || msgId, sourceMsg.parent_id || msgId, sourceMsg.parent_id || msgId]
    ));

    const { response } = await assistantStreamRunner({
      req,
      env,
      ctx,
      db,
      user,
      chatId,
      userMsgId: sourceMsg.parent_id,
      parentId: sourceMsg.parent_id,
      model,
      history,
      citations: null,
      providerFamily: providerInfo.providerFamily,
    });

    return response;
  }

  // Route: POST /api/chats/:id/messages/:msgId/cancel
  const cancelMatch = path.match(/^\/api\/chats\/([^/]+)\/messages\/([^/]+)\/cancel$/);
  if (cancelMatch && req.method === 'POST') {
    const chatId = cancelMatch[1];
    const msgId = cancelMatch[2];

    const chat = await getOwnedChat(db, chatId, user.sub);
    if (!chat) return error(req, 'Chat not found', 404);

    const msg = await db.first(
      'SELECT id, role, status FROM messages WHERE id = ? AND chat_id = ?',
      [msgId, chatId]
    );
    if (!msg) return error(req, 'Message not found', 404);
    if (msg.role !== 'assistant') return error(req, 'Only assistant messages can be cancelled', 400);

    const status = String(msg.status || '');
    if (!['streaming', 'tool_running'].includes(status)) {
      return json(req, { ok: true, cancelled: false, status });
    }

    await db.run(
      "UPDATE messages SET status = 'cancelled', error_code = 'cancelled', error_message = ? WHERE id = ? AND chat_id = ?",
      ['Cancelled by user', msgId, chatId]
    );

    const cancelledMessage = await getMessageSnapshot(db, msgId);
    await publishRealtimeNow(env, createRealtimeEvent({
      type: 'message.cancelled',
      userId: user.sub,
      chatId,
      messageId: msgId,
      originSessionId,
      data: {
        role: 'assistant',
        model: cancelledMessage?.model || null,
        message: cancelledMessage,
        chat,
      },
    }));

    return json(req, { ok: true, cancelled: true });
  }

  // Route: GET /api/chats/:id/messages/:msgId/resume
  const resumeMatch = path.match(/^\/api\/chats\/([^/]+)\/messages\/([^/]+)\/resume$/);
  if (resumeMatch && req.method === 'GET') {
    const chatId = resumeMatch[1];
    const msgId = resumeMatch[2];
    const url = new URL(req.url);
    const afterSeq = Number(url.searchParams.get('after_seq') || 0);
    const lastSeq = Number.isFinite(afterSeq) && afterSeq > 0 ? Math.floor(afterSeq) : 0;

    const chat = await getOwnedChat(db, chatId, user.sub);
    if (!chat) return error(req, 'Chat not found', 404);

    const msg = await db.first('SELECT id, role, status FROM messages WHERE id = ? AND chat_id = ?', [msgId, chatId]);
    if (!msg) return error(req, 'Message not found', 404);
    if (msg.role !== 'assistant') return error(req, 'Only assistant messages can be resumed', 400);

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        let cursor = lastSeq;
        let idleRounds = 0;
        while (true) {
          const rows = await db.all(
            'SELECT seq, payload FROM message_deltas WHERE message_id = ? AND seq > ? ORDER BY seq ASC LIMIT 200',
            [msgId, cursor]
          );
          if (rows.length) {
            idleRounds = 0;
            for (const row of rows) {
              if (!row?.payload) continue;
              cursor = Math.max(cursor, Number(row.seq || cursor));
              controller.enqueue(encoder.encode(sseData(String(row.payload))));
            }
          } else {
            idleRounds += 1;
          }

          const statusRow = await db.first('SELECT status FROM messages WHERE id = ? AND chat_id = ?', [msgId, chatId]);
          const status = String(statusRow?.status || '');
          const isRunning = status === 'streaming' || status === 'tool_running';
          if (!isRunning) break;

          // Avoid tight loop if no new data.
          if (idleRounds > 2) {
            await sleep(400);
          } else {
            await sleep(150);
          }
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    return new Response(readable, { headers: sseHeaders(req) });
  }

  // Route: GET /api/chats/:id/messages/:msgId/status
  const statusMatch = path.match(/^\/api\/chats\/([^/]+)\/messages\/([^/]+)\/status$/);
  if (statusMatch && req.method === 'GET') {
    const chatId = statusMatch[1];
    const msgId = statusMatch[2];

    const chat = await getOwnedChat(db, chatId, user.sub);
    if (!chat) return error(req, 'Chat not found', 404);

    const msg = await db.first(
      'SELECT id, role, content, model, citations, parent_id, status, error_code, error_message, tool_calls, message_blocks, created_at FROM messages WHERE id = ? AND chat_id = ?',
      [msgId, chatId]
    );
    if (!msg) return error(req, 'Message not found', 404);

    return json(req, { ok: true, message: msg, chat });
  }

  // Route: PUT /api/chats/:id/messages/:msgId
  const updateMessageMatch = path.match(/^\/api\/chats\/([^/]+)\/messages\/([^/]+)$/);
  if (updateMessageMatch && req.method === 'PUT') {
    const chatId = updateMessageMatch[1];
    const msgId = updateMessageMatch[2];

    const chat = await getOwnedChat(db, chatId, user.sub);
    if (!chat) return error(req, 'Chat not found', 404);

    const message = await db.first(
      'SELECT id, chat_id, role, content, model, citations, parent_id, created_at FROM messages WHERE id = ? AND chat_id = ?',
      [msgId, chatId]
    );
    if (!message) return error(req, 'Message not found', 404);
    if (message.role !== 'assistant') {
      return error(req, 'Only assistant messages can be edited in place', 400);
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return error(req, 'Invalid JSON body', 400);
    }

    const content = String(body.content || '').trim();
    if (!content) return error(req, 'content is required', 400);

    await db.batch([
      db.prepare(
        'UPDATE messages SET content = ? WHERE id = ? AND chat_id = ?',
        [content, msgId, chatId]
      ),
      db.prepare(
        'UPDATE chats SET updated_at = unixepoch() WHERE id = ? AND user_id = ?',
        [chatId, user.sub]
      ),
    ]);

    const updatedMessage = await db.first(
      'SELECT id, chat_id, role, content, model, citations, parent_id, created_at FROM messages WHERE id = ? AND chat_id = ?',
      [msgId, chatId]
    );

    await publishRealtimeNow(env, createRealtimeEvent({
      type: 'chat.updated',
      userId: user.sub,
      chatId,
      originSessionId,
      data: { message_id: msgId },
    }));

    return json(req, { message: updatedMessage }, 200);
  }

  // Route: DELETE /api/chats/:id/messages/:msgId
  const deleteMatch = path.match(/^\/api\/chats\/([^/]+)\/messages\/([^/]+)$/);
  if (deleteMatch && req.method === 'DELETE') {
    const chatId = deleteMatch[1];
    const msgId = deleteMatch[2];

    const chat = await getOwnedChat(db, chatId, user.sub);
    if (!chat) return error(req, 'Chat not found', 404);

    const msg = await db.first('SELECT id FROM messages WHERE id = ? AND chat_id = ?', [msgId, chatId]);
    if (!msg) return error(req, 'Message not found', 404);

    async function deleteMessageSubtree(nodeId) {
      const children = await db.all(
        'SELECT id FROM messages WHERE parent_id = ? AND chat_id = ?',
        [nodeId, chatId]
      );
      for (const child of children) {
        await deleteMessageSubtree(child.id);
      }
      await db.run('DELETE FROM messages WHERE id = ? AND chat_id = ?', [nodeId, chatId]);
    }

    await deleteMessageSubtree(msgId);

    const lastMsg = await db.first(
      'SELECT id FROM messages WHERE chat_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1',
      [chatId]
    );

    if (lastMsg) {
      await db.run(
        'UPDATE chats SET current_message_id = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
        [lastMsg.id, chatId, user.sub]
      );
    } else {
      await db.run(
        'UPDATE chats SET current_message_id = NULL, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
        [chatId, user.sub]
      );
    }

    await publishRealtimeNow(env, createRealtimeEvent({
      type: 'chat.updated',
      userId: user.sub,
      chatId,
      originSessionId,
      data: { deleted_message_id: msgId },
    }));

    return json(req, { ok: true, deleted: msgId });
  }

  return null;
}

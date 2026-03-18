import { createDB } from '../db.js';
import { error, json, sseData, sseHeaders } from '../utils/response.js';
import { SseLineParser, streamLLM } from '../llm.js';
import { queryFAQs, queryDocumentChunks } from '../services/embeddings.js';
import { createRealtimeEvent, getOriginSessionId, publishRealtimeEvent } from '../realtime.js';
import { getConfigValue } from '../utils/app-config.js';
import { getAllOpenAIConnectionConfigs } from '../utils/openai-connections.js';
import { parseModelId, parseProviderId } from '../utils/provider-registry.js';

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

const MAX_ATTACHMENTS = 8;
const MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024;
const MAX_ATTACHMENT_TOTAL_BYTES = 24 * 1024 * 1024;
const SUPPORTED_ATTACHMENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/markdown',
]);

function normalizeAttachmentIds(input) {
  if (!Array.isArray(input)) return [];
  const cleaned = input
    .map((id) => String(id || '').trim())
    .filter(Boolean);
  const seen = new Set();
  const unique = [];
  for (const id of cleaned) {
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  return unique.slice(0, MAX_ATTACHMENTS);
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return btoa(binary);
}

async function resolveProviderForModel(env, model) {
  if (!model) return { error: 'Model is required' };
  let parsed = parseModelId(model);
  let connection = null;
  let providerType = null;

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
      const type = String(conn.providerType || 'openai-compatible').toLowerCase();
      return type === providerInfo.providerType;
    });
  }

  if (!connection) {
    return { error: 'No matching provider connection configured' };
  }
  if (connection.enabled === false) {
    return { error: 'Provider connection is disabled' };
  }

  providerType = String(connection.providerType || 'openai-compatible').toLowerCase();
  return { providerType, connection };
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
    if (!SUPPORTED_ATTACHMENT_TYPES.has(mediaType)) {
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
    } else if (mediaType.startsWith('text/')) {
      const text = new TextDecoder().decode(buffer);
      parts.push({ type: 'text', text });
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
  return db.first('SELECT * FROM chats WHERE id = ? AND user_id = ?', [chatId, userId]);
}

async function getMessageSnapshot(db, messageId) {
  if (!messageId) return null;
  try {
    return await db.first(
      'SELECT id, chat_id, role, content, model, citations, parent_id, status, error_code, error_message, tool_calls, message_blocks, created_at FROM messages WHERE id = ?',
      [messageId]
    );
  } catch (err) {
    return db.first(
      'SELECT id, chat_id, role, content, model, citations, parent_id, message_blocks, created_at FROM messages WHERE id = ?',
      [messageId]
    );
  }
}

async function getChatMessages(db, chatId) {
  try {
    return await db.all(
      'SELECT id, role, content, model, citations, parent_id, status, error_code, error_message, tool_calls, message_blocks, created_at FROM messages WHERE chat_id = ? ORDER BY created_at ASC',
      [chatId]
    );
  } catch (err) {
    return db.all(
      'SELECT id, role, content, model, citations, parent_id, message_blocks, created_at FROM messages WHERE chat_id = ? ORDER BY created_at ASC',
      [chatId]
    );
  }
}

function normalizeErrorMessage(err, fallback = 'LLM request failed', maxLen = 500) {
  const raw = String(err?.message || err || fallback || '').trim();
  if (!raw) return fallback;
  return Number.isFinite(maxLen) && maxLen > 0 ? raw.slice(0, maxLen) : raw;
}

async function persistAssistantErrorMessage(db, {
  messageId,
  chatId,
  userId,
  model,
  parentId,
  errorCode,
  errorMessage,
  content,
  citations,
  toolCalls,
}) {
  const displayContent = String(content || errorMessage || 'LLM request failed').trim();
  const MAX_ERROR_CONTENT = 8000;
  const truncatedContent = displayContent.length > MAX_ERROR_CONTENT
    ? `${displayContent.slice(0, MAX_ERROR_CONTENT)}…`
    : displayContent;
  const safeErrorMessage = String(errorMessage || 'LLM request failed').trim().slice(0, 500);
  const safeErrorCode = String(errorCode || 'llm_error').trim().slice(0, 80);
  const citationsJson = Array.isArray(citations) ? JSON.stringify(citations) : (citations || null);
  const toolCallsJson = Array.isArray(toolCalls) && toolCalls.length ? JSON.stringify(toolCalls) : null;

  try {
    const update = await db.run(
      `UPDATE messages
       SET content = ?, model = ?, citations = ?, parent_id = ?, status = 'error',
           error_code = ?, error_message = ?, tool_calls = ?
       WHERE id = ?`,
      [truncatedContent, model, citationsJson, parentId, safeErrorCode, safeErrorMessage, toolCallsJson, messageId]
    );
    if (update?.meta?.changes) {
      await db.run(
        'UPDATE chats SET current_message_id = ?, model = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
        [messageId, model, chatId, userId]
      );
      return getMessageSnapshot(db, messageId);
    }
  } catch (err) {
    // fall through to insert
  }

  try {
    await db.run(
      `INSERT INTO messages (id, chat_id, role, content, model, citations, parent_id, status, error_code, error_message, tool_calls, created_at)
       VALUES (?, ?, 'assistant', ?, ?, ?, ?, 'error', ?, ?, ?, unixepoch())`,
      [messageId, chatId, truncatedContent, model, citationsJson, parentId, safeErrorCode, safeErrorMessage, toolCallsJson]
    );
  } catch (err) {
    await db.run(
      'INSERT INTO messages (id, chat_id, role, content, model, citations, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())',
      [messageId, chatId, 'assistant', truncatedContent, model, citationsJson, parentId]
    );
  }

  try {
    await db.run(
      'UPDATE chats SET current_message_id = ?, model = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
      [messageId, model, chatId, userId]
    );
  } catch (err) {
    try {
      await db.run(
        'UPDATE chats SET current_message_id = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
        [messageId, chatId, userId]
      );
    } catch { }
  }

  return getMessageSnapshot(db, messageId);
}

function scheduleRealtimeEvent(ctx, env, event) {
  const publishPromise = publishRealtimeEvent(env, event);
  if (ctx?.waitUntil) {
    ctx.waitUntil(publishPromise.catch(() => false));
    return;
  }
  publishPromise.catch(() => false);
}

async function publishRealtimeNow(env, event) {
  try {
    return await publishRealtimeEvent(env, event);
  } catch {
    return false;
  }
}

const MCP_PROTOCOL_VERSION = '2025-11-25';
const MAX_TOOL_STEPS = 20;
const MAX_FOLLOW_UPS = 5;
const FOLLOW_UP_PROMPT = 'Provide a complete final answer to the user. Do not return tool calls or reasoning-only output.';

function shouldUseToolRunner(env) {
  const mode = String(env?.TOOL_RUNNER_MODE || 'inline').toLowerCase();
  if (mode !== 'queue') return false;
  return Boolean(env?.TOOL_QUEUE);
}

async function enqueueToolRunner(env, payload) {
  if (!env?.TOOL_QUEUE) return false;
  try {
    await env.TOOL_QUEUE.send(payload);
    return true;
  } catch {
    return false;
  }
}

async function loadToolServers(db) {
  const raw = await getConfigValue(db, 'tool_servers', '[]');
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeHeadersInput(input) {
  if (!input) return {};
  if (input && typeof input === 'object' && !Array.isArray(input)) return input;
  try {
    const parsed = JSON.parse(String(input));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch { }
  return {};
}

function buildMcpHeaders(base, sessionId) {
  const headers = {
    ...base,
    'mcp-protocol-version': MCP_PROTOCOL_VERSION,
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;
  return headers;
}

function parseSseMessages(body) {
  const blocks = String(body || '').split('\n\n');
  const messages = [];
  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    let data = '';
    for (const line of lines) {
      if (line.startsWith('data:')) {
        data += line.slice(5).trim();
      }
    }
    if (!data) continue;
    try {
      messages.push(JSON.parse(data));
    } catch {
      // ignore parse errors
    }
  }
  return messages;
}

const MCP_RETRY_STATUSES = new Set([429, 500, 503, 504]);
const MCP_MAX_RETRIES = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function mcpFetchWithRetry({ url, headers, sessionId, body }) {
  let attempt = 0;
  while (true) {
    attempt += 1;
    const response = await fetch(url, {
      method: 'POST',
      headers: buildMcpHeaders(headers, sessionId),
      body,
    });

    if (!MCP_RETRY_STATUSES.has(response.status) || attempt >= MCP_MAX_RETRIES) {
      return response;
    }

    const retryAfter = Number(response.headers.get('retry-after') || '');
    const baseDelay = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : (500 * Math.pow(2, attempt - 1));
    const jitter = Math.floor(Math.random() * 250);
    await sleep(baseDelay + jitter);
  }
}

async function mcpRequest({ url, headers, sessionId, id, method, params }) {
  const response = await mcpFetchWithRetry({
    url,
    headers,
    sessionId,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      ...(params ? { params } : {}),
    }),
  });

  const nextSessionId = response.headers.get('mcp-session-id') || sessionId;

  if (response.status === 202) {
    return { result: null, sessionId: nextSessionId };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`MCP request failed (${response.status}): ${text || response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const payload = await response.json();
    const message = Array.isArray(payload)
      ? payload.find((item) => String(item?.id) === String(id)) || payload[0]
      : payload;
    if (message?.error) {
      throw new Error(message.error.message || 'MCP error');
    }
    return { result: message?.result, sessionId: nextSessionId };
  }

  if (contentType.includes('text/event-stream')) {
    const text = await response.text();
    const messages = parseSseMessages(text);
    const message = messages.find((item) => String(item?.id) === String(id)) || messages[0];
    if (message?.error) {
      throw new Error(message.error.message || 'MCP error');
    }
    return { result: message?.result, sessionId: nextSessionId };
  }

  throw new Error(`Unexpected MCP response content type: ${contentType}`);
}

async function mcpNotify({ url, headers, sessionId, method, params }) {
  const response = await mcpFetchWithRetry({
    url,
    headers,
    sessionId,
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      ...(params ? { params } : {}),
    }),
  });
  const nextSessionId = response.headers.get('mcp-session-id') || sessionId;
  if (response.status === 202 || response.status === 204) {
    return { sessionId: nextSessionId };
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`MCP notification failed (${response.status}): ${text || response.statusText}`);
  }
  return { sessionId: nextSessionId };
}

function normalizeToolParameters(input) {
  if (input && typeof input === 'object' && !Array.isArray(input)) return input;
  return {};
}

function buildMcpToolName(serverId, toolName) {
  const safe = String(toolName || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `mcp__${serverId}__${safe}`;
}

function buildMcpTools(servers = []) {
  const tools = [];
  const toolMap = new Map();
  const serversById = new Map();
  servers.forEach((server) => {
    if (server?.enabled === false) return;
    if (!server?.id || !server?.url) return;
    serversById.set(String(server.id), server);
    const toolSpecs = Array.isArray(server.tools) ? server.tools : [];
    toolSpecs.forEach((tool) => {
      const toolName = String(tool?.name || '').trim();
      if (!toolName) return;
      const modelToolName = buildMcpToolName(server.id, toolName);
      toolMap.set(modelToolName, {
        serverId: String(server.id),
        toolName,
        displayName: toolName,
      });
      tools.push({
        type: 'function',
        function: {
          name: modelToolName,
          description: String(tool?.description || tool?.title || '').trim() || undefined,
          parameters: normalizeToolParameters(tool?.parameters),
        },
      });
    });
  });
  return { tools, toolMap, serversById };
}

function buildMcpAuthHeaders(server) {
  const headers = { ...normalizeHeadersInput(server?.headers) };
  const authType = String(server?.auth_type || 'none').toLowerCase();
  if (authType === 'bearer') {
    const token = String(server?.auth_bearer_token || '').trim();
    if (token) headers.Authorization = headers.Authorization || `Bearer ${token}`;
  } else if (authType === 'basic') {
    const user = String(server?.auth_basic_username || '').trim();
    const pass = String(server?.auth_basic_password || '');
    if (user) headers.Authorization = headers.Authorization || `Basic ${btoa(`${user}:${pass}`)}`;
  } else if (authType === 'oauth') {
    const token = String(server?.oauth_tokens?.access_token || '').trim();
    if (token) headers.Authorization = headers.Authorization || `Bearer ${token}`;
  }
  return headers;
}

function parseToolArguments(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    throw new Error('Tool arguments must be valid JSON');
  }
}

async function executeMcpToolCall({ server, toolName, args }) {
  const headers = buildMcpAuthHeaders(server);
  let sessionId;
  const init = await mcpRequest({
    url: server.url,
    headers,
    sessionId,
    id: 0,
    method: 'initialize',
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'GrowChat', version: '1.0.0' },
    },
  });
  sessionId = init.sessionId;

  const notified = await mcpNotify({
    url: server.url,
    headers,
    sessionId,
    method: 'notifications/initialized',
  });
  sessionId = notified.sessionId;

  const result = await mcpRequest({
    url: server.url,
    headers,
    sessionId,
    id: 2,
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args,
    },
  });

  return result?.result;
}

function stringifyToolPayload(payload) {
  if (payload == null) return '';
  if (typeof payload === 'string') return payload;
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

function applyToolCallDelta(target, deltas) {
  if (!Array.isArray(deltas)) return;
  deltas.forEach((delta) => {
    if (!delta) return;
    const index = Number.isFinite(delta.index) ? delta.index : 0;
    if (!target[index]) {
      target[index] = { id: null, name: '', arguments: '' };
    }
    if (delta.id) target[index].id = delta.id;
    if (delta.function?.name) target[index].name += delta.function.name;
    if (delta.function?.arguments) target[index].arguments += delta.function.arguments;
  });
}

function normalizeToolCalls(stepToolCalls, toolMap) {
  const validCalls = [];
  const unknownCalls = [];
  (Array.isArray(stepToolCalls) ? stepToolCalls : [])
    .filter((call) => call && call.name)
    .forEach((call) => {
      const toolCallId = call.id || crypto.randomUUID();
      const name = String(call.name || '').trim();
      const args = call.arguments || '';
      const mapping = toolMap.get(name);
      if (!mapping) {
        unknownCalls.push({ toolCallId, name, arguments: args });
        return;
      }
      validCalls.push({
        toolCallId,
        modelToolName: name,
        serverId: mapping.serverId,
        toolName: mapping.toolName,
        displayName: mapping.displayName || mapping.toolName,
        arguments: args,
      });
    });
  return { validCalls, unknownCalls };
}

function buildUnknownToolPrompt(unknownCalls, toolMap) {
  const names = unknownCalls.map((call) => call.name).filter(Boolean);
  const known = Array.from(toolMap.keys());
  const preview = known.slice(0, 30);
  const suffix = known.length > preview.length ? ` (and ${known.length - preview.length} more)` : '';
  return [
    `The model requested unknown tool name(s): ${names.join(', ') || 'unknown'}.`,
    `Use only these tool names: ${preview.join(', ')}${suffix}.`,
    'If no tool is required, respond directly without tool calls.',
  ].join(' ');
}

async function streamAssistantWithTools({
  req,
  env,
  ctx,
  db,
  user,
  chatId,
  userMsgId,
  parentId,
  model,
  history,
  citations,
}) {
  const assistantMsgId = crypto.randomUUID();
  const servers = await loadToolServers(db);
  const { tools, toolMap, serversById } = buildMcpTools(servers);
  const toolsEnabled = tools.length > 0;

  const encoder = new TextEncoder();
  let fullText = '';
  let fullReasoning = '';
  let reasoningStartedAt = null;
  let deltaSeq = 0;
  const toolCallRecords = [];
  const messageBlocks = [];

  const appendMessageBlock = (type, content = '', toolCallId = null) => {
    if (!type) return;
    const last = messageBlocks.length ? messageBlocks[messageBlocks.length - 1] : null;
    if (type === 'tool') {
      const existing = messageBlocks.find((block) => block.type === 'tool' && block.tool_call_id === toolCallId);
      if (existing) return;
      messageBlocks.push({
        type: 'tool',
        tool_call_id: String(toolCallId || ''),
      });
      return;
    }
    if (last && last.type === type && !last.tool_call_id) {
      last.content = `${last.content || ''}${content}`;
      return;
    }
    messageBlocks.push({ type, content: String(content || '') });
  };

  const readable = new ReadableStream({
    async start(controller) {
      const citationsJson = Array.isArray(citations) ? JSON.stringify(citations) : (citations || null);
      let lastPersistAt = 0;
      let lastPersistSize = 0;

      const ensureAssistantRow = async () => {
        try {
          await db.run(
            `INSERT INTO messages (id, chat_id, role, content, model, citations, parent_id, status, created_at)
             VALUES (?, ?, 'assistant', ?, ?, ?, ?, 'streaming', unixepoch())`,
            [assistantMsgId, chatId, '', model, citationsJson, userMsgId]
          );
        } catch (err) {
          try {
            await db.run(
              'INSERT INTO messages (id, chat_id, role, content, model, citations, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())',
              [assistantMsgId, chatId, 'assistant', '', model, citationsJson, userMsgId]
            );
          } catch { }
        }
        try {
          await db.run(
            'UPDATE chats SET current_message_id = ?, model = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
            [assistantMsgId, model, chatId, user.sub]
          );
        } catch { }
      };

      const buildPersistedContent = () => {
        const reasoningSuffix = fullReasoning.trim();
        return reasoningSuffix
          ? `${fullText ? `${fullText}\n\n` : ''}<thinking>${reasoningSuffix}</thinking>`
          : fullText;
      };

      const persistToolCalls = async () => {
        try {
          const toolCallsJson = toolCallRecords.length ? JSON.stringify(toolCallRecords) : null;
          await db.run('UPDATE messages SET tool_calls = ? WHERE id = ?', [toolCallsJson, assistantMsgId]);
        } catch { }
      };

      const persistAssistantContent = async (force = false) => {
        const now = Date.now();
        const size = fullText.length + fullReasoning.length;
        if (!force && now - lastPersistAt < 1200 && size - lastPersistSize < 200) return;
        lastPersistAt = now;
        lastPersistSize = size;
        const content = buildPersistedContent();
        const blocksJson = messageBlocks.length ? JSON.stringify(messageBlocks) : null;
        try {
          await db.run(
            'UPDATE messages SET content = ?, citations = ?, message_blocks = ? WHERE id = ?',
            [content, citationsJson, blocksJson, assistantMsgId]
          );
        } catch { }
      };

      const sendErrorAndClose = async (errorCode, err) => {
        const errorMessage = normalizeErrorMessage(err, 'LLM request failed');
        const errorDetails = normalizeErrorMessage(err, 'LLM request failed', 8000);
        const assistantError = await persistAssistantErrorMessage(db, {
          messageId: assistantMsgId,
          chatId,
          userId: user.sub,
          model,
          parentId: userMsgId,
          errorCode,
          errorMessage,
          content: errorDetails,
          citations,
          toolCalls: toolCallRecords,
        });
        await publishRealtimeNow(env, createRealtimeEvent({
          type: 'message.completed',
          userId: user.sub,
          chatId,
          messageId: assistantMsgId,
          originSessionId: getOriginSessionId(req),
          data: {
            role: 'assistant',
            model,
            error: true,
            message: assistantError,
            chat: await getOwnedChat(db, chatId, user.sub),
          },
        }));
        controller.enqueue(encoder.encode(sseData({ event: 'start', chat_id: chatId, message_id: assistantMsgId, user_message_id: userMsgId })));
        controller.enqueue(encoder.encode(sseData({ error: errorCode, message: errorMessage })));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      };

      await ensureAssistantRow();
      controller.enqueue(encoder.encode(sseData({ event: 'start', chat_id: chatId, message_id: assistantMsgId, user_message_id: userMsgId })));

      let messagesForModel = [...history];
      let steps = 0;
      let followUps = 0;
      try {
        while (steps <= MAX_TOOL_STEPS) {
          let stepTextOutput = false;
          let stepReasoningOutput = false;
          let stream;
          try {
            stream = await streamLLM(env, model, messagesForModel, {
              tools: toolsEnabled ? tools : undefined,
            });
          } catch (err) {
            await sendErrorAndClose('llm_unavailable', err);
            return;
          }

          const reader = stream.getReader();
          const decoder = new TextDecoder();
          const stepToolCalls = [];
          let finishReason = null;

          let emitEvent = () => { };
          const parser = new SseLineParser({
            onEvent: (event) => emitEvent(event),
          });

          emitEvent = (event) => {
            if (!event) return;
            if (event.type === 'reasoning_start') {
              if (!reasoningStartedAt) reasoningStartedAt = Date.now();
              controller.enqueue(encoder.encode(sseData({ event: 'reasoning_start' })));
              return;
            }
            if (event.type === 'reasoning_delta') {
              const delta = String(event.delta || '');
              if (!delta) return;
              stepReasoningOutput = true;
              appendMessageBlock('thinking', delta);
              fullReasoning += delta;
              persistAssistantContent();
              controller.enqueue(encoder.encode(sseData({ event: 'reasoning_delta', delta })));
              return;
            }
            if (event.type === 'reasoning_end') {
              const duration = reasoningStartedAt ? Date.now() - reasoningStartedAt : 0;
              controller.enqueue(encoder.encode(sseData({ event: 'reasoning_end', duration_ms: duration })));
              persistAssistantContent(true);
              return;
            }
            if (event.type === 'tool_call_delta') {
              applyToolCallDelta(stepToolCalls, event.tool_calls);
              return;
            }
            if (event.type === 'finish_reason') {
              finishReason = event.reason;
            }
          };

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const delta = parser.push(decoder.decode(value, { stream: true }));
            if (delta) {
              fullText += delta;
              stepTextOutput = true;
              appendMessageBlock('text', delta);
              persistAssistantContent();
              controller.enqueue(encoder.encode(sseData({ response: delta })));
              await publishRealtimeNow(env, createRealtimeEvent({
                type: 'message.delta',
                userId: user.sub,
                chatId,
                messageId: assistantMsgId,
                originSessionId: getOriginSessionId(req),
                data: { delta, model, seq: ++deltaSeq },
              }));
            }
          }

          const finalDelta = parser.flush();
          if (finalDelta) {
            fullText += finalDelta;
            stepTextOutput = true;
            appendMessageBlock('text', finalDelta);
            await persistAssistantContent();
            controller.enqueue(encoder.encode(sseData({ response: finalDelta })));
            await publishRealtimeNow(env, createRealtimeEvent({
              type: 'message.delta',
              userId: user.sub,
              chatId,
              messageId: assistantMsgId,
              originSessionId: getOriginSessionId(req),
              data: { delta: finalDelta, model, seq: ++deltaSeq },
            }));
          }
          parser.finalize();
          reader.releaseLock();

          const hasToolCalls = stepToolCalls.some((call) => call && call.name);
          if (hasToolCalls && finishReason === 'tool_calls') {
            if (steps >= MAX_TOOL_STEPS) {
              throw new Error('Too many tool calls in a single request');
            }

            const { validCalls, unknownCalls } = normalizeToolCalls(stepToolCalls, toolMap);
            const toolCallsForModel = validCalls.map((call) => ({
              id: call.toolCallId,
              type: 'function',
              function: {
                name: call.modelToolName,
                arguments: call.arguments,
              },
            }));

            if (shouldUseToolRunner(env)) {
              for (const call of validCalls) {
                const record = {
                  id: call.toolCallId,
                  name: call.displayName,
                  input: call.arguments,
                  output: '',
                  error: null,
                  status: 'running',
                };
                toolCallRecords.push(record);
                appendMessageBlock('tool', '', call.toolCallId);
                await persistToolCalls();
                controller.enqueue(encoder.encode(sseData({
                  event: 'tool_status',
                  message_id: assistantMsgId,
                  tool_call_id: call.toolCallId,
                  tool_name: call.displayName,
                  state: 'running',
                  input: call.arguments,
                })));
              }

              try {
                await db.run('UPDATE messages SET status = ? WHERE id = ?', ['tool_running', assistantMsgId]);
              } catch { }

              await persistAssistantContent(true);
              const queued = await enqueueToolRunner(env, {
                userId: user.sub,
                chatId,
                assistantMsgId,
                userMsgId,
                model,
                history: messagesForModel,
                citations,
                toolCalls: validCalls,
                originSessionId: getOriginSessionId(req),
                fullText,
                fullReasoning,
                step: steps,
              });
              if (queued) {
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                controller.close();
                return;
              }
            }

            const toolResultMessages = [];

            for (const call of unknownCalls) {
              const errorText = `Unknown tool: ${call.name}`;
              const record = {
                id: call.toolCallId,
                name: call.name || 'Unknown tool',
                input: call.arguments,
                output: errorText,
                error: errorText,
                status: 'error',
              };
              toolCallRecords.push(record);
              appendMessageBlock('tool', '', call.toolCallId);
              await persistToolCalls();
              await persistAssistantContent();
              controller.enqueue(encoder.encode(sseData({
                event: 'tool_result',
                message_id: assistantMsgId,
                tool_call_id: call.toolCallId,
                tool_name: record.name,
                input: call.arguments,
                output: errorText,
                error: errorText,
                status: 'error',
              })));
            }

            for (const call of validCalls) {
              controller.enqueue(encoder.encode(sseData({
                event: 'tool_status',
                message_id: assistantMsgId,
                tool_call_id: call.toolCallId,
                tool_name: call.displayName,
                state: 'running',
                input: call.arguments,
              })));

              const server = serversById.get(call.serverId);
              let outputText = '';
              let errorText = '';
              let status = 'completed';
              const record = {
                id: call.toolCallId,
                name: call.displayName,
                input: call.arguments,
                output: '',
                error: null,
                status: 'running',
              };
              toolCallRecords.push(record);
              appendMessageBlock('tool', '', call.toolCallId);
              await persistToolCalls();

              try {
                const args = parseToolArguments(call.arguments);
                const output = await executeMcpToolCall({
                  server,
                  toolName: call.toolName,
                  args,
                });
                outputText = stringifyToolPayload(output);
              } catch (err) {
                status = 'error';
                errorText = normalizeErrorMessage(err, 'Tool call failed', 8000);
                outputText = errorText;
              }

              record.output = outputText;
              record.error = errorText || null;
              record.status = status;
              await persistToolCalls();
              await persistAssistantContent();

              controller.enqueue(encoder.encode(sseData({
                event: 'tool_result',
                message_id: assistantMsgId,
                tool_call_id: call.toolCallId,
                tool_name: call.displayName,
                input: call.arguments,
                output: outputText,
                error: errorText || null,
                status,
              })));

              toolResultMessages.push({
                role: 'tool',
                tool_call_id: call.toolCallId,
                content: outputText,
              });
            }

            if (toolCallsForModel.length) {
              messagesForModel = [
                ...messagesForModel,
                { role: 'assistant', content: '', tool_calls: toolCallsForModel },
                ...toolResultMessages,
              ];
            }
            if (unknownCalls.length) {
              messagesForModel = [
                ...messagesForModel,
                { role: 'system', content: buildUnknownToolPrompt(unknownCalls, toolMap) },
              ];
            }
            steps += 1;
            continue;
          }

          if (!hasToolCalls && !stepTextOutput && stepReasoningOutput) {
            if (followUps < MAX_FOLLOW_UPS) {
              followUps += 1;
              messagesForModel = [
                ...messagesForModel,
                { role: 'system', content: FOLLOW_UP_PROMPT },
              ];
              continue;
            }
          }

          break;
        }

        const reasoningSuffix = fullReasoning.trim();
        let persistedText = reasoningSuffix
          ? `${fullText ? `${fullText}\n\n` : ''}<thinking>${reasoningSuffix}</thinking>`
          : fullText;
        if (!String(persistedText || '').trim()) {
          persistedText = 'I could not produce a final response for this request.';
        }
        const toolCallsJson = toolCallRecords.length ? JSON.stringify(toolCallRecords) : null;
        const blocksJson = messageBlocks.length ? JSON.stringify(messageBlocks) : null;

        try {
          const update = await db.run(
            `UPDATE messages
             SET content = ?, model = ?, citations = ?, parent_id = ?, status = NULL,
                 error_code = NULL, error_message = NULL, tool_calls = ?, message_blocks = ?
             WHERE id = ?`,
            [persistedText, model, citationsJson, userMsgId, toolCallsJson, blocksJson, assistantMsgId]
          );
          if (!update?.meta?.changes) {
            await db.run(
              'INSERT INTO messages (id, chat_id, role, content, model, citations, parent_id, tool_calls, message_blocks, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())',
              [assistantMsgId, chatId, 'assistant', persistedText, model, citationsJson, userMsgId, toolCallsJson, blocksJson]
            );
          }
        } catch (err) {
          await db.run(
            'INSERT INTO messages (id, chat_id, role, content, model, citations, parent_id, tool_calls, message_blocks, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())',
            [assistantMsgId, chatId, 'assistant', persistedText, model, citationsJson, userMsgId, toolCallsJson, blocksJson]
          );
        }
        await db.run(
          'UPDATE chats SET current_message_id = ?, model = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?',
          [assistantMsgId, model, chatId, user.sub]
        );

        const completedAssistantMessage = await getMessageSnapshot(db, assistantMsgId);
        const updatedChatAfterAssistantMessage = await getOwnedChat(db, chatId, user.sub);
        await publishRealtimeNow(env, createRealtimeEvent({
          type: 'message.completed',
          userId: user.sub,
          chatId,
          messageId: assistantMsgId,
          originSessionId: getOriginSessionId(req),
          data: {
            role: 'assistant',
            model,
            citations,
            message: completedAssistantMessage,
            chat: updatedChatAfterAssistantMessage,
          },
        }));

        await db.run('UPDATE chats SET model = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?', [model, chatId, user.sub]);
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (err) {
        await sendErrorAndClose('stream_failed', err);
      }
    },
  });

  return { response: new Response(readable, { headers: sseHeaders(req) }), assistantMsgId };
}

export async function chatRouter(req, env, ctx, user, path) {
  const isChatPath = path === '/api/chats' || path === '/api/chats/shared' || path === '/api/chats/archived' || /^\/api\/chats\/[^/]+(?:\/messages(?:\/[^/]+(?:\/(?:branch|regenerate))?)?|\/(?:share|archive|pin|clone))?$/.test(path);
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

    return json(req, { chats: items, limit, offset, query: qRaw, has_more });
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

      return json(req, { chat, messages: withAttachments });
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
      'SELECT id, role, content, model, citations, parent_id, created_at FROM messages WHERE chat_id = ? ORDER BY created_at ASC',
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

    let attachmentParts = [];
    const rawAttachmentIds = Array.isArray(body.attachments) ? body.attachments : [];
    if (rawAttachmentIds.length > MAX_ATTACHMENTS) {
      return error(req, `Too many attachments (max ${MAX_ATTACHMENTS})`, 400);
    }
    const attachmentIds = normalizeAttachmentIds(rawAttachmentIds);
    let attachmentDocs = [];
    if (attachmentIds.length > 0) {
      const providerInfo = await resolveProviderForModel(env, model);
      if (providerInfo?.error) {
        return error(req, providerInfo.error, 400);
      }
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
        return !SUPPORTED_ATTACHMENT_TYPES.has(type);
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
      'SELECT role, content FROM messages WHERE chat_id = ? ORDER BY created_at ASC LIMIT 30',
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

    let enhancedHistory = [...history];
    if (ragContext) {
      enhancedHistory = [
        {
          role: 'system',
          content: `You are a helpful assistant. Use the following context to answer the user's question:\n${ragContext}`,
        },
        ...history,
      ];
    }

    if (attachmentParts.length > 0) {
      const lastIdx = enhancedHistory.length - 1;
      if (lastIdx >= 0 && enhancedHistory[lastIdx]?.role === 'user') {
        enhancedHistory[lastIdx] = {
          role: 'user',
          content: [
            { type: 'text', text: content },
            ...attachmentParts,
          ],
        };
      }
    }

    const { response } = await streamAssistantWithTools({
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
          SELECT id, parent_id, role, content, created_at
          FROM messages
          WHERE id = ? AND chat_id = ?

          UNION ALL

          SELECT m.id, m.parent_id, m.role, m.content, m.created_at
          FROM messages m
          JOIN lineage l ON m.id = l.parent_id
          WHERE m.chat_id = ?
        )
        SELECT role, content FROM (
          SELECT role, content, created_at
          FROM lineage
          ORDER BY created_at DESC
          LIMIT 30
        )
        ORDER BY created_at ASC`,
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

    await publishRealtimeNow(env, createRealtimeEvent({
      type: 'message.created',
      userId: user.sub,
      chatId,
      messageId: newUserMsgId,
      originSessionId,
      data: { role: 'user', model, message: createdBranchUserMessage, chat: updatedBranchChat },
    }));

    const history = await getBranchHistory(newUserMsgId);
    const { response } = await streamAssistantWithTools({
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

    const history = await db.all(
      'SELECT role, content FROM messages WHERE chat_id = ? AND created_at <= (SELECT created_at FROM messages WHERE id = ?) ORDER BY created_at ASC LIMIT 30',
      [chatId, sourceMsg.parent_id || msgId]
    );

    const { response } = await streamAssistantWithTools({
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
    });

    return response;
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
      'SELECT id FROM messages WHERE chat_id = ? ORDER BY created_at DESC LIMIT 1',
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

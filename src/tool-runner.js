import { streamLLM, SseLineParser } from './llm.js';
import { createDB } from './db.js';
import { getConfigValue } from './utils/app-config.js';
import { createRealtimeEvent, publishRealtimeEvent } from './realtime.js';

const MCP_PROTOCOL_VERSION = '2025-11-25';
const MCP_RETRY_STATUSES = new Set([429, 500, 503, 504]);
const MCP_MAX_RETRIES = 3;
const MAX_TOOL_STEPS = 6;
const MAX_FOLLOW_UPS = 2;
const FOLLOW_UP_PROMPT = 'Provide a complete final answer to the user. Do not return tool calls or reasoning-only output.';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeErrorMessage(err, fallback = 'LLM request failed', maxLen = 500) {
  const raw = String(err?.message || err || fallback || '').trim();
  if (!raw) return fallback;
  return Number.isFinite(maxLen) && maxLen > 0 ? raw.slice(0, maxLen) : raw;
}

function buildMcpHeaders(headers = {}, sessionId) {
  return {
    'content-type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'mcp-protocol-version': MCP_PROTOCOL_VERSION,
    ...(headers || {}),
    ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
  };
}

function normalizeHeadersInput(input) {
  if (!input) return {};
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return input && typeof input === 'object' ? input : {};
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

function normalizeToolCallRecord(raw) {
  if (!raw) return null;
  const id = raw.id || raw.tool_call_id || raw.toolCallId;
  if (!id) return null;
  const name = String(raw.name || raw.tool_name || raw.toolName || 'Tool').trim() || 'Tool';
  const input = raw.input ?? raw.arguments ?? raw.args ?? '';
  const output = raw.output ?? raw.result ?? '';
  const error = raw.error ?? null;
  const status = raw.status || raw.state || (error ? 'error' : (output ? 'completed' : 'running'));
  return {
    id: String(id),
    name,
    input: input == null ? '' : String(input),
    output: output == null ? '' : String(output),
    error: error == null ? null : String(error),
    status: String(status),
  };
}

function normalizeToolCalls(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeMessageBlocks(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeMessageBlockRecord(raw, index = 0) {
  if (!raw) return null;
  const type = String(raw.type || '').trim();
  if (!type) return null;
  const content = raw.content == null ? '' : String(raw.content);
  const toolCallId = raw.tool_call_id || raw.toolCallId || raw.tool_callId || null;
  return {
    id: String(raw.id || `${type}-${index + 1}`),
    type,
    content,
    tool_call_id: toolCallId ? String(toolCallId) : null,
  };
}

function upsertToolCallRecord(list, record) {
  if (!record) return;
  const idx = list.findIndex((item) => String(item.id) === String(record.id));
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...record };
  } else {
    list.push(record);
  }
}

function normalizeToolCallsForModel(stepToolCalls, toolMap) {
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

function buildToolName(serverId, toolName) {
  return `mcp__${serverId}__${toolName}`.replace(/[^a-zA-Z0-9_]/g, '_');
}

function buildMcpTools(servers = []) {
  const tools = [];
  const toolMap = new Map();
  const serversById = new Map();

  servers.forEach((server) => {
    if (!server?.id || !Array.isArray(server?.tools)) return;
    if (server.enabled === false) return;
    serversById.set(server.id, server);
    server.tools.forEach((tool) => {
      if (!tool?.name) return;
      const modelToolName = buildToolName(server.id, tool.name);
      tools.push({
        type: 'function',
        function: {
          name: modelToolName,
          description: tool.description || '',
          parameters: tool.parameters || {},
        },
      });
      toolMap.set(modelToolName, {
        serverId: server.id,
        toolName: tool.name,
        displayName: tool.display_name || tool.name,
      });
    });
  });

  return { tools, toolMap, serversById };
}

async function loadToolServers(db) {
  const raw = await getConfigValue(db, 'tool_servers', '[]');
  try {
    const servers = JSON.parse(raw);
    return Array.isArray(servers) ? servers : [];
  } catch {
    return [];
  }
}

export async function runToolJob(env, payload) {
  if (!payload?.assistantMsgId || !payload?.chatId || !payload?.userId) {
    return { ok: false, error: 'missing_fields' };
  }

  const {
    userId,
    chatId,
    assistantMsgId,
    userMsgId,
    model,
    citations = [],
    history = [],
    toolCalls = [],
    originSessionId = '',
    fullText: initialText = '',
    fullReasoning: initialReasoning = '',
    step = 1,
  } = payload;

  const db = createDB(env.DB);
  const servers = await loadToolServers(db);
  const { tools, toolMap, serversById } = buildMcpTools(servers);
  let messagesForModel = Array.isArray(history) ? [...history] : [];
  let steps = Number(step || 1);
  let followUps = 0;
  let fullText = String(initialText || '');
  let fullReasoning = String(initialReasoning || '');
  let lastPersistAt = 0;
  let lastPersistSize = 0;
  const messageBlocks = [];

  const citationsJson = Array.isArray(citations) ? JSON.stringify(citations) : (citations || null);

  const appendMessageBlock = (type, content = '', toolCallId = null) => {
    if (!type) return;
    const last = messageBlocks.length ? messageBlocks[messageBlocks.length - 1] : null;
    if (type === 'tool') {
      const existing = messageBlocks.find((block) => block.type === 'tool' && block.tool_call_id === toolCallId);
      if (existing) return;
      messageBlocks.push({
        id: `tool-${messageBlocks.length + 1}`,
        type: 'tool',
        tool_call_id: String(toolCallId || ''),
      });
      return;
    }
    if (last && last.type === type && !last.tool_call_id) {
      last.content = `${last.content || ''}${content}`;
      return;
    }
    messageBlocks.push({
      id: `${type}-${messageBlocks.length + 1}`,
      type,
      content: String(content || ''),
    });
  };

  const existingMessage = await db.first(
    'SELECT status, tool_calls, message_blocks FROM messages WHERE id = ?',
    [assistantMsgId]
  );
  if (existingMessage?.status && !['streaming', 'tool_running'].includes(existingMessage.status)) {
    return { ok: true, skipped: true };
  }

  const toolCallRecords = normalizeToolCalls(existingMessage?.tool_calls)
    .map(normalizeToolCallRecord)
    .filter(Boolean);
  normalizeMessageBlocks(existingMessage?.message_blocks)
    .map(normalizeMessageBlockRecord)
    .filter(Boolean)
    .forEach((block) => messageBlocks.push(block));

  const publishToolEvent = async (type, record) => {
    await publishRealtimeEvent(env, createRealtimeEvent({
      type,
      userId,
      chatId,
      messageId: assistantMsgId,
      originSessionId,
      data: record,
    }));
  };

  const persistToolCalls = async () => {
    try {
      const toolCallsJson = toolCallRecords.length ? JSON.stringify(toolCallRecords) : null;
      await db.run('UPDATE messages SET tool_calls = ? WHERE id = ?', [toolCallsJson, assistantMsgId]);
    } catch {}
  };

  const buildPersistedContent = () => {
    const reasoningSuffix = fullReasoning.trim();
    return reasoningSuffix
      ? `${fullText ? `${fullText}\n\n` : ''}<thinking>${reasoningSuffix}</thinking>`
      : fullText;
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
    } catch {}
  };

  for (const call of toolCalls) {
    const record = {
      id: call.toolCallId,
      name: call.displayName || call.toolName,
      input: call.arguments || '',
      output: '',
      error: null,
      status: 'running',
    };
    upsertToolCallRecord(toolCallRecords, record);
    appendMessageBlock('tool', '', call.toolCallId);
  }

  if (toolCallRecords.length) {
    await persistToolCalls();
    for (const record of toolCallRecords) {
      await publishToolEvent('tool.status', {
        tool_call_id: record.id,
        tool_name: record.name,
        status: record.status,
        input: record.input,
        output: record.output,
        error: record.error,
      });
    }
  }

  if (toolCalls.length) {
    const toolResultMessages = [];
    for (const call of toolCalls) {
      const server = serversById.get(call.serverId);
      let outputText = '';
      let errorText = '';
      let status = 'completed';
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

      const record = normalizeToolCallRecord({
        id: call.toolCallId,
        name: call.displayName || call.toolName,
        input: call.arguments,
        output: outputText,
        error: errorText || null,
        status,
      });
      upsertToolCallRecord(toolCallRecords, record);
      await persistToolCalls();
      await publishToolEvent('tool.result', {
        tool_call_id: call.toolCallId,
        tool_name: call.displayName || call.toolName,
        status,
        input: call.arguments,
        output: outputText,
        error: errorText || null,
      });

      toolResultMessages.push({
        role: 'tool',
        tool_call_id: call.toolCallId,
        content: outputText,
      });
    }

    const toolCallsForModel = toolCalls.map((call) => ({
      id: call.toolCallId,
      type: 'function',
      function: {
        name: call.modelToolName,
        arguments: call.arguments,
      },
    }));

    messagesForModel = [
      ...messagesForModel,
      { role: 'assistant', content: '', tool_calls: toolCallsForModel },
      ...toolResultMessages,
    ];
    steps += 1;
  }

  try {
    while (steps <= MAX_TOOL_STEPS) {
      let stepTextOutput = false;
      let stepReasoningOutput = false;
      const stream = await streamLLM(env, model, messagesForModel, {
        tools: tools.length ? tools : undefined,
      });

      const reader = stream.getReader();
      const decoder = new TextDecoder();
      const stepToolCalls = [];
      let finishReason = null;
      let reasoningStartedAt = null;

      let emitEvent = () => {};
      const parser = new SseLineParser({
        onEvent: (event) => emitEvent(event),
      });

      emitEvent = (event) => {
        if (!event) return;
        if (event.type === 'reasoning_start') {
          if (!reasoningStartedAt) reasoningStartedAt = Date.now();
          return;
        }
        if (event.type === 'reasoning_delta') {
          const delta = String(event.delta || '');
          if (!delta) return;
          stepReasoningOutput = true;
          appendMessageBlock('thinking', delta);
          fullReasoning += delta;
          persistAssistantContent();
          return;
        }
        if (event.type === 'reasoning_end') {
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
          await publishRealtimeEvent(env, createRealtimeEvent({
            type: 'message.delta',
            userId,
            chatId,
            messageId: assistantMsgId,
            originSessionId,
            data: { delta, model, seq: Date.now() },
          }));
        }
      }
      const finalDelta = parser.flush();
      if (finalDelta) {
        fullText += finalDelta;
        stepTextOutput = true;
        appendMessageBlock('text', finalDelta);
        await persistAssistantContent();
        await publishRealtimeEvent(env, createRealtimeEvent({
          type: 'message.delta',
          userId,
          chatId,
          messageId: assistantMsgId,
          originSessionId,
          data: { delta: finalDelta, model, seq: Date.now() },
        }));
      }
      parser.finalize();
      reader.releaseLock();

      const hasToolCalls = stepToolCalls.some((call) => call && call.name);
        if (hasToolCalls && finishReason === 'tool_calls') {
          if (steps >= MAX_TOOL_STEPS) break;
        const { validCalls, unknownCalls } = normalizeToolCallsForModel(stepToolCalls, toolMap);
        const toolResultMessages = [];

        for (const call of unknownCalls) {
          const errorText = `Unknown tool: ${call.name}`;
          const record = normalizeToolCallRecord({
            id: call.toolCallId,
            name: call.name || 'Unknown tool',
            input: call.arguments,
            output: errorText,
            error: errorText,
            status: 'error',
          });
          upsertToolCallRecord(toolCallRecords, record);
          appendMessageBlock('tool', '', call.toolCallId);
          await persistToolCalls();
          await publishToolEvent('tool.result', {
            tool_call_id: call.toolCallId,
            tool_name: record.name,
            status: record.status,
            input: record.input,
            output: record.output,
            error: record.error,
          });
        }

        for (const call of validCalls) {
          const record = normalizeToolCallRecord({
            id: call.toolCallId,
            name: call.displayName,
            input: call.arguments,
            output: '',
            error: null,
            status: 'running',
          });
          upsertToolCallRecord(toolCallRecords, record);
          appendMessageBlock('tool', '', call.toolCallId);
          await persistToolCalls();
          await publishToolEvent('tool.status', {
            tool_call_id: record.id,
            tool_name: record.name,
            status: record.status,
            input: record.input,
            output: record.output,
            error: record.error,
          });

          const server = serversById.get(call.serverId);
          let outputText = '';
          let errorText = '';
          let status = 'completed';
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
          const updated = normalizeToolCallRecord({
            id: call.toolCallId,
            name: call.displayName,
            input: call.arguments,
            output: outputText,
            error: errorText || null,
            status,
          });
          upsertToolCallRecord(toolCallRecords, updated);
          await persistToolCalls();
          await publishToolEvent('tool.result', {
            tool_call_id: call.toolCallId,
            tool_name: call.displayName,
            status,
            input: call.arguments,
            output: outputText,
            error: errorText || null,
          });
          toolResultMessages.push({
            role: 'tool',
            tool_call_id: call.toolCallId,
            content: outputText,
          });
        }

        const toolCallsForModel = validCalls.map((call) => ({
          id: call.toolCallId,
          type: 'function',
          function: { name: call.modelToolName, arguments: call.arguments },
        }));

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

    let finalContent = buildPersistedContent();
    if (!String(finalContent || '').trim()) {
      finalContent = 'I could not produce a final response for this request.';
    }
    const blocksJson = messageBlocks.length ? JSON.stringify(messageBlocks) : null;
    await db.run(
      `UPDATE messages
       SET content = ?, model = ?, citations = ?, parent_id = ?, status = NULL,
           error_code = NULL, error_message = NULL, tool_calls = ?, message_blocks = ?
       WHERE id = ?`,
      [finalContent, model, citationsJson, userMsgId, toolCallRecords.length ? JSON.stringify(toolCallRecords) : null, blocksJson, assistantMsgId]
    );
    await db.run('UPDATE chats SET current_message_id = ?, model = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?', [assistantMsgId, model, chatId, userId]);

    const message = await db.first(
      'SELECT id, role, content, model, citations, parent_id, status, error_code, error_message, tool_calls, message_blocks, created_at FROM messages WHERE id = ?',
      [assistantMsgId]
    );

    await publishRealtimeEvent(env, createRealtimeEvent({
      type: 'message.completed',
      userId,
      chatId,
      messageId: assistantMsgId,
      originSessionId,
      data: { role: 'assistant', model, citations, message },
    }));
  } catch (err) {
    const errorMessage = normalizeErrorMessage(err, 'Tool runner failed', 8000);
    await db.run(
      `UPDATE messages
       SET status = 'error', error_code = 'tool_runner', error_message = ?, content = ?
       WHERE id = ?`,
      [errorMessage.slice(0, 500), errorMessage, assistantMsgId]
    );
    await publishRealtimeEvent(env, createRealtimeEvent({
      type: 'message.completed',
      userId,
      chatId,
      messageId: assistantMsgId,
      originSessionId,
      data: { role: 'assistant', model, error: true, message: { id: assistantMsgId, content: errorMessage } },
    }));
  }

  return { ok: true };
}

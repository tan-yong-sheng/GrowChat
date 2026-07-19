const MCP_PROTOCOL_VERSION = '2025-11-25';
const SSE_DATA_PREFIX = 'data:';
const SSE_DATA_PREFIX_LENGTH = SSE_DATA_PREFIX.length;
const HTTP_STATUS_TOO_MANY_REQUESTS = 429;
const HTTP_STATUS_INTERNAL_SERVER_ERROR = 500;
const HTTP_STATUS_SERVICE_UNAVAILABLE = 503;
const HTTP_STATUS_GATEWAY_TIMEOUT = 504;
const HTTP_STATUS_ACCEPTED = 202;
const HTTP_STATUS_NO_CONTENT = 204;
const MCP_RETRY_STATUSES = new Set([
  HTTP_STATUS_TOO_MANY_REQUESTS,
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
  HTTP_STATUS_SERVICE_UNAVAILABLE,
  HTTP_STATUS_GATEWAY_TIMEOUT,
]);
const MCP_MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;
const RETRY_JITTER_MAX_MS = 250;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export { MCP_PROTOCOL_VERSION };

export function buildMcpHeaders(base, sessionId) {
  const headers = {
    ...base,
    'mcp-protocol-version': MCP_PROTOCOL_VERSION,
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;
  return headers;
}

export function parseSseMessages(body) {
  const blocks = String(body || '').split('\n\n');
  const messages = [];
  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    let data = '';
    for (const line of lines) {
      if (line.startsWith(SSE_DATA_PREFIX)) {
        data += line.slice(SSE_DATA_PREFIX_LENGTH).trim();
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

export async function mcpFetchWithRetry({ url, headers, sessionId, body }) {
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
    const baseDelay =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
    const jitter = Math.floor(Math.random() * RETRY_JITTER_MAX_MS);
    await sleep(baseDelay + jitter);
  }
}

async function handleMcpErrorResponse(response) {
  const text = await response.text().catch(() => '');
  throw new Error(`MCP request failed (${response.status}): ${text || response.statusText}`);
}

function extractMessageById(payload, id) {
  return Array.isArray(payload)
    ? payload.find((item) => String(item?.id) === String(id)) || payload[0]
    : payload;
}

function throwIfMessageError(message) {
  if (message?.error) {
    throw new Error(message.error.message || 'MCP error');
  }
}

async function handleJsonMcpResponse(response, id, nextSessionId) {
  const payload = await response.json();
  const message = extractMessageById(payload, id);
  throwIfMessageError(message);
  return { result: message?.result, sessionId: nextSessionId };
}

async function handleSseMcpResponse(response, id, nextSessionId) {
  const text = await response.text();
  const messages = parseSseMessages(text);
  const message = extractMessageById(messages, id);
  throwIfMessageError(message);
  return { result: message?.result, sessionId: nextSessionId };
}

function handleMcpResponseByContentType(response, id, nextSessionId) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return handleJsonMcpResponse(response, id, nextSessionId);
  }
  if (contentType.includes('text/event-stream')) {
    return handleSseMcpResponse(response, id, nextSessionId);
  }
  throw new Error(`Unexpected MCP response content type: ${contentType}`);
}

function handleMcpResponse(response, id, nextSessionId) {
  if (response.status === HTTP_STATUS_ACCEPTED) {
    return { result: null, sessionId: nextSessionId };
  }
  if (!response.ok) {
    return handleMcpErrorResponse(response);
  }
  return handleMcpResponseByContentType(response, id, nextSessionId);
}

export async function mcpRequest({ url, headers, sessionId, id, method, params }) {
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
  return handleMcpResponse(response, id, nextSessionId);
}

export async function mcpNotify({ url, headers, sessionId, method, params }) {
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
  if (response.status === HTTP_STATUS_ACCEPTED || response.status === HTTP_STATUS_NO_CONTENT) {
    return { sessionId: nextSessionId };
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`MCP notification failed (${response.status}): ${text || response.statusText}`);
  }
  return { sessionId: nextSessionId };
}

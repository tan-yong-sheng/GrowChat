const MCP_PROTOCOL_VERSION = '2025-11-25';
const MCP_RETRY_STATUSES = new Set([429, 500, 503, 504]);
const MCP_MAX_RETRIES = 3;
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
        : 500 * Math.pow(2, attempt - 1);
    const jitter = Math.floor(Math.random() * 250);
    await sleep(baseDelay + jitter);
  }
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
  if (response.status === 202 || response.status === 204) {
    return { sessionId: nextSessionId };
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`MCP notification failed (${response.status}): ${text || response.statusText}`);
  }
  return { sessionId: nextSessionId };
}

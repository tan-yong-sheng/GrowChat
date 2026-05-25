export function splitThinkingSegments(raw) {
  const source = String(raw || '');
  if (!source) return [];
  const segments = [];
  const tagNames = ['thinking', 'thoughts', 'think', 'reasoning', 'reason'];
  let cursor = 0;
  const lower = source.toLowerCase();
  while (cursor < source.length) {
    let nextTag = null;
    for (const tag of tagNames) {
      const openToken = `<${tag}`;
      const idx = lower.indexOf(openToken, cursor);
      if (idx !== -1 && (nextTag === null || idx < nextTag.index)) {
        nextTag = { tag, index: idx };
      }
    }
    if (!nextTag) {
      const text = source.slice(cursor);
      if (text.trim()) segments.push({ type: 'text', text });
      break;
    }
    if (nextTag.index > cursor) {
      const text = source.slice(cursor, nextTag.index);
      if (text.trim()) segments.push({ type: 'text', text });
    }
    const openEnd = source.indexOf('>', nextTag.index);
    if (openEnd === -1) break;
    const closeToken = `</${nextTag.tag}>`;
    const closeIdx = lower.indexOf(closeToken, openEnd + 1);
    if (closeIdx === -1) {
      const remainder = source.slice(openEnd + 1);
      if (remainder.trim()) segments.push({ type: 'thinking', text: remainder });
      break;
    }
    const inner = source.slice(openEnd + 1, closeIdx);
    if (inner.trim()) segments.push({ type: 'thinking', text: inner });
    cursor = closeIdx + closeToken.length;
  }
  return segments;
}

export function buildMessageBlocks(messageId, content, getBlocks) {
  const blocks = typeof getBlocks === 'function' ? getBlocks(messageId) : [];
  if (blocks.length) return blocks;
  const segments = splitThinkingSegments(content);
  if (!segments.length) {
    blocks.push({ id: 'text-1', type: 'text', content: String(content || '') });
    return blocks;
  }
  let textCount = 0;
  let thinkingCount = 0;
  segments.forEach((segment) => {
    if (segment.type === 'thinking') {
      thinkingCount += 1;
      blocks.push({ id: `thinking-${thinkingCount}`, type: 'thinking', content: segment.text });
    } else {
      textCount += 1;
      blocks.push({ id: `text-${textCount}`, type: 'text', content: segment.text });
    }
  });
  return blocks;
}

export function formatModelDisplayName(modelId) {
  const raw = String(modelId || '').trim();
  if (!raw) return 'Assistant';
  const idx = raw.indexOf(':');
  if (idx > 0) return raw.slice(idx + 1);
  return raw;
}

export function formatApiErrorMessage(payload, fallback) {
  let message = fallback || 'Request failed.';
  if (payload?.details?.message) {
    message = payload.details.message;
  } else if (payload?.error) {
    message = payload.error;
  } else if (payload?.message) {
    message = payload.message;
  }
  if (payload?.details?.unsupported_types?.length) {
    const list = payload.details.unsupported_types.join(', ');
    message = `Selected model does not support ${list} attachment${payload.details.unsupported_types.length > 1 ? 's' : ''}.`;
  }
  return message;
}

export function extractThinkingBlocks(raw) {
  const source = String(raw || '');
  let text = source;
  const collected = [];
  const tagNames = ['thinking', 'thoughts', 'think', 'reasoning', 'reason'];

  for (const tag of tagNames) {
    const openToken = `<${tag}`;
    const closeToken = `</${tag}>`;
    while (true) {
      const lower = text.toLowerCase();
      const openIdx = lower.indexOf(openToken);
      if (openIdx === -1) break;
      const openEnd = text.indexOf('>', openIdx);
      if (openEnd === -1) break;
      const closeIdx = lower.indexOf(closeToken, openEnd + 1);
      if (closeIdx === -1) {
        const remainder = text.slice(openEnd + 1);
        if (remainder.trim()) collected.push(remainder);
        text = text.slice(0, openIdx);
        break;
      }
      const inner = text.slice(openEnd + 1, closeIdx);
      if (inner.trim()) collected.push(inner);
      text = text.slice(0, openIdx) + text.slice(closeIdx + closeToken.length);
    }
  }

  return {
    cleaned: text.trim(),
    thinking: collected
      .map((part) => part.trim())
      .filter(Boolean)
      .join('\n\n'),
    hasTag: /<thinking\b|<thoughts?\b/i.test(source) || collected.length > 0,
  };
}

export function formatThoughtDuration(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return 'Thought';
  if (value < 1000) return 'Thought for less than a second';
  const seconds = Math.round(value / 1000);
  if (seconds <= 1) return 'Thought for 1 second';
  return `Thought for ${seconds} seconds`;
}

function normalizeJsonArray(raw) {
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

export function normalizeToolCalls(raw) {
  return normalizeJsonArray(raw);
}

export function normalizeMessageBlocks(raw) {
  return normalizeJsonArray(raw);
}

export function normalizeMessageBlockRecord(raw, index = 0) {
  if (!raw) return null;
  const type = String(raw.type || '').trim();
  if (!type) return null;
  const content = raw.content == null ? '' : String(raw.content);
  const toolCallId = raw.tool_call_id || raw.toolCallId || raw.tool_callId || null;
  return {
    id: String(raw.id || `${type}-${index + 1}`),
    type,
    content,
    toolCallId: toolCallId ? String(toolCallId) : null,
  };
}

export function normalizeToolCallRecord(raw) {
  if (!raw) return null;
  const id = raw.id || raw.tool_call_id || raw.toolCallId;
  if (!id) return null;
  const name = String(raw.name || raw.tool_name || raw.toolName || 'Tool').trim() || 'Tool';
  const input = raw.input ?? raw.arguments ?? raw.args ?? '';
  const output = raw.output ?? raw.result ?? '';
  const error = raw.error ?? null;
  const status = raw.status || raw.state || (error ? 'error' : output ? 'completed' : 'running');
  return {
    id: String(id),
    name,
    input: input == null ? '' : String(input),
    output: output == null ? '' : String(output),
    error: error == null ? null : String(error),
    status: String(status),
  };
}

export function buildToolToggleKey(messageId, toolCallId) {
  return `${messageId}:${toolCallId}`;
}

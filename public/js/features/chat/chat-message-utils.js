const THINKING_TAG_NAMES = ['thinking', 'thoughts', 'think', 'reasoning', 'reason'];

function findNextThinkingTag(source, lower, cursor) {
  let nextTag = null;
  for (const tag of THINKING_TAG_NAMES) {
    const openToken = `<${tag}`;
    const idx = lower.indexOf(openToken, cursor);
    if (idx !== -1 && (nextTag === null || idx < nextTag.index)) {
      nextTag = { tag, index: idx };
    }
  }
  return nextTag;
}

function pushTextSegment(segments, text) {
  if (text.trim()) segments.push({ type: 'text', text });
}

function pushThinkingSegment(segments, text) {
  if (text.trim()) segments.push({ type: 'thinking', text });
}

function parseNextThinkingSegment(source, lower, nextTag) {
  const openEnd = source.indexOf('>', nextTag.index);
  if (openEnd === -1) return { remainder: source.slice(nextTag.index) };
  const closeToken = `</${nextTag.tag}>`;
  const closeIdx = lower.indexOf(closeToken, openEnd + 1);
  if (closeIdx === -1) {
    return { remainder: source.slice(openEnd + 1) };
  }
  return {
    inner: source.slice(openEnd + 1, closeIdx),
    cursor: closeIdx + closeToken.length,
  };
}

export function splitThinkingSegments(raw) {
  const source = String(raw || '');
  if (!source) return [];
  const segments = [];
  let cursor = 0;
  const lower = source.toLowerCase();
  while (cursor < source.length) {
    const nextTag = findNextThinkingTag(source, lower, cursor);
    if (!nextTag) {
      pushTextSegment(segments, source.slice(cursor));
      break;
    }
    if (nextTag.index > cursor) {
      pushTextSegment(segments, source.slice(cursor, nextTag.index));
    }
    const parsed = parseNextThinkingSegment(source, lower, nextTag);
    if (parsed.remainder !== undefined) {
      pushThinkingSegment(segments, parsed.remainder);
      break;
    }
    pushThinkingSegment(segments, parsed.inner);
    cursor = parsed.cursor;
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

function findTagOpen(text, openToken) {
  const lower = text.toLowerCase();
  const openIdx = lower.indexOf(openToken);
  if (openIdx === -1) return null;
  const openEnd = text.indexOf('>', openIdx);
  if (openEnd === -1) return null;
  return { openIdx, openEnd };
}

function extractTagContents(text, openIdx, openEnd, closeToken) {
  const lower = text.toLowerCase();
  const closeIdx = lower.indexOf(closeToken, openEnd + 1);
  const content = closeIdx === -1 ? text.slice(openEnd + 1) : text.slice(openEnd + 1, closeIdx);
  const nextText =
    closeIdx === -1
      ? text.slice(0, openIdx)
      : text.slice(0, openIdx) + text.slice(closeIdx + closeToken.length);
  return { content, text: nextText };
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
      const match = findTagOpen(text, openToken);
      if (!match) break;
      const { content, text: nextText } = extractTagContents(
        text,
        match.openIdx,
        match.openEnd,
        closeToken
      );
      if (content.trim()) collected.push(content);
      text = nextText;
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

function resolveToolCallId(raw) {
  return raw.id || raw.tool_call_id || raw.toolCallId;
}

function pickToolCallName(raw) {
  return raw.name || raw.tool_name || raw.toolName || null;
}

function normalizeToolName(name) {
  return String(name || 'Tool').trim() || 'Tool';
}

function resolveToolCallInput(raw) {
  if (raw.input != null) return raw.input;
  if (raw.arguments != null) return raw.arguments;
  return raw.args ?? '';
}

function resolveToolCallOutput(raw) {
  return raw.output ?? raw.result ?? '';
}

function resolveToolCallStatus(raw, error, output) {
  if (raw.status || raw.state) return raw.status || raw.state;
  if (error) return 'error';
  return output ? 'completed' : 'running';
}

function normalizeToolCallValue(value) {
  return value == null ? '' : String(value);
}

export function normalizeToolCallRecord(raw) {
  if (!raw) return null;
  const id = resolveToolCallId(raw);
  if (!id) return null;
  const name = normalizeToolName(pickToolCallName(raw));
  const input = resolveToolCallInput(raw);
  const output = resolveToolCallOutput(raw);
  const error = raw.error ?? null;
  const status = resolveToolCallStatus(raw, error, output);
  return {
    id: String(id),
    name,
    input: normalizeToolCallValue(input),
    output: normalizeToolCallValue(output),
    error: error == null ? null : String(error),
    status: String(status),
  };
}

export function buildToolToggleKey(messageId, toolCallId) {
  return `${messageId}:${toolCallId}`;
}

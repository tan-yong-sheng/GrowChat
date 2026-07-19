export function emitToolCalls(parser, toolCalls = []) {
  if (!Array.isArray(toolCalls) || !toolCalls.length) return;
  parser._hasToolCalls = true;
  parser._emit({ type: 'tool_call_delta', tool_calls: toolCalls });
}

function classifyFinishReason(value) {
  if (value.includes('tool')) return 'tool_calls';
  if (value === 'stop_sequence' || value === 'end_turn') return 'stop';
  if (value === 'max_tokens' || value === 'length') return 'length';
  if (value === 'stop') return 'stop';
  return value;
}

export function normalizeFinishReason(parser, raw) {
  const value = String(raw || '')
    .trim()
    .toLowerCase();
  if (!value) return null;
  if (parser._hasToolCalls) return 'tool_calls';
  return classifyFinishReason(value);
}

function getDelta(parsed) {
  return parsed?.choices?.[0]?.delta || {};
}

function getResponseOrDeltaContent(parsed, delta) {
  return parsed?.response ?? delta.content;
}

function getMessageContent(parsed) {
  return parsed?.choices?.[0]?.message?.content;
}

function getChoiceText(parsed) {
  return parsed?.choices?.[0]?.text;
}

function hasTextField(value) {
  return (
    typeof value === 'object' &&
    !Array.isArray(value) &&
    value !== null &&
    typeof value.text === 'string'
  );
}

function unwrapTextContent(resolvedContent) {
  if (hasTextField(resolvedContent)) {
    return resolvedContent.text;
  }
  return resolvedContent;
}

// ResolveContentField has 20 paths due to multiple ??/|| chains for field resolution
export function resolveContentField(parsed) {
  const delta = getDelta(parsed);
  const contentField = getResponseOrDeltaContent(parsed, delta);
  const messageContent = getMessageContent(parsed);
  const choiceText = getChoiceText(parsed);
  const resolvedContent = unwrapTextContent(contentField ?? messageContent ?? choiceText);
  return { delta, resolvedContent };
}

export function processSegments(parser, segments, text) {
  let accumulated = text;
  for (const segment of segments) {
    if (!segment?.text) continue;
    if (segment.type === 'reasoning') {
      parser._emitReasoningDelta(segment.text);
    } else {
      parser._emitTextDelta(segment.text);
      accumulated += segment.text;
    }
  }
  return accumulated;
}

export function emitFinishReason(parser, raw) {
  const reason = normalizeFinishReason(parser, raw);
  if (reason) {
    parser._emit({ type: 'finish_reason', reason });
  }
}

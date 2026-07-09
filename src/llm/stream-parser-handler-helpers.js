export function emitToolCalls(parser, toolCalls = []) {
  if (!Array.isArray(toolCalls) || !toolCalls.length) return;
  parser._hasToolCalls = true;
  parser._emit({ type: 'tool_call_delta', tool_calls: toolCalls });
}

export function normalizeFinishReason(parser, raw) {
  const value = String(raw || '')
    .trim()
    .toLowerCase();
  if (!value) return null;
  if (parser._hasToolCalls) return 'tool_calls';
  if (value.includes('tool')) return 'tool_calls';
  if (value === 'stop_sequence' || value === 'end_turn') return 'stop';
  if (value === 'max_tokens' || value === 'length') return 'length';
  if (value === 'stop') return 'stop';
  return value;
}

// ResolveContentField has 20 paths due to multiple ??/|| chains for field resolution
// eslint-disable-next-line complexity
export function resolveContentField(parsed) {
  const delta = parsed?.choices?.[0]?.delta || {};
  const contentField = parsed?.response ?? delta.content;
  const messageContent = parsed?.choices?.[0]?.message?.content;
  let resolvedContent = contentField ?? messageContent ?? parsed?.choices?.[0]?.text;

  const isObjectWithText =
    typeof resolvedContent === 'object' &&
    !Array.isArray(resolvedContent) &&
    resolvedContent !== null &&
    typeof resolvedContent.text === 'string';
  if (isObjectWithText) {
    resolvedContent = resolvedContent.text;
  }

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

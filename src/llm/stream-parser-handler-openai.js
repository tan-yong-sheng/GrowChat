import {
  emitFinishReason,
  emitToolCalls,
  processSegments,
  resolveContentField,
} from './stream-parser-handler-helpers.js';

function emitReasoningDelta(parser, parsed) {
  const delta = parsed?.choices?.[0]?.delta || {};
  const reasoningField =
    delta.reasoning ?? delta.thinking ?? delta.reasoning_content ?? delta.reasoningContent;
  if (reasoningField) {
    parser._emitReasoningDelta(String(reasoningField));
  }
}

function processResolvedContent(parser, resolvedContent) {
  let text = '';
  if (Array.isArray(resolvedContent)) {
    for (const part of resolvedContent) {
      if (!part || part.type !== 'text' || !part.text) continue;
      const segments = parser._extractTaggedSegments(String(part.text));
      text = processSegments(parser, segments, text);
    }
  } else if (resolvedContent) {
    const segments = parser._extractTaggedSegments(String(resolvedContent));
    text = processSegments(parser, segments, text);
  }
  return text;
}

function processFallbackDelta(parser, parsed, resolvedContent) {
  let text = '';
  if (!resolvedContent && typeof parsed?.type === 'string') {
    const responseDelta = parsed?.delta ?? parsed?.text;
    if (typeof responseDelta === 'string' && responseDelta) {
      const segments = parser._extractTaggedSegments(responseDelta);
      text = processSegments(parser, segments, text);
    }
  }
  return text;
}

export function handleOpenAiDelta(parser, parsed) {
  emitReasoningDelta(parser, parsed);

  const { delta, resolvedContent } = resolveContentField(parsed);
  let text = processResolvedContent(parser, resolvedContent);
  text += processFallbackDelta(parser, parsed, resolvedContent);

  if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
    emitToolCalls(parser, delta.tool_calls);
  }

  const finishReason = parsed?.choices?.[0]?.finish_reason;
  emitFinishReason(parser, finishReason);

  return text;
}

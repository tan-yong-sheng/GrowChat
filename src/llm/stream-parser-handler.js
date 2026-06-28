import { extractTextFromGoogle, extractTextFromAnthropic } from './stream-parser-utils.js';

export function handleParsed(parser, parsed) {
  let text = '';
  const emitToolCalls = (toolCalls = []) => {
    if (!Array.isArray(toolCalls) || !toolCalls.length) return;
    parser._hasToolCalls = true;
    parser._emit({ type: 'tool_call_delta', tool_calls: toolCalls });
  };

  const normalizeFinishReason = (raw) => {
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
  };

  const hasGoogleCandidate = Array.isArray(parsed?.candidates) && parsed.candidates.length > 0;
  if (hasGoogleCandidate) {
    const googleText = extractTextFromGoogle(parsed);
    if (googleText) {
      parser._emitTextDelta(googleText);
      text += googleText;
    }
    const googleToolCalls = [];
    const parts = parsed?.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) {
      for (const part of parts) {
        if (!part?.functionCall) continue;
        const id = `google_tool_${(parser._googleToolCallIndex += 1)}`;
        const thoughtSignature =
          part?.thoughtSignature != null ? String(part.thoughtSignature) : undefined;
        googleToolCalls.push({
          index: googleToolCalls.length,
          id,
          function: {
            name: String(part.functionCall.name || ''),
            arguments: JSON.stringify(part.functionCall.args ?? {}),
          },
          ...(thoughtSignature
            ? {
                providerMetadata: {
                  google: { thoughtSignature },
                },
              }
            : {}),
        });
      }
    }
    emitToolCalls(googleToolCalls);
    const finishReason =
      parsed?.candidates?.[0]?.finishReason || parsed?.candidates?.[0]?.finish_reason;
    if (finishReason) {
      parser._emit({ type: 'finish_reason', reason: normalizeFinishReason(finishReason) });
    }
    return text;
  }

  if (parsed?.type === 'content_block_start') {
    const block = parsed?.content_block;
    if (block && (block.type === 'tool_use' || block.type === 'mcp_tool_use')) {
      const index = Number.isFinite(parsed.index) ? parsed.index : 0;
      const toolCall = {
        index,
        id: String(block.id || `anthropic_tool_${index}`),
        function: {
          name: String(block.name || ''),
          arguments:
            typeof block.input === 'string' ? block.input : JSON.stringify(block.input ?? {}),
        },
      };
      parser._anthropicToolCalls.set(index, toolCall);
      emitToolCalls([toolCall]);
      return text;
    }
  }

  if (parsed?.type === 'content_block_delta') {
    const delta = parsed?.delta;
    if (delta?.type === 'input_json_delta') {
      const index = Number.isFinite(parsed.index) ? parsed.index : 0;
      const existing = parser._anthropicToolCalls.get(index) || {
        index,
        id: `anthropic_tool_${index}`,
        function: { name: '', arguments: '' },
      };
      existing.function.arguments = `${existing.function.arguments || ''}${String(delta.partial_json || '')}`;
      parser._anthropicToolCalls.set(index, existing);
      emitToolCalls([
        {
          index: existing.index,
          id: existing.id,
          function: { arguments: String(delta.partial_json || '') },
        },
      ]);
      return text;
    }
  }

  if (
    parsed?.type === 'content_block_delta' ||
    parsed?.type === 'message_delta' ||
    parsed?.type === 'message_stop'
  ) {
    const anthropicText = extractTextFromAnthropic(parsed);
    if (anthropicText) {
      parser._emitTextDelta(anthropicText);
      text += anthropicText;
    }
    if (parsed?.type === 'message_delta' && parsed?.delta?.stop_reason) {
      parser._emit({
        type: 'finish_reason',
        reason: normalizeFinishReason(parsed.delta.stop_reason),
      });
    }
    if (parsed?.type === 'message_stop') {
      parser._emit({ type: 'finish_reason', reason: normalizeFinishReason('stop') });
    }
    return text;
  }

  const delta = parsed?.choices?.[0]?.delta || {};
  const finishReason = parsed?.choices?.[0]?.finish_reason;
  const reasoningField =
    delta.reasoning ?? delta.thinking ?? delta.reasoning_content ?? delta.reasoningContent;
  if (reasoningField) {
    const reasoningDelta = String(reasoningField);
    parser._emitReasoningDelta(reasoningDelta);
  }

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

  if (Array.isArray(resolvedContent)) {
    for (const part of resolvedContent) {
      if (!part || part.type !== 'text' || !part.text) continue;
      const segments = parser._extractTaggedSegments(String(part.text));
      for (const segment of segments) {
        if (!segment?.text) continue;
        if (segment.type === 'reasoning') {
          parser._emitReasoningDelta(segment.text);
        } else {
          parser._emitTextDelta(segment.text);
          text += segment.text;
        }
      }
    }
  } else if (resolvedContent) {
    const segments = parser._extractTaggedSegments(String(resolvedContent));
    for (const segment of segments) {
      if (!segment?.text) continue;
      if (segment.type === 'reasoning') {
        parser._emitReasoningDelta(segment.text);
      } else {
        parser._emitTextDelta(segment.text);
        text += segment.text;
      }
    }
  }

  if (!resolvedContent && typeof parsed?.type === 'string') {
    const responseDelta = parsed?.delta ?? parsed?.text;
    if (typeof responseDelta === 'string' && responseDelta) {
      const segments = parser._extractTaggedSegments(responseDelta);
      for (const segment of segments) {
        if (!segment?.text) continue;
        if (segment.type === 'reasoning') {
          parser._emitReasoningDelta(segment.text);
        } else {
          parser._emitTextDelta(segment.text);
          text += segment.text;
        }
      }
    }
  }

  const toolCalls = delta.tool_calls;
  if (Array.isArray(toolCalls) && toolCalls.length > 0) {
    emitToolCalls(toolCalls);
  }
  if (finishReason) {
    parser._emit({ type: 'finish_reason', reason: normalizeFinishReason(finishReason) });
  }
  return text;
}

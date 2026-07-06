import { extractTextFromAnthropic } from './stream-parser-utils.js';
import { emitFinishReason, emitToolCalls } from './stream-parser-handler-helpers.js';

function buildAnthropicToolCall(block, index) {
  return {
    index,
    id: String(block.id || `anthropic_tool_${index}`),
    function: {
      name: String(block.name || ''),
      arguments: typeof block.input === 'string' ? block.input : JSON.stringify(block.input ?? {}),
    },
  };
}

function handleContentBlockStart(parser, parsed) {
  const block = parsed?.content_block;
  if (!block || (block.type !== 'tool_use' && block.type !== 'mcp_tool_use')) {
    return '';
  }
  const index = Number.isFinite(parsed.index) ? parsed.index : 0;
  const toolCall = buildAnthropicToolCall(block, index);
  parser._anthropicToolCalls.set(index, toolCall);
  emitToolCalls(parser, [toolCall]);
  return '';
}

function getExistingAnthropicToolCall(parser, index) {
  return (
    parser._anthropicToolCalls.get(index) || {
      index,
      id: `anthropic_tool_${index}`,
      function: { name: '', arguments: '' },
    }
  );
}

function handleInputJsonDelta(parser, parsed) {
  const index = Number.isFinite(parsed.index) ? parsed.index : 0;
  const existing = getExistingAnthropicToolCall(parser, index);
  const partialJson = String(parsed?.delta?.partial_json || '');
  existing.function.arguments = `${existing.function.arguments || ''}${partialJson}`;
  parser._anthropicToolCalls.set(index, existing);
  emitToolCalls(parser, [
    {
      index: existing.index,
      id: existing.id,
      function: { arguments: partialJson },
    },
  ]);
  return '';
}

function handleAnthropicTextAndFinish(parser, parsed) {
  let text = '';
  const anthropicText = extractTextFromAnthropic(parsed);
  if (anthropicText) {
    parser._emitTextDelta(anthropicText);
    text += anthropicText;
  }
  if (parsed?.type === 'message_delta' && parsed?.delta?.stop_reason) {
    emitFinishReason(parser, parsed.delta.stop_reason);
  }
  if (parsed?.type === 'message_stop') {
    emitFinishReason(parser, 'stop');
  }
  return text;
}

export function handleAnthropicEvent(parser, parsed) {
  if (parsed?.type === 'content_block_start') {
    return handleContentBlockStart(parser, parsed);
  }
  if (parsed?.type === 'content_block_delta' && parsed?.delta?.type === 'input_json_delta') {
    return handleInputJsonDelta(parser, parsed);
  }
  return handleAnthropicTextAndFinish(parser, parsed);
}

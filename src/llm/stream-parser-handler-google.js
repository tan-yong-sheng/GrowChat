import { extractTextFromGoogle } from './stream-parser-utils.js';
import {
  emitFinishReason,
  emitToolCalls,
  normalizeFinishReason,
  processSegments,
} from './stream-parser-handler-helpers.js';

function buildGoogleToolCall(parser, part, index) {
  const id = `google_tool_${(parser._googleToolCallIndex += 1)}`;
  const thoughtSignature =
    part?.thoughtSignature != null ? String(part.thoughtSignature) : undefined;
  const toolCall = {
    index,
    id,
    function: {
      name: String(part.functionCall.name || ''),
      arguments: JSON.stringify(part.functionCall.args ?? {}),
    },
  };
  if (thoughtSignature) {
    toolCall.providerMetadata = {
      google: { thoughtSignature },
    };
  }
  return toolCall;
}

function extractGoogleToolCalls(parser, parsed) {
  const parts = parsed?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return [];
  const toolCalls = [];
  for (const part of parts) {
    if (!part?.functionCall) continue;
    toolCalls.push(buildGoogleToolCall(parser, part, toolCalls.length));
  }
  return toolCalls;
}

export function handleGoogleCandidate(parser, parsed) {
  let text = '';
  const googleText = extractTextFromGoogle(parsed);
  if (googleText) {
    parser._emitTextDelta(googleText);
    text += googleText;
  }

  const googleToolCalls = extractGoogleToolCalls(parser, parsed);
  emitToolCalls(parser, googleToolCalls);

  const finishReason =
    parsed?.candidates?.[0]?.finishReason || parsed?.candidates?.[0]?.finish_reason;
  emitFinishReason(parser, finishReason);

  return text;
}

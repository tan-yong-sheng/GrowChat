import { handleAnthropicEvent } from './stream-parser-handler-anthropic.js';
import { handleGoogleCandidate } from './stream-parser-handler-google.js';
import { handleOpenAiDelta } from './stream-parser-handler-openai.js';

const hasGoogleCandidate = (parsed) =>
  Array.isArray(parsed?.candidates) && parsed.candidates.length > 0;

const isAnthropicEvent = (parsed) =>
  parsed?.type === 'content_block_start' ||
  parsed?.type === 'content_block_delta' ||
  parsed?.type === 'message_delta' ||
  parsed?.type === 'message_stop';

/**
 * Dispatch a parsed SSE chunk to the provider-specific handler.
 * Returns accumulated text delta.
 */
export function handleParsed(parser, parsed) {
  if (hasGoogleCandidate(parsed)) {
    return handleGoogleCandidate(parser, parsed);
  }
  if (isAnthropicEvent(parsed)) {
    return handleAnthropicEvent(parser, parsed);
  }
  return handleOpenAiDelta(parser, parsed);
}

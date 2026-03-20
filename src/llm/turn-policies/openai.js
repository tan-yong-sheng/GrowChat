import { resolveSharedTurnContinuation } from './shared.js';

export function resolveOpenAITurnContinuation(options = {}) {
  return resolveSharedTurnContinuation(options);
}

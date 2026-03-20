import { resolveSharedTurnContinuation } from './shared.js';

export function resolveGoogleTurnContinuation(options = {}) {
  const hasToolCalls = Boolean(options.hasToolCalls);
  if (hasToolCalls) {
    return { action: 'tool_loop' };
  }

  return resolveSharedTurnContinuation(options);
}

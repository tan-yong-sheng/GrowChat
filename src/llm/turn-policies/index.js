import { normalizeProviderFamily } from '../provider-registry.js';
import { resolveOpenAITurnContinuation } from './openai.js';
import { resolveGoogleTurnContinuation } from './google.js';
import { resolveAnthropicTurnContinuation } from './anthropic.js';

const POLICY_BY_FAMILY = {
  openai: resolveOpenAITurnContinuation,
  google: resolveGoogleTurnContinuation,
  anthropic: resolveAnthropicTurnContinuation,
};

export function resolveTurnContinuation(options = {}) {
  const family = normalizeProviderFamily(options.providerFamily) || 'openai';
  const policy = POLICY_BY_FAMILY[family] || resolveOpenAITurnContinuation;
  return policy(options);
}

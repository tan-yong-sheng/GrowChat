import { describe, expect, it } from 'vitest';
import { resolveOpenAITurnContinuation } from './turn-policies/openai.js';
import { resolveGoogleTurnContinuation } from './turn-policies/google.js';
import { resolveAnthropicTurnContinuation } from './turn-policies/anthropic.js';
import { resolveTurnContinuation } from './turn-policy.js';

describe('turn-policies', () => {
  it('keeps OpenAI strict for missing tool finish reasons', () => {
    expect(
      resolveOpenAITurnContinuation({
        hasToolCalls: true,
        finishReason: null,
      })
    ).toEqual({ action: 'final' });
  });

  it('lets Gemini continue on tool calls without a finish reason', () => {
    expect(
      resolveGoogleTurnContinuation({
        hasToolCalls: true,
        finishReason: null,
      })
    ).toEqual({ action: 'tool_loop' });
  });

  it('keeps Anthropic on the shared path', () => {
    expect(
      resolveAnthropicTurnContinuation({
        hasToolCalls: true,
        finishReason: 'tool_calls',
      })
    ).toEqual({ action: 'tool_loop' });
  });

  it('dispatches provider families through the registry', () => {
    expect(
      resolveTurnContinuation({
        providerFamily: 'google',
        hasToolCalls: true,
        finishReason: null,
      })
    ).toEqual({ action: 'tool_loop' });
  });
});

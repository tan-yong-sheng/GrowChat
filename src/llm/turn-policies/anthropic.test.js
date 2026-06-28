import { describe, expect, it } from 'vitest';
import { resolveAnthropicTurnContinuation } from './anthropic.js';

describe('resolveAnthropicTurnContinuation', () => {
  it('delegates to shared: returns tool_loop when hasToolCalls with tool_calls finish', () => {
    expect(
      resolveAnthropicTurnContinuation({
        hasToolCalls: true,
        finishReason: 'tool_calls',
      })
    ).toEqual({ action: 'tool_loop' });
  });

  it('delegates to shared: returns final when no special conditions', () => {
    expect(resolveAnthropicTurnContinuation({})).toEqual({ action: 'final' });
  });

  it('delegates to shared: returns follow_up for reasoning-only output', () => {
    expect(
      resolveAnthropicTurnContinuation({
        hasToolCalls: false,
        stepTextOutput: false,
        stepReasoningOutput: true,
        followUps: 0,
        maxFollowUps: 5,
      })
    ).toEqual({ action: 'follow_up' });
  });

  it('delegates to shared: returns final when hasToolCalls but finishReason is not tool_calls', () => {
    expect(
      resolveAnthropicTurnContinuation({
        hasToolCalls: true,
        finishReason: 'stop',
      })
    ).toEqual({ action: 'final' });
  });

  it('handles empty options with defaults', () => {
    expect(resolveAnthropicTurnContinuation()).toEqual({ action: 'final' });
  });
});

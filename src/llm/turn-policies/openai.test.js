import { describe, expect, it } from 'vitest';
import { resolveOpenAITurnContinuation } from './openai.js';

describe('resolveOpenAITurnContinuation', () => {
  it('delegates to shared: returns tool_loop when hasToolCalls with tool_calls finish', () => {
    expect(
      resolveOpenAITurnContinuation({
        hasToolCalls: true,
        finishReason: 'tool_calls',
      }),
    ).toEqual({ action: 'tool_loop' });
  });

  it('delegates to shared: returns final when hasToolCalls is true but finishReason is null', () => {
    expect(
      resolveOpenAITurnContinuation({
        hasToolCalls: true,
        finishReason: null,
      }),
    ).toEqual({ action: 'final' });
  });

  it('delegates to shared: returns follow_up for reasoning-only output', () => {
    expect(
      resolveOpenAITurnContinuation({
        hasToolCalls: false,
        stepTextOutput: false,
        stepReasoningOutput: true,
        followUps: 0,
        maxFollowUps: 5,
      }),
    ).toEqual({ action: 'follow_up' });
  });

  it('delegates to shared: returns final when no special conditions', () => {
    expect(resolveOpenAITurnContinuation({})).toEqual({ action: 'final' });
  });

  it('delegates to shared: returns final with stop finish reason', () => {
    expect(
      resolveOpenAITurnContinuation({
        hasToolCalls: false,
        finishReason: 'stop',
      }),
    ).toEqual({ action: 'final' });
  });

  it('handles empty options with defaults', () => {
    expect(resolveOpenAITurnContinuation()).toEqual({ action: 'final' });
  });

  it('does NOT return tool_loop when hasToolCalls is true but finishReason is stop', () => {
    expect(
      resolveOpenAITurnContinuation({
        hasToolCalls: true,
        finishReason: 'stop',
      }),
    ).toEqual({ action: 'final' });
  });
});

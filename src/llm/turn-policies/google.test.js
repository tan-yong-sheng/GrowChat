import { describe, expect, it } from 'vitest';
import { resolveGoogleTurnContinuation } from './google.js';

describe('resolveGoogleTurnContinuation', () => {
  it('returns tool_loop when hasToolCalls is true (Google-specific shortcut)', () => {
    expect(
      resolveGoogleTurnContinuation({
        hasToolCalls: true,
        finishReason: null,
      }),
    ).toEqual({ action: 'tool_loop' });
  });

  it('returns tool_loop when hasToolCalls is true regardless of finishReason', () => {
    expect(
      resolveGoogleTurnContinuation({
        hasToolCalls: true,
        finishReason: 'stop',
      }),
    ).toEqual({ action: 'tool_loop' });
  });

  it('delegates to shared when hasToolCalls is false', () => {
    expect(
      resolveGoogleTurnContinuation({
        hasToolCalls: true,
        finishReason: 'tool_calls',
      }),
    ).toEqual({ action: 'tool_loop' });
  });

  it('delegates to shared: returns follow_up for reasoning-only output', () => {
    expect(
      resolveGoogleTurnContinuation({
        hasToolCalls: false,
        stepTextOutput: false,
        stepReasoningOutput: true,
        followUps: 0,
        maxFollowUps: 5,
      }),
    ).toEqual({ action: 'follow_up' });
  });

  it('delegates to shared: returns final when no special conditions', () => {
    expect(resolveGoogleTurnContinuation({})).toEqual({ action: 'final' });
  });

  it('returns final when hasToolCalls is false and no reasoning output', () => {
    expect(
      resolveGoogleTurnContinuation({
        hasToolCalls: false,
        finishReason: 'stop',
      }),
    ).toEqual({ action: 'final' });
  });

  it('handles empty options with defaults', () => {
    expect(resolveGoogleTurnContinuation()).toEqual({ action: 'final' });
  });

  it('does NOT shortcut for hasToolCalls false even with tool_calls finish reason', () => {
    expect(
      resolveGoogleTurnContinuation({
        hasToolCalls: false,
        finishReason: 'tool_calls',
      }),
    ).toEqual({ action: 'final' });
  });
});

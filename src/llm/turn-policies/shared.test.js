import { describe, expect, it } from 'vitest';
import { resolveSharedTurnContinuation } from './shared.js';

describe('resolveSharedTurnContinuation', () => {
  it('returns tool_loop when hasToolCalls and finishReason is tool_calls', () => {
    expect(
      resolveSharedTurnContinuation({
        hasToolCalls: true,
        finishReason: 'tool_calls',
      }),
    ).toEqual({ action: 'tool_loop' });
  });

  it('returns final when hasToolCalls is true but finishReason is not tool_calls', () => {
    expect(
      resolveSharedTurnContinuation({
        hasToolCalls: true,
        finishReason: 'stop',
      }),
    ).toEqual({ action: 'final' });
  });

  it('returns final when hasToolCalls is true but finishReason is null', () => {
    expect(
      resolveSharedTurnContinuation({
        hasToolCalls: true,
        finishReason: null,
      }),
    ).toEqual({ action: 'final' });
  });

  it('returns follow_up when only reasoning output with follow-ups remaining', () => {
    expect(
      resolveSharedTurnContinuation({
        hasToolCalls: false,
        stepTextOutput: false,
        stepReasoningOutput: true,
        followUps: 0,
        maxFollowUps: 5,
      }),
    ).toEqual({ action: 'follow_up' });
  });

  it('returns final when reasoning output but follow-ups exhausted', () => {
    expect(
      resolveSharedTurnContinuation({
        hasToolCalls: false,
        stepTextOutput: false,
        stepReasoningOutput: true,
        followUps: 5,
        maxFollowUps: 5,
      }),
    ).toEqual({ action: 'final' });
  });

  it('returns final when reasoning output but maxFollowUps is 0', () => {
    expect(
      resolveSharedTurnContinuation({
        hasToolCalls: false,
        stepTextOutput: false,
        stepReasoningOutput: true,
        followUps: 0,
        maxFollowUps: 0,
      }),
    ).toEqual({ action: 'final' });
  });

  it('returns final when text output present (not just reasoning)', () => {
    expect(
      resolveSharedTurnContinuation({
        hasToolCalls: false,
        stepTextOutput: true,
        stepReasoningOutput: true,
        followUps: 0,
        maxFollowUps: 5,
      }),
    ).toEqual({ action: 'final' });
  });

  it('returns final when no tool calls, no text, no reasoning', () => {
    expect(resolveSharedTurnContinuation()).toEqual({ action: 'final' });
  });

  it('returns final with all defaults', () => {
    expect(resolveSharedTurnContinuation({})).toEqual({ action: 'final' });
  });

  it('returns follow_up with followUps just under maxFollowUps', () => {
    expect(
      resolveSharedTurnContinuation({
        stepReasoningOutput: true,
        followUps: 4,
        maxFollowUps: 5,
      }),
    ).toEqual({ action: 'follow_up' });
  });

  it('returns final when hasToolCalls is false and stepTextOutput is true even with reasoning', () => {
    expect(
      resolveSharedTurnContinuation({
        hasToolCalls: false,
        stepTextOutput: true,
        stepReasoningOutput: true,
      }),
    ).toEqual({ action: 'final' });
  });

  it('returns final when both text and reasoning output but no tool calls', () => {
    expect(
      resolveSharedTurnContinuation({
        hasToolCalls: false,
        stepTextOutput: true,
        stepReasoningOutput: false,
      }),
    ).toEqual({ action: 'final' });
  });
});

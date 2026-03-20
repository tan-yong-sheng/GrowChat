import { describe, expect, it } from 'vitest';
import { resolveTurnContinuation } from './turn-policy.js';

describe('turn-policy', () => {
  it('continues a tool loop when the model returns tool calls', () => {
    expect(
      resolveTurnContinuation({
        providerFamily: 'openai',
        hasToolCalls: true,
        finishReason: 'tool_calls',
        stepTextOutput: false,
        stepReasoningOutput: false,
        followUps: 0,
        maxFollowUps: 5,
      })
    ).toEqual({ action: 'tool_loop' });
  });

  it('lets Gemini continue on tool calls even when finishReason is missing', () => {
    expect(
      resolveTurnContinuation({
        providerFamily: 'google',
        hasToolCalls: true,
        finishReason: null,
        stepTextOutput: false,
        stepReasoningOutput: false,
        followUps: 0,
        maxFollowUps: 5,
      })
    ).toEqual({ action: 'tool_loop' });
  });

  it('keeps non-Gemini providers strict when finishReason is missing', () => {
    expect(
      resolveTurnContinuation({
        providerFamily: 'openai',
        hasToolCalls: true,
        finishReason: null,
        stepTextOutput: false,
        stepReasoningOutput: false,
        followUps: 0,
        maxFollowUps: 5,
      })
    ).toEqual({ action: 'final' });
  });

  it('requests a follow-up when the model only returns reasoning', () => {
    expect(
      resolveTurnContinuation({
        providerFamily: 'openai',
        hasToolCalls: false,
        finishReason: null,
        stepTextOutput: false,
        stepReasoningOutput: true,
        followUps: 0,
        maxFollowUps: 5,
      })
    ).toEqual({ action: 'follow_up' });
  });

  it('stops following up after the maximum is reached', () => {
    expect(
      resolveTurnContinuation({
        providerFamily: 'google',
        hasToolCalls: false,
        finishReason: null,
        stepTextOutput: false,
        stepReasoningOutput: true,
        followUps: 5,
        maxFollowUps: 5,
      })
    ).toEqual({ action: 'final' });
  });

  it('stops when the model already produced text', () => {
    expect(
      resolveTurnContinuation({
        providerFamily: 'anthropic',
        hasToolCalls: false,
        finishReason: null,
        stepTextOutput: true,
        stepReasoningOutput: true,
        followUps: 0,
        maxFollowUps: 5,
      })
    ).toEqual({ action: 'final' });
  });
});

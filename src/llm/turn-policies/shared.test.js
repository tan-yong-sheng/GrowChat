import { describe, it, expect } from 'vitest';
import { resolveSharedTurnContinuation } from './shared.js';
import { resolveAnthropicTurnContinuation } from './anthropic.js';
import { resolveGoogleTurnContinuation } from './google.js';
import { resolveOpenAITurnContinuation } from './openai.js';

describe('shared.js', () => {
  describe('shouldFollowUp logic', () => {
    it('returns follow_up when no tool calls, no text output, has reasoning, and under max follow-ups', () => {
      const result = resolveSharedTurnContinuation({
        hasToolCalls: false,
        stepTextOutput: false,
        stepReasoningOutput: true,
        followUps: 2,
        maxFollowUps: 5,
      });
      expect(result).toEqual({ action: 'follow_up' });
    });

    it('returns follow_up at boundary (followUps = maxFollowUps - 1)', () => {
      const result = resolveSharedTurnContinuation({
        hasToolCalls: false,
        stepTextOutput: false,
        stepReasoningOutput: true,
        followUps: 4,
        maxFollowUps: 5,
      });
      expect(result).toEqual({ action: 'follow_up' });
    });

    it('returns final when followUps equals maxFollowUps (boundary)', () => {
      const result = resolveSharedTurnContinuation({
        hasToolCalls: false,
        stepTextOutput: false,
        stepReasoningOutput: true,
        followUps: 5,
        maxFollowUps: 5,
      });
      expect(result).toEqual({ action: 'final' });
    });

    it('returns final when followUps exceeds maxFollowUps', () => {
      const result = resolveSharedTurnContinuation({
        hasToolCalls: false,
        stepTextOutput: false,
        stepReasoningOutput: true,
        followUps: 10,
        maxFollowUps: 5,
      });
      expect(result).toEqual({ action: 'final' });
    });

    it('returns final when hasToolCalls is true', () => {
      const result = resolveSharedTurnContinuation({
        hasToolCalls: true,
        stepTextOutput: false,
        stepReasoningOutput: true,
        followUps: 0,
        maxFollowUps: 5,
      });
      expect(result).toEqual({ action: 'final' }); // follow_up gate fails (hasToolCalls=true)
    });

    it('returns final when stepTextOutput is true', () => {
      const result = resolveSharedTurnContinuation({
        hasToolCalls: false,
        stepTextOutput: true,
        stepReasoningOutput: true,
        followUps: 0,
        maxFollowUps: 5,
      });
      expect(result).toEqual({ action: 'final' }); // follow_up gate fails (stepTextOutput=true)
    });

    it('returns final when stepReasoningOutput is false', () => {
      const result = resolveSharedTurnContinuation({
        hasToolCalls: false,
        stepTextOutput: false,
        stepReasoningOutput: false,
        followUps: 0,
        maxFollowUps: 5,
      });
      expect(result).toEqual({ action: 'final' }); // follow_up gate fails (no reasoning)
    });

    it('returns final when all conditions false', () => {
      const result = resolveSharedTurnContinuation({
        hasToolCalls: false,
        stepTextOutput: false,
        stepReasoningOutput: false,
        followUps: 0,
        maxFollowUps: 5,
      });
      expect(result).toEqual({ action: 'final' });
    });
  });

  describe('shouldToolLoop logic', () => {
    it('returns tool_loop when hasToolCalls and finishReason=tool_calls', () => {
      const result = resolveSharedTurnContinuation({
        hasToolCalls: true,
        finishReason: 'tool_calls',
        stepTextOutput: false,
        stepReasoningOutput: false,
        followUps: 0,
        maxFollowUps: 5,
      });
      expect(result).toEqual({ action: 'tool_loop' });
    });

    it('returns final when hasToolCalls but finishReason is not tool_calls', () => {
      const result = resolveSharedTurnContinuation({
        hasToolCalls: true,
        finishReason: 'stop',
        stepTextOutput: false,
        stepReasoningOutput: false,
        followUps: 0,
        maxFollowUps: 5,
      });
      // hasToolCalls=true → follow_up gate fails, then shouldToolLoop only triggers for finishReason=tool_calls
      expect(result).toEqual({ action: 'final' });
    });

    it('returns final when finishReason=tool_calls but no tool calls', () => {
      const result = resolveSharedTurnContinuation({
        hasToolCalls: false,
        finishReason: 'tool_calls',
        stepTextOutput: false,
        stepReasoningOutput: false,
        followUps: 0,
        maxFollowUps: 5,
      });
      expect(result).toEqual({ action: 'final' }); // follow_up fails, shouldToolLoop needs hasToolCalls=true
    });

    it('returns final when neither condition is met', () => {
      const result = resolveSharedTurnContinuation({
        hasToolCalls: false,
        finishReason: null,
        stepTextOutput: false,
        stepReasoningOutput: false,
        followUps: 0,
        maxFollowUps: 5,
      });
      expect(result).toEqual({ action: 'final' });
    });
  });

  describe('default values', () => {
    it('returns final when called with empty object (all defaults)', () => {
      const result = resolveSharedTurnContinuation({});
      expect(result).toEqual({ action: 'final' });
    });

    it('returns final with no arguments', () => {
      const result = resolveSharedTurnContinuation();
      expect(result).toEqual({ action: 'final' });
    });

    it('returns follow_up with partial options when reasoning=true', () => {
      const result = resolveSharedTurnContinuation({ stepReasoningOutput: true });
      expect(result).toEqual({ action: 'follow_up' });
    });
  });

  describe('priority (follow_up takes precedence over tool_loop)', () => {
    it('follow_up wins when both conditions could apply', () => {
      // If hasToolCalls=false, follow_up CAN fire (if all other conditions met)
      // If finishReason=tool_calls, tool_loop fires
      // BUT follow_up is checked FIRST, so it wins when applicable
      // Here: hasToolCalls=false (follow_up possible), finishReason=tool_calls (tool_loop possible)
      // BUT: follow_up requires stepReasoningOutput=true
      const result = resolveSharedTurnContinuation({
        hasToolCalls: false,
        finishReason: 'tool_calls',
        stepReasoningOutput: true,
        followUps: 0,
        maxFollowUps: 5,
      });
      // hasToolCalls=false → follow_up gate PASSES (all conditions: no tools, no text, has reasoning, under limit)
      expect(result).toEqual({ action: 'follow_up' });
    });
  });
});

describe('turn-policies provider variants', () => {
  describe('resolveAnthropicTurnContinuation', () => {
    it('delegates to shared implementation', () => {
      // Same behavior as shared
      expect(
        resolveAnthropicTurnContinuation({
          hasToolCalls: false,
          stepReasoningOutput: true,
          followUps: 0,
          maxFollowUps: 5,
        })
      ).toEqual({ action: 'follow_up' });

      expect(
        resolveAnthropicTurnContinuation({
          hasToolCalls: true,
          finishReason: 'tool_calls',
        })
      ).toEqual({ action: 'tool_loop' });

      expect(resolveAnthropicTurnContinuation({})).toEqual({ action: 'final' });
    });
  });

  describe('resolveOpenAITurnContinuation', () => {
    it('delegates to shared implementation', () => {
      expect(
        resolveOpenAITurnContinuation({
          hasToolCalls: false,
          stepReasoningOutput: true,
          followUps: 0,
          maxFollowUps: 5,
        })
      ).toEqual({ action: 'follow_up' });

      expect(
        resolveOpenAITurnContinuation({
          hasToolCalls: true,
          finishReason: 'tool_calls',
        })
      ).toEqual({ action: 'tool_loop' });

      expect(resolveOpenAITurnContinuation({})).toEqual({ action: 'final' });
    });
  });

  describe('resolveGoogleTurnContinuation', () => {
    it('returns tool_loop for any hasToolCalls=true (override)', () => {
      // Google overrides: hasToolCalls always triggers tool_loop regardless of finishReason
      expect(
        resolveGoogleTurnContinuation({
          hasToolCalls: true,
          finishReason: 'stop', // NOT tool_calls - Google overrides this
        })
      ).toEqual({ action: 'tool_loop' });

      expect(
        resolveGoogleTurnContinuation({
          hasToolCalls: true,
          finishReason: 'tool_calls',
        })
      ).toEqual({ action: 'tool_loop' });
    });

    it('delegates to shared when hasToolCalls=false', () => {
      expect(
        resolveGoogleTurnContinuation({
          hasToolCalls: false,
          stepReasoningOutput: true,
          followUps: 0,
          maxFollowUps: 5,
        })
      ).toEqual({ action: 'follow_up' });

      expect(
        resolveGoogleTurnContinuation({
          hasToolCalls: false,
          finishReason: 'tool_calls',
          stepReasoningOutput: false,
          followUps: 0,
          maxFollowUps: 5,
        })
      ).toEqual({ action: 'final' }); // hasToolCalls=false → shared decides, follow_up gate fails

      expect(resolveGoogleTurnContinuation({})).toEqual({ action: 'final' });
    });

    it('handles hasToolCalls=undefined (falsy)', () => {
      expect(resolveGoogleTurnContinuation({ finishReason: 'stop' })).toEqual({ action: 'final' }); // Boolean(undefined)=false
    });

    it('handles hasToolCalls truthy object (edge case)', () => {
      expect(resolveGoogleTurnContinuation({ hasToolCalls: {}, finishReason: 'stop' })).toEqual({
        action: 'tool_loop',
      }); // Boolean({})=true
    });
  });
});

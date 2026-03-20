import { describe, expect, it, vi } from 'vitest';
import { runAsyncSessionProcessor } from './async-session-processor.js';

describe('async-session-processor', () => {
  it('continues tool and follow-up turns until the run step returns final', async () => {
    const runStep = vi.fn(async ({ steps, followUps, messagesForModel }) => {
      if (steps === 0) {
        return {
          action: 'tool_loop',
          nextMessagesForModel: [...messagesForModel, 'tool'],
          marker: 'tool',
        };
      }

      if (followUps === 0) {
        return {
          action: 'follow_up',
          nextMessagesForModel: [...messagesForModel, 'follow-up'],
          marker: 'follow-up',
        };
      }

      return {
        action: 'final',
        nextMessagesForModel: [...messagesForModel, 'done'],
        marker: 'final',
      };
    });

    const result = await runAsyncSessionProcessor({
      initialMessages: ['start'],
      maxToolSteps: 3,
      maxFollowUps: 3,
      runStep,
    });

    expect(runStep).toHaveBeenCalledTimes(3);
    expect(result.steps).toBe(1);
    expect(result.followUps).toBe(1);
    expect(result.messagesForModel).toEqual(['start', 'tool', 'follow-up', 'done']);
    expect(result.lastResult.marker).toBe('final');
  });

  it('throws when tool loops exceed the maximum', async () => {
    const runStep = vi.fn(async ({ messagesForModel }) => ({
      action: 'tool_loop',
      nextMessagesForModel: [...messagesForModel, 'tool'],
    }));

    await expect(
      runAsyncSessionProcessor({
        initialMessages: ['start'],
        maxToolSteps: 1,
        maxFollowUps: 3,
        runStep,
      })
    ).rejects.toThrow('Too many tool calls in a single request');
  });

  it('throws when follow-up turns exceed the maximum', async () => {
    const runStep = vi.fn(async ({ messagesForModel }) => ({
      action: 'follow_up',
      nextMessagesForModel: [...messagesForModel, 'follow-up'],
    }));

    await expect(
      runAsyncSessionProcessor({
        initialMessages: ['start'],
        maxToolSteps: 3,
        maxFollowUps: 1,
        runStep,
      })
    ).rejects.toThrow('Too many follow-up turns in a single request');
  });
});

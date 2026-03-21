import { describe, it, expect } from 'vitest';
import { runAsyncSessionProcessor } from './async-session-processor.js';

describe('async-session-processor', () => {
  it('runs through tool loops and follow ups', async () => {
    const steps = [];
    const result = await runAsyncSessionProcessor({
      initialMessages: [{ role: 'user', content: 'hi' }],
      runStep: async (state) => {
        steps.push(state.steps);
        if (state.steps < 1) return { action: 'tool_loop', nextMessagesForModel: state.messagesForModel };
        if (state.followUps < 1) return { action: 'follow_up', nextMessagesForModel: state.messagesForModel };
        return { action: 'final', result: 'ok' };
      },
    });

    expect(result.lastResult.result).toBe('ok');
    expect(steps).toEqual([0, 1, 1]);
  });
});

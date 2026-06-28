import { describe, expect, it } from 'vitest';

describe('async-session-processor re-export', () => {
  it('exports runAsyncSessionProcessor from features/chat', async () => {
    const mod = await import('./async-session-processor.js');
    expect(mod.runAsyncSessionProcessor).toBeDefined();
    expect(typeof mod.runAsyncSessionProcessor).toBe('function');
  });
});

import { describe, expect, it } from 'vitest';

describe('realtime re-exports', () => {
  it('exports expected functions from features/realtime', async () => {
    const mod = await import('./realtime.js');
    expect(mod.connectRealtimeStream).toBeDefined();
    expect(mod.createRealtimeEvent).toBeDefined();
    expect(mod.getOriginSessionId).toBeDefined();
    expect(mod.publishRealtimeEvent).toBeDefined();
  });
});

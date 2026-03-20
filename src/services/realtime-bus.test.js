import { describe, expect, it, vi } from 'vitest';
import { createRealtimeBus } from './realtime-bus.js';

vi.mock('../realtime.js', () => ({
  createRealtimeEvent: vi.fn((event) => event),
  publishRealtimeEvent: vi.fn().mockResolvedValue(true),
}));

import { publishRealtimeEvent } from '../realtime.js';

describe('realtime bus', () => {
  it('publishes events through the realtime transport', async () => {
    const env = { MESSAGE_QUEUE: {} };
    const bus = createRealtimeBus(env, { waitUntil: vi.fn() });
    await bus.publish({ type: 'chat.updated', user_id: 'u1' });
    expect(publishRealtimeEvent).toHaveBeenCalledWith(env, { type: 'chat.updated', user_id: 'u1' });
  });
});

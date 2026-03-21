import { createRealtimeEvent, publishRealtimeEvent } from '../features/realtime/realtime.js';

export function createRealtimeBus(env, { waitUntil = null } = {}) {
  return {
    createEvent: createRealtimeEvent,
    async publish(event) {
      return publishRealtimeEvent(env, event);
    },
    schedule(event) {
      const promise = publishRealtimeEvent(env, event);
      if (typeof waitUntil === 'function') {
        waitUntil(promise.catch(() => false));
        return promise;
      }
      return promise;
    },
  };
}

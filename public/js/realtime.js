import { getAuthState, getClientSessionId, refreshToken } from './api.js';

class RealtimeClient {
  constructor(onEvent) {
    this.onEvent = onEvent;
    this.abortController = null;
    this.closedManually = false;
    this.reconnectDelayMs = 1000;
    this.reconnectTimer = null;
    this.connectingPromise = null;
    this.seenEventKeys = new Map();
  }

  async connect() {
    if (this.abortController || this.closedManually) return;
    if (this.connectingPromise) return this.connectingPromise;

    this.connectingPromise = (async () => {
      const auth = getAuthState();
      const token = auth?.access_token;
      if (!token) return;

      this.abortController = new AbortController();

      try {
        const res = await fetch('/api/realtime/stream', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'text/event-stream',
            'x-client-session-id': getClientSessionId(),
          },
          signal: this.abortController.signal,
        });

        if (res.status === 401 && auth?.refresh_token) {
          const refreshed = await refreshToken(auth.refresh_token);
          this.abortController = null;
          if (refreshed) {
            this.scheduleReconnect(200);
            return;
          }
        }

        if (!res.ok || !res.body) {
          throw new Error(`Realtime stream failed (${res.status})`);
        }

        this.reconnectDelayMs = 1000;
        await this.readSse(res.body);
      } catch (err) {
        if (err?.name !== 'AbortError') {
          console.warn('Realtime client error:', String(err?.message || err));
        }
      } finally {
        this.abortController = null;
        this.connectingPromise = null;
        if (!this.closedManually) this.scheduleReconnect();
      }
    })();

    return this.connectingPromise;
  }

  async readSse(body) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let eventLines = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let index;
        while ((index = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, index).replace(/\r$/, '');
          buffer = buffer.slice(index + 1);

          if (!line) {
            this.flushEvent(eventLines);
            eventLines = [];
            continue;
          }

          eventLines.push(line);
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  flushEvent(lines) {
    if (!lines.length) return;
    const dataParts = [];
    for (const line of lines) {
      if (line.startsWith(':')) continue;
      if (line.startsWith('data:')) dataParts.push(line.slice(5).trimStart());
    }
    if (!dataParts.length) return;

    const payloadText = dataParts.join('\n');
    try {
      const payload = JSON.parse(payloadText);
      if (this.isDuplicateEvent(payload)) return;
      this.onEvent?.(payload);
    } catch {
      // Ignore malformed event payloads.
    }
  }

  isDuplicateEvent(payload) {
    if (!payload || typeof payload !== 'object') return false;
    const key = [
      String(payload.type || ''),
      String(payload.chat_id || ''),
      String(payload.message_id || ''),
      String(payload.user_id || ''),
      String(payload.ts || ''),
      String(payload?.data?.seq || ''),
    ].join('|');
    if (!key || key === '||||') return false;

    const now = Date.now();
    const ttlMs = 120000;
    const existing = this.seenEventKeys.get(key);
    if (existing && now - existing < ttlMs) return true;
    this.seenEventKeys.set(key, now);

    // Compact map opportunistically.
    if (this.seenEventKeys.size > 1000) {
      for (const [k, t] of this.seenEventKeys.entries()) {
        if (now - t >= ttlMs) this.seenEventKeys.delete(k);
      }
    }
    return false;
  }

  setOnEvent(onEvent) {
    this.onEvent = onEvent;
  }

  scheduleReconnect(forceDelayMs = null) {
    if (this.closedManually || this.reconnectTimer) return;

    const delay = forceDelayMs ?? this.reconnectDelayMs;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, 30000);
      this.connect();
    }, delay);
  }

  disconnect() {
    this.closedManually = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.abortController?.abort();
    this.abortController = null;
  }
}

let client = null;

export function startRealtimeSync({ onEvent } = {}) {
  if (client) {
    if (onEvent) client.setOnEvent(onEvent);
    client.closedManually = false;
    client.connect();
    return client;
  }
  client = new RealtimeClient(onEvent || null);
  client.connect();
  return client;
}

export function stopRealtimeSync() {
  if (!client) return;
  client.disconnect();
  client = null;
}

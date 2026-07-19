import { getAuthState, getClientSessionId, refreshToken } from './api.js';

// ── HTTP status codes ──
const HTTP_STATUS_UNAUTHORIZED = 401;

// ── Failure logging thresholds ──
const LOG_FAILURE_THRESHOLD = 3;
const LOG_FAILURE_MODULUS = 10;

// ── SSE protocol constants ──
const DATA_PREFIX_LENGTH = 5;

// ── Event deduplication ──
const DUPLICATE_TTL_MS = 120000;

// ── Reconnection constants ──
const MAX_RECONNECT_DELAY_MS = 60000;
const MAX_BACKOFF_DELAY_MS = 30000;

function stringField(value) {
  return String(value || '');
}

class RealtimeClient {
  constructor(onEvent) {
    this.onEvent = onEvent;
    this.eventSource = null;
    this.closedManually = false;
    this.disabled = false;
    this.reconnectDelayMs = 1000;
    this.reconnectTimer = null;
    this.connectingPromise = null;
    this.seenEventKeys = new Map();
    this.failureCount = 0;
  }

  isRealtimeBlocked() {
    return this.abortController || this.closedManually || this.disabled;
  }

  async connect() {
    if (this.isRealtimeBlocked()) return;
    if (this.connectingPromise) return this.connectingPromise;
    this.connectingPromise = this.runConnectLoop();
    return this.connectingPromise;
  }

  async runConnectLoop() {
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

      if (await this.tryHandleUnauthorized(res, auth)) return;
      if (!res.ok || !res.body) {
        if (await this.tryHandleServerError(res)) return;
        this.failureCount += 1;
        throw new Error(`Realtime stream failed (${res.status})`);
      }

      this.reconnectDelayMs = 1000;
      this.failureCount = 0;
      await this.readSse(res.body);
    } catch (err) {
      this.logConnectError(err);
    } finally {
      this.finishConnectAttempt();
    }
  }

  async tryHandleUnauthorized(res, auth) {
    if (res.status !== HTTP_STATUS_UNAUTHORIZED || !auth?.refresh_token) return false;
    const refreshed = await refreshToken(auth.refresh_token);
    this.eventSource = null;
    if (refreshed) {
      this.scheduleReconnect(200);
      return true;
    }
    return false;
  }

  async tryHandleServerError(res) {
    if (res.status !== 500) return false;
    const errorText = await res.text().catch(() => '');
    const isLocalhost =
      window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (errorText.includes('Realtime binding missing') || isLocalhost) {
      this.disabled = true;
      this.closedManually = true;
      return true;
    }
    return false;
  }

  shouldLogFailure(count) {
    return count <= LOG_FAILURE_THRESHOLD || count % LOG_FAILURE_MODULUS === 0;
  }

  logConnectError(err) {
    if (err?.name === 'AbortError' || !this.shouldLogFailure(this.failureCount)) return;
    console.warn('Realtime client error:', String(err?.message || err));
  }

  finishConnectAttempt() {
    this.eventSource = null;
    this.connectingPromise = null;
    if (!this.closedManually && !this.disabled) this.scheduleReconnect();
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

  extractDataParts(lines) {
    const dataParts = [];
    for (const line of lines) {
      if (line.startsWith(':')) continue;
      if (line.startsWith('data:')) dataParts.push(line.slice(DATA_PREFIX_LENGTH).trimStart());
    }
    return dataParts;
  }

  dispatchEventPayload(payloadText) {
    try {
      const payload = JSON.parse(payloadText);
      if (this.isDuplicateEvent(payload)) return;
      this.onEvent?.(payload);
    } catch {
      // Ignore malformed event payloads.
    }
  }

  flushEvent(lines) {
    if (!lines.length) return;
    const dataParts = this.extractDataParts(lines);
    if (!dataParts.length) return;
    this.dispatchEventPayload(dataParts.join('\n'));
  }

  buildEventKey(payload) {
    if (!payload || typeof payload !== 'object') return '';
    return [
      stringField(payload.type),
      stringField(payload.chat_id),
      stringField(payload.message_id),
      stringField(payload.user_id),
      stringField(payload.ts),
      stringField(payload.data?.seq),
    ].join('|');
  }

  isKnownDuplicate(key) {
    if (!key || key === '||||') return false;
    const existing = this.seenEventKeys.get(key);
    return existing && Date.now() - existing < DUPLICATE_TTL_MS;
  }

  compactEventKeysIfNeeded() {
    if (this.seenEventKeys.size <= 1000) return;
    const now = Date.now();
    const ttlMs = 120000;
    for (const [k, t] of this.seenEventKeys.entries()) {
      if (now - t >= ttlMs) this.seenEventKeys.delete(k);
    }
  }

  recordEventKey(key) {
    this.seenEventKeys.set(key, Date.now());
    this.compactEventKeysIfNeeded();
  }

  isDuplicateEvent(payload) {
    const key = this.buildEventKey(payload);
    if (!key) return false;
    if (this.isKnownDuplicate(key)) return true;
    this.recordEventKey(key);
    return false;
  }

  setOnEvent(onEvent) {
    this.onEvent = onEvent;
  }

  scheduleReconnect(forceDelayMs = null) {
    if (this.closedManually || this.reconnectTimer) return;

    const delay =
      forceDelayMs ??
      (this.failureCount > 0
        ? Math.min(this.reconnectDelayMs * Math.max(this.failureCount, 1), MAX_RECONNECT_DELAY_MS)
        : this.reconnectDelayMs);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, MAX_BACKOFF_DELAY_MS);
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
    this.eventSource = null;
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

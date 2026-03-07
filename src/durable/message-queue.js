import { sseData, sseHeaders } from '../utils/response.js';

const KEEPALIVE_INTERVAL_MS = 15000;
const MAX_EVENT_BYTES = 64 * 1024;

export class MessageQueueDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.encoder = new TextEncoder();
    this.sessions = new Map();
    this.keepAliveTimer = null;
  }

  async fetch(req) {
    const url = new URL(req.url);

    if ((req.method === 'GET' || req.method === 'POST') && url.pathname === '/connect') {
      return this.handleConnect(req);
    }

    if (req.method === 'POST' && url.pathname === '/publish') {
      return this.handlePublish(req);
    }

    return new Response('Not found', { status: 404 });
  }

  handleConnect(req) {
    const clientSessionId = this.getClientSessionId(req);
    this.closeSession(clientSessionId);

    const readable = new ReadableStream({
      start: (controller) => {
        this.sessions.set(clientSessionId, controller);
        controller.enqueue(this.encoder.encode(':\n\n'));
        this.ensureKeepAlive();
      },
      cancel: () => {
        this.removeSession(clientSessionId);
      },
    });

    return new Response(readable, {
      headers: sseHeaders(req, {
        'X-Accel-Buffering': 'no',
      }),
    });
  }

  async handlePublish(req) {
    let event;
    try {
      event = await req.json();
    } catch {
      return Response.json({ error: 'invalid_json' }, { status: 400 });
    }

    if (!event || typeof event !== 'object') {
      return Response.json({ error: 'invalid_event' }, { status: 400 });
    }

    if (!String(event.type || '').trim()) {
      return Response.json({ error: 'missing_type' }, { status: 400 });
    }

    const payload = sseData(event);
    const bytes = this.encoder.encode(payload);
    if (bytes.byteLength > MAX_EVENT_BYTES) {
      return Response.json({ error: 'event_too_large' }, { status: 413 });
    }

    let delivered = 0;
    for (const [sessionId, controller] of this.sessions.entries()) {
      try {
        controller.enqueue(bytes);
        delivered += 1;
      } catch {
        this.removeSession(sessionId);
      }
    }

    return Response.json({ ok: true, delivered });
  }

  getClientSessionId(req) {
    const raw = String(req.headers.get('x-client-session-id') || '').trim();
    const cleaned = raw.replace(/[\x00-\x1F\x7F]/g, '').slice(0, 200);
    return cleaned || crypto.randomUUID();
  }

  ensureKeepAlive() {
    if (this.keepAliveTimer || this.sessions.size === 0) return;
    this.keepAliveTimer = setInterval(() => {
      const bytes = this.encoder.encode(':\n\n');
      for (const [sessionId, controller] of this.sessions.entries()) {
        try {
          controller.enqueue(bytes);
        } catch {
          this.removeSession(sessionId);
        }
      }
    }, KEEPALIVE_INTERVAL_MS);
  }

  removeSession(sessionId) {
    const existed = this.sessions.delete(sessionId);
    if (existed && this.sessions.size === 0) {
      this.stopKeepAlive();
    }
  }

  closeSession(sessionId) {
    const controller = this.sessions.get(sessionId);
    if (!controller) return;
    try {
      controller.close();
    } catch {
    }
    this.removeSession(sessionId);
  }

  stopKeepAlive() {
    if (!this.keepAliveTimer) return;
    clearInterval(this.keepAliveTimer);
    this.keepAliveTimer = null;
  }
}

import { describe, expect, it, vi, beforeEach } from 'vitest';

const assetFetch = vi.fn();

vi.mock('./bootstrap/router-registry.js', () => ({
  API_ROUTES: [],
  isPublicRoute: () => false,
}));

vi.mock('./bootstrap/worker-context.js', () => ({
  getPath: (req) => new URL(req.url).pathname,
  loadUserAccountStatus: vi.fn(),
  loadPrimaryRole: vi.fn(),
  resolveAuthUser: vi.fn(),
  touchLastActive: vi.fn(),
  validateRouteBindings: vi.fn(() => null),
}));

vi.mock('./utils/response.js', () => ({
  error: (_req, message, status) => new Response(message, { status }),
  preflight: () => new Response(null, { status: 204 }),
}));

vi.mock('./utils/sri-hashes.js', () => ({
  getSriHashes: vi.fn(async () => ({})),
  injectSriHashes: vi.fn((html) => html),
}));

vi.mock('./durable/message-queue.js', () => ({
  MessageQueueDO: class {},
}));

import worker from './index.js';

beforeEach(() => {
  assetFetch.mockReset();
  assetFetch.mockImplementation(async (request) => {
    const path = new URL(request.url).pathname;
    if (path === '/') {
      return new Response('<!doctype html><html><body>root</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
    return new Response(null, {
      status: 307,
      headers: { Location: '/' },
    });
  });
});

describe('worker spa routing', () => {
  it('suppresses incoming logs for chrome devtools probe requests', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await worker.fetch(
      new Request('https://example.com/.well-known/appspecific/com.chrome.devtools.json'),
      { ASSETS: { fetch: assetFetch } },
      { waitUntil: vi.fn() }
    );

    expect(logSpy).not.toHaveBeenCalledWith(
      '[Worker] Incoming request:',
      '/.well-known/appspecific/com.chrome.devtools.json',
      'GET'
    );

    logSpy.mockRestore();
  });

  it('serves the root html for admin routes instead of the pages redirect', async () => {
    const response = await worker.fetch(
      new Request('https://example.com/admin/users/overview'),
      { ASSETS: { fetch: assetFetch } },
      { waitUntil: vi.fn() }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    await expect(response.text()).resolves.toContain('root');
    expect(assetFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://example.com/admin/users/overview',
      })
    );
    expect(assetFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://example.com/',
      })
    );
  });
});

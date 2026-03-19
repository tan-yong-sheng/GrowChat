import { describe, it, expect, beforeEach } from 'vitest';
import { json, error, preflight, sseHeaders, sseData, jsonCached, createWeakEtag } from './response.js';

describe('response.js - HTTP Response Helpers', () => {
  let mockRequest;

  beforeEach(() => {
    mockRequest = {
      headers: new Map(),
    };
  });

  describe('json', () => {
    it('should return JSON response with default 200 status', () => {
      const data = { id: '123', name: 'Test' };
      const response = json(mockRequest, data);

      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });

    it('should return JSON response with custom status', () => {
      const data = { error: 'Not found' };
      const response = json(mockRequest, data, 404);

      expect(response.status).toBe(404);
    });

    it('should serialize data to JSON string', async () => {
      const data = { user: { id: '1', email: 'test@example.com' } };
      const response = json(mockRequest, data);
      const body = await response.text();

      expect(JSON.parse(body)).toEqual(data);
    });

    it('should merge custom headers', () => {
      const data = { ok: true };
      const customHeaders = { 'X-Custom': 'value' };
      const response = json(mockRequest, data, 200, customHeaders);

      expect(response.headers.get('X-Custom')).toBe('value');
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });

    it('should include Origin header when Origin is in request', () => {
      mockRequest.headers.set('Origin', 'https://example.com');
      const response = json(mockRequest, { ok: true });

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
      expect(response.headers.get('Vary')).toBe('Origin');
    });

    it('should not include Origin headers when request has no Origin', () => {
      const response = json(mockRequest, { ok: true });

      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('should handle arrays', async () => {
      const data = [{ id: '1' }, { id: '2' }];
      const response = json(mockRequest, data);
      const body = await response.text();

      expect(JSON.parse(body)).toEqual(data);
    });

    it('should handle null and undefined values', () => {
      const response1 = json(mockRequest, null);
      const response2 = json(mockRequest, undefined);

      expect(response1).toBeInstanceOf(Response);
      expect(response2).toBeInstanceOf(Response);
    });

    it('should handle various HTTP status codes', () => {
      const statuses = [200, 201, 400, 401, 403, 404, 409, 500];

      statuses.forEach((status) => {
        const response = json(mockRequest, {}, status);
        expect(response.status).toBe(status);
      });
    });
  });

  describe('error', () => {
    it('should return error response with 500 status by default', async () => {
      const response = error(mockRequest, 'Internal server error');

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBe('Internal server error');
    });

    it('should return error response with custom status', async () => {
      const response = error(mockRequest, 'Not found', 404);

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toBe('Not found');
    });

    it('should include details when provided', async () => {
      const details = { field: 'email', reason: 'already registered' };
      const response = error(mockRequest, 'Validation error', 400, details);

      const body = await response.json();
      expect(body.error).toBe('Validation error');
      expect(body.details).toEqual(details);
    });

    it('should exclude details when not provided', async () => {
      const response = error(mockRequest, 'Error message', 400, undefined);

      const body = await response.json();
      expect(body.error).toBe('Error message');
      expect(body.details).toBeUndefined();
    });

    it('should include Origin header when set', () => {
      mockRequest.headers.set('Origin', 'https://example.com');
      const response = error(mockRequest, 'Unauthorized', 401);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
    });

    it('should work with common error codes', async () => {
      const testCases = [
        { msg: 'Bad request', status: 400 },
        { msg: 'Unauthorized', status: 401 },
        { msg: 'Forbidden', status: 403 },
        { msg: 'Not found', status: 404 },
        { msg: 'Conflict', status: 409 },
        { msg: 'Server error', status: 500 },
        { msg: 'Service unavailable', status: 503 },
      ];

      for (const testCase of testCases) {
        const response = error(mockRequest, testCase.msg, testCase.status);
        expect(response.status).toBe(testCase.status);
        const body = await response.json();
        expect(body.error).toBe(testCase.msg);
      }
    });
  });

  describe('preflight', () => {
    it('should return 204 No Content response', () => {
      const response = preflight(mockRequest);

      expect(response.status).toBe(204);
      expect(response.headers.get('Content-Type')).toBeNull();
    });

    it('should include CORS headers', () => {
      mockRequest.headers.set('Origin', 'https://example.com');
      const response = preflight(mockRequest);

      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET,POST,PUT,DELETE,OPTIONS');
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
      expect(response.headers.get('Access-Control-Max-Age')).toBe('86400');
    });

    it('should include Origin from request', () => {
      mockRequest.headers.set('Origin', 'https://example.com');
      const response = preflight(mockRequest);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
      expect(response.headers.get('Vary')).toBe('Origin');
    });

    it('should handle missing Origin', () => {
      const response = preflight(mockRequest);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
      expect(response.headers.get('Access-Control-Allow-Methods')).toBeTruthy();
    });
  });

  describe('sseHeaders', () => {
    it('should return SSE headers object', () => {
      const headers = sseHeaders(mockRequest);

      expect(headers['Content-Type']).toBe('text/event-stream; charset=utf-8');
      expect(headers['Cache-Control']).toBe('no-cache, no-transform');
      expect(headers['Connection']).toBe('keep-alive');
    });

    it('should include Origin header when set', () => {
      mockRequest.headers.set('Origin', 'https://example.com');
      const headers = sseHeaders(mockRequest);

      expect(headers['Access-Control-Allow-Origin']).toBe('https://example.com');
      expect(headers['Vary']).toBe('Origin');
    });

    it('should merge extra headers', () => {
      const extra = { 'X-Custom-Header': 'value' };
      const headers = sseHeaders(mockRequest, extra);

      expect(headers['X-Custom-Header']).toBe('value');
      expect(headers['Content-Type']).toBe('text/event-stream; charset=utf-8');
    });

    it('should not include Origin when request has no Origin', () => {
      const headers = sseHeaders(mockRequest);

      expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
    });

    it('should be a plain object', () => {
      const headers = sseHeaders(mockRequest);

      expect(typeof headers).toBe('object');
      expect(headers instanceof Response).toBe(false);
    });
  });

  describe('sseData', () => {
    it('should format object payload as SSE line', () => {
      const payload = { response: 'Hello world' };
      const result = sseData(payload);

      expect(result).toBe('data: {"response":"Hello world"}\n\n');
    });

    it('should format string payload as SSE line', () => {
      const payload = 'some text';
      const result = sseData(payload);

      expect(result).toBe('data: some text\n\n');
    });

    it('should handle complex objects', () => {
      const payload = {
        event: 'message',
        data: { tokens: ['Hello', ' ', 'world'] },
        timestamp: 1234567890,
      };
      const result = sseData(payload);

      expect(result).toContain('data: ');
      expect(result).toContain('event');
      expect(result).toContain('message');
      expect(result.endsWith('\n\n')).toBe(true);
    });

    it('should handle empty strings', () => {
      const result = sseData('');

      expect(result).toBe('data: \n\n');
    });

    it('should handle special characters in strings', () => {
      const payload = 'Line with "quotes" and \'apostrophes\'';
      const result = sseData(payload);

      expect(result).toBe(`data: ${payload}\n\n`);
    });

    it('should handle JSON serialization of nested structures', () => {
      const payload = {
        choices: [
          { delta: { content: 'token1' } },
          { delta: { content: 'token2' } },
        ],
      };
      const result = sseData(payload);

      expect(result).toContain('data: ');
      expect(result).toContain('choices');
      expect(result.endsWith('\n\n')).toBe(true);
    });

    it('should maintain double newline terminator', () => {
      const results = [
        sseData('test1'),
        sseData({ key: 'value' }),
        sseData(''),
      ];

      results.forEach((result) => {
        expect(result).toMatch(/\n\n$/);
      });
    });
  });

  describe('jsonCached', () => {
    it('returns cached 304 response when If-None-Match matches', async () => {
      const etag = createWeakEtag('payload');
      mockRequest.headers.set('If-None-Match', etag);
      const response = jsonCached(mockRequest, { ok: true }, {
        etag,
        cacheControl: 'private, max-age=30',
        vary: 'Authorization',
      });

      expect(response.status).toBe(304);
      expect(response.headers.get('ETag')).toBe(etag);
      expect(response.headers.get('Cache-Control')).toBe('private, max-age=30');
      const body = await response.text();
      expect(body).toBe('');
    });

    it('returns JSON payload when cache is stale', async () => {
      const etag = createWeakEtag('payload');
      const response = jsonCached(mockRequest, { ok: true }, {
        etag,
        cacheControl: 'private, max-age=30',
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('ETag')).toBe(etag);
      const body = await response.json();
      expect(body).toEqual({ ok: true });
    });

    it('merges Vary headers with Origin', () => {
      const etag = createWeakEtag('payload');
      mockRequest.headers.set('Origin', 'https://example.com');
      const response = jsonCached(mockRequest, { ok: true }, {
        etag,
        cacheControl: 'private, max-age=30',
        vary: 'Authorization',
      });

      const vary = response.headers.get('Vary');
      expect(vary).toContain('Origin');
      expect(vary).toContain('Authorization');
    });
  });

  describe('createWeakEtag', () => {
    it('returns deterministic weak ETags', () => {
      const first = createWeakEtag('alpha');
      const second = createWeakEtag('alpha');
      expect(first).toBe(second);
    });

    it('returns different tags for different inputs', () => {
      const first = createWeakEtag('alpha');
      const second = createWeakEtag('beta');
      expect(first).not.toBe(second);
    });
  });

  describe('Integration', () => {
    it('should work together for error response with SSE', () => {
      mockRequest.headers.set('Origin', 'https://example.com');
      const errorResponse = error(mockRequest, 'LLM unavailable', 503);

      expect(errorResponse.status).toBe(503);
      expect(errorResponse.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
    });

    it('should create consistent CORS headers across response types', () => {
      mockRequest.headers.set('Origin', 'https://example.com');

      const jsonResp = json(mockRequest, { ok: true });
      const errorResp = error(mockRequest, 'Error');
      const preflightResp = preflight(mockRequest);

      expect(jsonResp.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
      expect(errorResp.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
      expect(preflightResp.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
    });
  });
});

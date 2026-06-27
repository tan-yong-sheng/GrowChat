import { describe, expect, it } from 'vitest';
import { API_ROUTES, PUBLIC_ROUTES, isPublicRoute } from './router-registry.js';

describe('router-registry', () => {
  // --- API_ROUTES ---

  describe('API_ROUTES', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(API_ROUTES)).toBe(true);
      expect(API_ROUTES.length).toBeGreaterThan(0);
    });

    it('contains 12 routers', () => {
      expect(API_ROUTES.length).toBe(12);
    });

    it('each router is a function', () => {
      for (const router of API_ROUTES) {
        expect(typeof router).toBe('function');
      }
    });
  });

  // --- PUBLIC_ROUTES ---

  describe('PUBLIC_ROUTES', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(PUBLIC_ROUTES)).toBe(true);
      expect(PUBLIC_ROUTES.length).toBeGreaterThan(0);
    });

    it('each route has method, path, and description', () => {
      for (const route of PUBLIC_ROUTES) {
        expect(typeof route.method).toBe('string');
        expect(typeof route.path === 'string' || route.path instanceof RegExp).toBe(true);
        expect(typeof route.description).toBe('string');
      }
    });

    it('contains auth routes with string paths', () => {
      const authRoutes = PUBLIC_ROUTES.filter(
        (r) => r.method === 'POST' && r.path.startsWith('/api/auth/')
      );
      expect(authRoutes.length).toBeGreaterThanOrEqual(3);
    });

    it('contains health check route', () => {
      const health = PUBLIC_ROUTES.find((r) => r.method === 'GET' && r.path === '/api/health');
      expect(health).toBeDefined();
      expect(health.description).toBe('Health check');
    });

    it('contains model routes (mixed string and RegExp paths)', () => {
      const modelRoutes = PUBLIC_ROUTES.filter((r) => r.path.toString().includes('models'));
      expect(modelRoutes.length).toBe(2);
    });

    it('contains shared chat view route with RegExp path', () => {
      // The shared chat route is the GET route whose path is a RegExp matching /s/{id}
      const shareRoute = PUBLIC_ROUTES.find(
        (r) => r.method === 'GET' && r.path instanceof RegExp && r.path.test('/s/abc123')
      );
      expect(shareRoute).toBeDefined();
      expect(shareRoute.description).toBe('View shared chat');
    });
  });

  // --- isPublicRoute ---

  describe('isPublicRoute', () => {
    const makeReq = (method) => ({ method });

    it('returns true for exact string path match with correct method', () => {
      const req = makeReq('GET');
      expect(isPublicRoute(req, '/api/health')).toBe(true);
    });

    it('returns false for string path with wrong method', () => {
      const req = makeReq('POST');
      expect(isPublicRoute(req, '/api/health')).toBe(false);
    });

    it('returns false for unlisted path with correct method', () => {
      const req = makeReq('GET');
      expect(isPublicRoute(req, '/api/users/me')).toBe(false);
    });

    it('handles method case insensitivity via toUpperCase', () => {
      // The function normalizes method to uppercase, so lowercase should work
      const req = makeReq('get');
      expect(isPublicRoute(req, '/api/health')).toBe(true);
    });

    it('matches RegExp paths', () => {
      const req = makeReq('GET');
      expect(isPublicRoute(req, '/s/abc123shared')).toBe(true);
    });

    it('returns false for RegExp path with wrong method', () => {
      const req = makeReq('POST');
      expect(isPublicRoute(req, '/s/abc123shared')).toBe(false);
    });

    it('returns false for RegExp path that does not match', () => {
      const req = makeReq('GET');
      expect(isPublicRoute(req, '/s/')).toBe(false);
    });

    it('returns false for path not matching any route', () => {
      const req = makeReq('POST');
      expect(isPublicRoute(req, '/api/nonexistent')).toBe(false);
    });

    it('returns false for empty path', () => {
      const req = makeReq('GET');
      expect(isPublicRoute(req, '')).toBe(false);
    });

    it('returns false for method not in PUBLIC_ROUTES', () => {
      const req = makeReq('DELETE');
      expect(isPublicRoute(req, '/api/auth/login')).toBe(false);
    });

    it('handles auth register endpoint', () => {
      const req = makeReq('POST');
      expect(isPublicRoute(req, '/api/auth/register')).toBe(true);
    });

    it('handles auth login endpoint', () => {
      const req = makeReq('POST');
      expect(isPublicRoute(req, '/api/auth/login')).toBe(true);
    });

    it('handles auth refresh endpoint', () => {
      const req = makeReq('POST');
      expect(isPublicRoute(req, '/api/auth/refresh')).toBe(true);
    });

    it('handles auth logout endpoint', () => {
      const req = makeReq('POST');
      expect(isPublicRoute(req, '/api/auth/logout')).toBe(true);
    });

    it('handles verify email endpoint', () => {
      const req = makeReq('GET');
      expect(isPublicRoute(req, '/api/auth/verify-email')).toBe(true);
    });

    it('handles resend verification endpoint', () => {
      const req = makeReq('POST');
      expect(isPublicRoute(req, '/api/auth/resend-verification')).toBe(true);
    });

    it('handles MCP OAuth callback endpoint', () => {
      const req = makeReq('GET');
      expect(isPublicRoute(req, '/api/users/me/resources/mcp-servers/oauth/callback')).toBe(true);
    });

    it('handles model list endpoint', () => {
      const req = makeReq('GET');
      expect(isPublicRoute(req, '/api/models')).toBe(true);
    });

    it('handles model get-by-id endpoint with ID in path', () => {
      const req = makeReq('GET');
      expect(isPublicRoute(req, '/api/models/gpt-4o')).toBe(true);
      expect(isPublicRoute(req, '/api/models/claude-3-5-sonnet')).toBe(true);
    });

    it('handles shared chat view with various IDs', () => {
      const req = makeReq('GET');
      expect(isPublicRoute(req, '/s/abc123')).toBe(true);
      expect(isPublicRoute(req, '/s/xyz789-abc')).toBe(true);
    });

    it('returns false for shared chat path with wrong method', () => {
      const req = makeReq('POST');
      expect(isPublicRoute(req, '/s/abc123')).toBe(false);
    });

    it('matches method case-insensitively', () => {
      // Test with a GET route that exists in PUBLIC_ROUTES
      const req = makeReq('GET');
      expect(isPublicRoute(req, '/api/health')).toBe(true);

      const lowerReq = makeReq('get');
      expect(isPublicRoute(lowerReq, '/api/health')).toBe(true);
    });

    it('returns false for path that partially matches a route', () => {
      const req = makeReq('GET');
      // /api/health doesn't match /api/healthcheck
      expect(isPublicRoute(req, '/api/healthcheck')).toBe(false);
    });

    it('throws when method is missing from request', () => {
      const req = {};
      expect(() => isPublicRoute(req, '/api/health')).toThrow();
    });

    it('handles POST /api/chats (not public)', () => {
      const req = makeReq('POST');
      // This path is NOT in PUBLIC_ROUTES
      expect(isPublicRoute(req, '/api/chats')).toBe(false);
    });
  });
});

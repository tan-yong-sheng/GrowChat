import { describe, expect, it } from 'vitest';
import { API_ROUTES, PUBLIC_ROUTES, isPublicRoute } from './router-registry.js';

describe('API_ROUTES', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(API_ROUTES)).toBe(true);
    expect(API_ROUTES.length).toBeGreaterThan(0);
  });
});

describe('PUBLIC_ROUTES', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(PUBLIC_ROUTES)).toBe(true);
    expect(PUBLIC_ROUTES.length).toBeGreaterThan(0);
  });

  it('each route has method, path, and description', () => {
    for (const route of PUBLIC_ROUTES) {
      expect(route).toHaveProperty('method');
      expect(route).toHaveProperty('path');
      expect(route).toHaveProperty('description');
      expect(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).toContain(route.method);
    }
  });

  it('includes auth routes as public', () => {
    const authRoutes = PUBLIC_ROUTES.filter(
      (r) => typeof r.path === 'string' && r.path.startsWith('/api/auth')
    );
    expect(authRoutes.length).toBeGreaterThan(0);
  });

  it('includes health check as public', () => {
    const health = PUBLIC_ROUTES.find((r) => r.path === '/api/health');
    expect(health).toBeDefined();
    expect(health.method).toBe('GET');
  });

  it('includes shared chat route with regex path', () => {
    const shared = PUBLIC_ROUTES.find(
      (r) => r.path instanceof RegExp && r.description.includes('shared')
    );
    expect(shared).toBeDefined();
  });

  it('includes model list route', () => {
    const models = PUBLIC_ROUTES.find((r) => r.path === '/api/models');
    expect(models).toBeDefined();
  });
});

describe('isPublicRoute', () => {
  it('returns true for public GET routes', () => {
    expect(isPublicRoute({ method: 'GET' }, '/api/health')).toBe(true);
    expect(isPublicRoute({ method: 'GET' }, '/api/models')).toBe(true);
  });

  it('returns true for public POST routes', () => {
    expect(isPublicRoute({ method: 'POST' }, '/api/auth/login')).toBe(true);
    expect(isPublicRoute({ method: 'POST' }, '/api/auth/register')).toBe(true);
  });

  it('returns true for regex-matched routes', () => {
    expect(isPublicRoute({ method: 'GET' }, '/api/models/gpt-4')).toBe(true);
    expect(isPublicRoute({ method: 'GET' }, '/s/abc123')).toBe(true);
  });

  it('returns false for unmatched paths', () => {
    expect(isPublicRoute({ method: 'GET' }, '/api/chats')).toBe(false);
    expect(isPublicRoute({ method: 'POST' }, '/api/chats')).toBe(false);
  });

  it('returns false when method does not match', () => {
    expect(isPublicRoute({ method: 'DELETE' }, '/api/auth/login')).toBe(false);
    expect(isPublicRoute({ method: 'PUT' }, '/api/health')).toBe(false);
  });

  it('returns false for regex non-matching paths', () => {
    expect(isPublicRoute({ method: 'GET' }, '/api/models/gpt-4/extra')).toBe(false);
    expect(isPublicRoute({ method: 'GET' }, '/s/')).toBe(false);
  });

  it('returns false for non-public paths with correct method', () => {
    expect(isPublicRoute({ method: 'GET' }, '/api/users')).toBe(false);
    expect(isPublicRoute({ method: 'POST' }, '/api/files/upload')).toBe(false);
  });

  it('handles case-insensitive method matching (toUpperCase)', () => {
    // isPublicRoute calls toUpperCase() on the method
    expect(isPublicRoute({ method: 'get' }, '/api/health')).toBe(true);
  });

  it('returns true for OAuth callback route', () => {
    expect(
      isPublicRoute({ method: 'GET' }, '/api/users/me/resources/mcp-servers/oauth/callback')
    ).toBe(true);
  });
});

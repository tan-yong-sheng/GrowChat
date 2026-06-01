import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getConfigValue: vi.fn(),
  setConfigValue: vi.fn(),
}));

vi.mock('../utils/app-config.js', () => ({
  getConfigValue: (...args) => mocks.getConfigValue(...args),
  setConfigValue: (...args) => mocks.setConfigValue(...args),
}));

import {
  isValidHttpUrl,
  mergeToolServer,
  mergeToolSpecs,
  parseHeadersForRequest,
} from './tool-servers.js';

describe('CodeRabbit / GitHub Actions review regression tests', () => {
  // --- isValidHttpUrl: CodeRabbit Minor, Quick Win ---

  it('isValidHttpUrl rejects malformed URLs like bare https://', () => {
    expect(isValidHttpUrl('https://')).toBe(false);
    expect(isValidHttpUrl('http://')).toBe(false);
    expect(isValidHttpUrl('https:// bad-host')).toBe(false);
    expect(isValidHttpUrl('not-a-url')).toBe(false);
    expect(isValidHttpUrl('')).toBe(false);
    expect(isValidHttpUrl(null)).toBe(false);
    expect(isValidHttpUrl(undefined)).toBe(false);
  });

  it('isValidHttpUrl accepts valid URLs', () => {
    expect(isValidHttpUrl('https://valid.example.com')).toBe(true);
    expect(isValidHttpUrl('http://localhost:3000')).toBe(true);
    expect(isValidHttpUrl('https://api.example.com/v1/mcp')).toBe(true);
  });

  // --- mergeToolServer: CodeRabbit Major, Quick Win ---

  it('mergeToolServer preserves existing auth_type when omitted in incoming', () => {
    const existing = {
      id: 's1',
      auth_type: 'bearer',
      auth_bearer_token: 'my-token',
      enabled: false,
    };
    const result = mergeToolServer(existing, { name: 'Updated', url: 'https://example.com' });
    // auth_type was NOT in incoming, so existing value should be preserved
    expect(result.auth_type).toBe('bearer');
    expect(result.auth_bearer_token).toBe('my-token');
    // enabled was NOT in incoming, so existing value should be preserved
    expect(result.enabled).toBe(false);
  });

  it('mergeToolServer clears OAuth state when auth_type is explicitly set to none', () => {
    const existing = {
      id: 's1',
      auth_type: 'oauth',
      oauth_tokens: { access_token: 'secret' },
      oauth_state: 'state-123',
      oauth_code_verifier: 'verifier-456',
      oauth_connected_at: '2024-01-01',
    };
    const result = mergeToolServer(existing, { auth_type: 'none' });
    expect(result.auth_type).toBe('none');
    // OAuth tokens/state should be cleared when auth_type is not 'oauth'
    expect(result).not.toHaveProperty('oauth_tokens');
    expect(result).not.toHaveProperty('oauth_state');
    expect(result).not.toHaveProperty('oauth_code_verifier');
    expect(result).not.toHaveProperty('oauth_connected_at');
  });

  it('mergeToolServer preserves existing enabled flag when omitted in incoming', () => {
    const existing = {
      id: 's1',
      name: 'My Server',
      enabled: false,
    };
    const result = mergeToolServer(existing, { name: 'Updated Name' });
    expect(result.enabled).toBe(false);
  });

  it('mergeToolServer applies enabled flag when explicitly provided', () => {
    const existing = {
      id: 's1',
      name: 'My Server',
      enabled: false,
    };
    const result = mergeToolServer(existing, { enabled: true });
    expect(result.enabled).toBe(true);
  });

  // --- mergeToolServer: GitHub Actions #10, headers empty-string fallback ---

  it('mergeToolServer handles empty-string headers without falling back to existing object', () => {
    // Regression: incoming.headers = '' (user clearing textarea) should NOT
    // fall through to existing?.headers if existing headers is an object
    const existing = {
      id: 's1',
      headers: '{"Authorization":"Bearer old"}',
    };
    const result = mergeToolServer(existing, { headers: '' });
    // Empty string is an intentional value — should NOT become [object Object]
    expect(result.headers).toBe('');
    expect(result.headers).not.toBe('[object Object]');
  });

  it('mergeToolServer preserves existing headers when not provided in incoming', () => {
    const existing = {
      id: 's1',
      headers: '{"Authorization":"Bearer old"}',
    };
    const result = mergeToolServer(existing, { name: 'Updated' });
    expect(result.headers).toBe('{"Authorization":"Bearer old"}');
  });

  it('mergeToolServer preserves object headers without coercing to [object Object]', () => {
    const existing = {
      id: 's1',
      headers: '',
    };
    const result = mergeToolServer(existing, {
      headers: { Authorization: 'Bearer test' },
    });
    // Object headers should be preserved as objects, not stringified to "[object Object]"
    expect(typeof result.headers).toBe('object');
    expect(result.headers).toEqual({ Authorization: 'Bearer test' });
    expect(result.headers).not.toBe('[object Object]');
  });

  // --- mergeToolSpecs: existing enabled flag preservation ---

  it('mergeToolSpecs preserves existing enabled=false when incoming omits it', () => {
    const existing = [{ name: 'tool-a', title: 'A', description: '', enabled: false }];
    const discovered = [{ name: 'tool-a', title: 'A New', description: 'Updated' }];
    const result = mergeToolSpecs(existing, discovered);
    expect(result[0].enabled).toBe(false);
    expect(result[0].title).toBe('A New');
  });

  // --- parseHeadersForRequest: verify it handles object and string headers ---

  it('parseHeadersForRequest handles both object and JSON string headers', () => {
    const fromObject = parseHeadersForRequest({ Authorization: 'Bearer x' });
    expect(fromObject).toEqual({ Authorization: 'Bearer x' });

    const fromString = parseHeadersForRequest('{"Authorization":"Bearer y"}');
    expect(fromString).toEqual({ Authorization: 'Bearer y' });

    const fromEmpty = parseHeadersForRequest('');
    expect(fromEmpty).toEqual({});

    const fromNull = parseHeadersForRequest(null);
    expect(fromNull).toEqual({});
  });
});

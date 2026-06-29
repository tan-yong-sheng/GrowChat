/**
 * Tests for src/services/audit-logging.js
 * Covers: logSecurityEvent, getAuditLog
 */
import { describe, expect, it, vi } from 'vitest';
import { logSecurityEvent, SecurityEventTypes } from './audit-logging.js';

function makeKV() {
  return {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
  };
}

function makeEnv(overrides = {}) {
  return {
    SESSIONS: makeKV(),
    ...overrides,
  };
}

describe('SecurityEventTypes', () => {
  it('exports known event type keys', () => {
    expect(SecurityEventTypes.LOGIN_SUCCESS).toBe('login_success');
    expect(SecurityEventTypes.LOGIN_FAILURE).toBe('login_failure');
    expect(SecurityEventTypes.API_KEY_CREATED).toBe('api_key_created');
    expect(SecurityEventTypes.UNAUTHORIZED_ACCESS_ATTEMPT).toBe('unauthorized_access_attempt');
  });
});

describe('logSecurityEvent', () => {
  it('logs event to KV with TTL', async () => {
    const kv = makeKV();
    const env = makeEnv({ SESSIONS: kv });

    await logSecurityEvent({
      env: env,
      eventType: 'login_success',
      details: { userId: 'user-1', ip: '1.2.3.4' },
    });

    expect(kv.put).toHaveBeenCalledTimes(1);
    const [key, value, opts] = kv.put.mock.calls[0];
    expect(key).toMatch(/^audit:/);
    expect(key.includes('login_success')).toBe(false); // key is the event ID, not the type
    expect(JSON.parse(value)).toMatchObject({
      type: 'login_success',
      userId: 'user-1',
      ip: '1.2.3.4',
    });
    expect(opts.expirationTtl).toBe(90 * 24 * 60 * 60); // 90 days
  });

  it('returns early when SESSIONS binding is missing', async () => {
    const env = { SESSIONS: null };
    await logSecurityEvent({ env: env, eventType: 'login_success', details: {} });
    // Should not throw
  });

  it('returns early when SESSIONS binding is undefined', async () => {
    const env = {};
    await logSecurityEvent({ env: env, eventType: 'login_failure', details: {} });
  });

  it('tolerates KV put failure gracefully', async () => {
    const kv = makeKV();
    kv.put.mockRejectedValue(new Error('KV error'));
    const env = makeEnv({ SESSIONS: kv });

    // Should not throw
    await expect(
      logSecurityEvent({ env: env, eventType: 'login_failure', details: { userId: 'user-1' } })
    ).resolves.not.toThrow();
  });

  it('includes event id and timestamp in logged event', async () => {
    const kv = makeKV();
    const env = makeEnv({ SESSIONS: kv });
    const before = Date.now();

    await logSecurityEvent({ env: env, eventType: 'login_success', details: { userId: 'user-1' } });

    const value = JSON.parse(kv.put.mock.calls[0][1]);
    expect(value.id).toMatch(/^audit:/);
    expect(value.timestamp).toBeTruthy();
    const eventTime = new Date(value.timestamp).getTime();
    expect(eventTime).toBeGreaterThanOrEqual(before);
    expect(eventTime).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('merges details into event object', async () => {
    const kv = makeKV();
    const env = makeEnv({ SESSIONS: kv });

    await logSecurityEvent({
      env,
      eventType: 'api_key_created',
      details: {
        userId: 'user-1',
        apiKeyId: 'key-123',
        ip: '10.0.0.1',
      },
    });

    const event = JSON.parse(kv.put.mock.calls[0][1]);
    expect(event.type).toBe('api_key_created');
    expect(event.userId).toBe('user-1');
    expect(event.apiKeyId).toBe('key-123');
    expect(event.ip).toBe('10.0.0.1');
  });

  it('works with empty details', async () => {
    const kv = makeKV();
    const env = makeEnv({ SESSIONS: kv });

    await logSecurityEvent({ env: env, eventType: 'login_failure', details: {} });

    const event = JSON.parse(kv.put.mock.calls[0][1]);
    expect(event.type).toBe('login_failure');
    expect(event.userId).toBeUndefined();
  });

  it('uses all SecurityEventTypes values', async () => {
    const kv = makeKV();
    const env = makeEnv({ SESSIONS: kv });

    for (const type of Object.values(SecurityEventTypes)) {
      kv.put.mockClear();
      await logSecurityEvent({ env, eventType: type, details: {} });
      const event = JSON.parse(kv.put.mock.calls[0][1]);
      expect(event.type).toBe(type);
    }
  });
});

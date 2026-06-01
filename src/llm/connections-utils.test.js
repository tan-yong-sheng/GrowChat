import { describe, expect, it } from 'vitest';
import { stableConnectionId, ensureConnectionId, safeParseHeaders } from './connections-utils.js';

describe('connections-utils: CodeRabbit regression tests', () => {
  it('stableConnectionId produces deterministic IDs for identical connections', () => {
    const conn = {
      providerFamily: 'openai',
      url: 'https://api.openai.com',
      key: 'sk-test',
      headers: '{"Authorization":"Bearer sk-test"}',
    };
    const id1 = stableConnectionId(conn, 0);
    const id2 = stableConnectionId(conn, 0);
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^conn-/);
  });

  it('stableConnectionId does NOT collide when headers are different objects', () => {
    // Regression: object headers used to coerce to "[object Object]"
    const conn1 = {
      providerFamily: 'openai',
      url: 'https://api.openai.com',
      key: 'sk-test',
      headers: { Authorization: 'Bearer token-a' },
    };
    const conn2 = {
      providerFamily: 'openai',
      url: 'https://api.openai.com',
      key: 'sk-test',
      headers: { Authorization: 'Bearer token-b' },
    };
    const id1 = stableConnectionId(conn1, 0);
    const id2 = stableConnectionId(conn2, 0);
    // Different header objects MUST produce different IDs
    expect(id1).not.toBe(id2);
  });

  it('stableConnectionId serializes headers deterministically (sorted keys)', () => {
    // Same headers with different key order should produce the same ID
    const conn1 = {
      providerFamily: 'openai',
      url: 'https://api.openai.com',
      key: 'sk-test',
      headers: { B: '2', A: '1' },
    };
    const conn2 = {
      providerFamily: 'openai',
      url: 'https://api.openai.com',
      key: 'sk-test',
      headers: { A: '1', B: '2' },
    };
    const id1 = stableConnectionId(conn1, 0);
    const id2 = stableConnectionId(conn2, 0);
    expect(id1).toBe(id2);
  });

  it('stableConnectionId with string headers still works', () => {
    const conn = {
      providerFamily: 'openai',
      url: 'https://api.openai.com',
      key: 'sk-test',
      headers: '{"Authorization":"Bearer token"}',
    };
    const id = stableConnectionId(conn, 0);
    expect(id).toMatch(/^conn-/);
  });

  it('ensureConnectionId uses existing id if present', () => {
    const conn = { id: 'conn-existing', providerFamily: 'openai', url: '', key: '' };
    expect(ensureConnectionId(conn, 0)).toBe('conn-existing');
  });

  it('ensureConnectionId falls back to stableConnectionId when no id', () => {
    const conn = { providerFamily: 'openai', url: 'https://api.openai.com', key: 'sk-test' };
    const id = ensureConnectionId(conn, 0);
    expect(id).toMatch(/^conn-/);
  });

  // --- safeParseHeaders ---

  it('safeParseHeaders handles various input types', () => {
    expect(safeParseHeaders(null)).toEqual({});
    expect(safeParseHeaders(undefined)).toEqual({});
    expect(safeParseHeaders('')).toEqual({});
    expect(safeParseHeaders('{"a":"1"}')).toEqual({ a: '1' });
    expect(safeParseHeaders({ b: '2' })).toEqual({ b: '2' });
    expect(safeParseHeaders('invalid json')).toEqual({});
    expect(safeParseHeaders([])).toEqual({});
  });
});

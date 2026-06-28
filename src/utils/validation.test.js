import { describe, it, expect } from 'vitest';
import { isSafeOutboundUrl } from './validation.js';

describe('isSafeOutboundUrl', () => {
  it('allows public HTTPS URLs', () => {
    expect(isSafeOutboundUrl('https://api.openai.com/v1/models')).toEqual({ safe: true });
    expect(isSafeOutboundUrl('https://generativelanguage.googleapis.com/')).toEqual({ safe: true });
    expect(isSafeOutboundUrl('http://example.com/v1')).toEqual({ safe: true });
  });

  it('rejects non-HTTP protocols', () => {
    expect(isSafeOutboundUrl('ftp://example.com/')).toEqual({
      safe: false,
      reason: expect.any(String),
    });
    expect(isSafeOutboundUrl('file:///etc/passwd')).toEqual({
      safe: false,
      reason: expect.any(String),
    });
  });

  it('rejects invalid URLs', () => {
    expect(isSafeOutboundUrl('not-a-url')).toEqual({ safe: false, reason: 'Invalid URL' });
    expect(isSafeOutboundUrl('')).toEqual({ safe: false, reason: 'Invalid URL' });
  });

  it('blocks localhost', () => {
    const result = isSafeOutboundUrl('http://localhost:8080/v1/models');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('internal');
  });

  it('blocks loopback addresses (127.x.x.x)', () => {
    const result = isSafeOutboundUrl('http://127.0.0.1:8899/models');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('Loopback');
  });

  it('blocks RFC1918 private addresses (10.x.x.x)', () => {
    const result = isSafeOutboundUrl('http://10.0.0.1/v1/models');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('Private');
  });

  it('blocks RFC1918 private addresses (172.16-31.x.x)', () => {
    expect(isSafeOutboundUrl('http://172.16.0.1/v1').safe).toBe(false);
    expect(isSafeOutboundUrl('http://172.31.255.1/v1').safe).toBe(false);
    expect(isSafeOutboundUrl('http://172.32.0.1/v1').safe).toBe(true);
  });

  it('blocks RFC1918 private addresses (192.168.x.x)', () => {
    const result = isSafeOutboundUrl('http://192.168.1.1/v1/models');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('Private');
  });

  it('blocks link-local / cloud metadata (169.254.x.x)', () => {
    const result = isSafeOutboundUrl('http://169.254.169.254/latest/meta-data/');
    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/internal|Link-local/i);
  });

  it('blocks AWS/GCP/Azure metadata hostname directly', () => {
    const result = isSafeOutboundUrl('http://169.254.169.254/computeMetadata/v1/');
    expect(result.safe).toBe(false);
  });

  it('blocks 0.0.0.0', () => {
    const result = isSafeOutboundUrl('http://0.0.0.0/v1/models');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('Unspecified');
  });

  it('blocks carrier-grade NAT (100.64-127.x.x)', () => {
    expect(isSafeOutboundUrl('http://100.64.0.1/v1').safe).toBe(false);
    expect(isSafeOutboundUrl('http://100.127.255.1/v1').safe).toBe(false);
    expect(isSafeOutboundUrl('http://100.63.0.1/v1').safe).toBe(true);
  });

  it('blocks multicast addresses (224-239.x.x.x)', () => {
    expect(isSafeOutboundUrl('http://224.0.0.1/v1').safe).toBe(false);
    expect(isSafeOutboundUrl('http://239.255.255.1/v1').safe).toBe(false);
  });

  it('blocks reserved addresses (240+)', () => {
    expect(isSafeOutboundUrl('http://240.0.0.1/v1').safe).toBe(false);
    expect(isSafeOutboundUrl('http://255.255.255.255/v1').safe).toBe(false);
  });

  it('blocks IPv6 loopback', () => {
    expect(isSafeOutboundUrl('http://[::1]/v1/models').safe).toBe(false);
  });

  it('blocks IPv6 link-local', () => {
    expect(isSafeOutboundUrl('http://[fe80::1]/v1/models').safe).toBe(false);
  });

  it('blocks IPv6 unique local addresses (fc00::/7)', () => {
    expect(isSafeOutboundUrl('http://[fc00::1]/v1/models').safe).toBe(false);
    expect(isSafeOutboundUrl('http://[fd00::1]/v1/models').safe).toBe(false);
    expect(isSafeOutboundUrl('http://[fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff]/v1').safe).toBe(
      false
    );
  });

  it('blocks obfuscated IP addresses', () => {
    // Hex-encoded IP (0x7f000001 = 127.0.0.1)
    expect(isSafeOutboundUrl('http://0x7f000001/v1').safe).toBe(false);
    // Octal-encoded IP
    expect(isSafeOutboundUrl('http://017700000001/v1').safe).toBe(false);
    // Decimal-encoded IP (2130706433 = 127.0.0.1)
    expect(isSafeOutboundUrl('http://2130706433/v1').safe).toBe(false);
  });

  it('allows public IP addresses', () => {
    expect(isSafeOutboundUrl('https://1.1.1.1/v1').safe).toBe(true);
    expect(isSafeOutboundUrl('https://8.8.8.8/v1').safe).toBe(true);
    expect(isSafeOutboundUrl('https://104.18.6.192/v1').safe).toBe(true);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ResendPlugin } from '../../src/services/email/plugins/resend-plugin.js';

describe('ResendPlugin', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with API key', () => {
      const plugin = new ResendPlugin({ apiKey: 'test-key-123' });
      expect(plugin.apiKey).toBe('test-key-123');
    });

    it('should throw without API key', () => {
      expect(() => new ResendPlugin()).toThrow('Resend API key is required');
    });

    it('should throw with empty API key', () => {
      expect(() => new ResendPlugin({ apiKey: '' })).toThrow('Resend API key is required');
    });

    it('should set correct API URL', () => {
      const plugin = new ResendPlugin({ apiKey: 'test-key' });
      expect(plugin.apiUrl).toBe('https://api.resend.com/emails');
    });
  });

  describe('send validation', () => {
    let plugin;

    beforeEach(() => {
      plugin = new ResendPlugin({ apiKey: 'test-key' });
    });

    it('should validate required recipient', async () => {
      await expect(plugin.send({ subject: 'Test', html: '<p>Test</p>' })).rejects.toThrow(
        'Email recipient (to) is required'
      );
    });

    it('should validate required subject', async () => {
      await expect(plugin.send({ to: 'test@example.com', html: '<p>Test</p>' })).rejects.toThrow(
        'Email subject is required'
      );
    });

    it('should validate required body (html or text)', async () => {
      await expect(plugin.send({ to: 'test@example.com', subject: 'Test' })).rejects.toThrow(
        'Email body (html or text) is required'
      );
    });

    it('should accept html body', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'email-123' }),
      });

      const result = await plugin.send({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      expect(result.id).toBe('email-123');
    });

    it('should accept text body', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'email-456' }),
      });

      const result = await plugin.send({
        to: 'test@example.com',
        subject: 'Test',
        text: 'Test',
      });

      expect(result.id).toBe('email-456');
    });

    it('should accept both html and text', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'email-789' }),
      });

      const result = await plugin.send({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
        text: 'Test',
      });

      expect(result.id).toBe('email-789');
    });
  });

  describe('send API call', () => {
    let plugin;

    beforeEach(() => {
      plugin = new ResendPlugin({ apiKey: 'test-key-abc' });
    });

    it('should make correct fetch call to Resend API', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'email-123' }),
      });

      await plugin.send({
        to: 'user@example.com',
        subject: 'Password Reset',
        html: '<p>Click here to reset</p>',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': 'Bearer test-key-abc',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'noreply@growchat.app',
            to: 'user@example.com',
            subject: 'Password Reset',
            html: '<p>Click here to reset</p>',
          }),
          signal: expect.any(Object),
        })
      );
    });

    it('should use custom from address when provided', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'email-123' }),
      });

      await plugin.send({
        from: 'support@example.com',
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      const callArgs = global.fetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.from).toBe('support@example.com');
    });

    it('should include text when provided', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'email-123' }),
      });

      await plugin.send({
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
        text: 'Test plain text',
      });

      const callArgs = global.fetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.text).toBe('Test plain text');
    });

    it('should include replyTo when provided', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'email-123' }),
      });

      await plugin.send({
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
        replyTo: 'reply@example.com',
      });

      const callArgs = global.fetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.reply_to).toBe('reply@example.com');
    });

    it('should not include text when not provided', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'email-123' }),
      });

      await plugin.send({
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      const callArgs = global.fetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.text).toBeUndefined();
    });
  });

  describe('error handling', () => {
    let plugin;

    beforeEach(() => {
      plugin = new ResendPlugin({ apiKey: 'test-key' });
    });

    it('should handle API error with message', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        statusText: 'Unauthorized',
        json: async () => ({ message: 'Invalid API key' }),
      });

      await expect(
        plugin.send({
          to: 'test@example.com',
          subject: 'Test',
          html: '<p>Test</p>',
        })
      ).rejects.toThrow('Resend API error: Invalid API key');
    });

    it('should handle API error without message', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        statusText: 'Bad Request',
        json: async () => ({}),
      });

      await expect(
        plugin.send({
          to: 'test@example.com',
          subject: 'Test',
          html: '<p>Test</p>',
        })
      ).rejects.toThrow('Resend API error: Bad Request');
    });

    it('should handle network errors', async () => {
      global.fetch.mockRejectedValue(new Error('Network timeout'));

      await expect(
        plugin.send({
          to: 'test@example.com',
          subject: 'Test',
          html: '<p>Test</p>',
        })
      ).rejects.toThrow('Network timeout');
    });

    it('should return successful response', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'email-123',
          from: 'noreply@growchat.app',
          to: 'test@example.com',
          created_at: '2024-01-01T00:00:00Z',
        }),
      });

      const result = await plugin.send({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      expect(result.id).toBe('email-123');
      expect(result.from).toBe('noreply@growchat.app');
      expect(result.to).toBe('test@example.com');
    });
  });
});

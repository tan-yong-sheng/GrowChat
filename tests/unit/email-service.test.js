import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEmailService } from '../../src/services/email/email-service.js';

describe('Email Service', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createEmailService', () => {
    it('should create service with resend provider', () => {
      const service = createEmailService({
        EMAIL_PROVIDER: 'resend',
        RESEND_API_KEY: 'test-key',
      });

      expect(service).toBeDefined();
      expect(service.send).toBeDefined();
      expect(typeof service.send).toBe('function');
    });

    it('should use resend as default provider', () => {
      const service = createEmailService({
        RESEND_API_KEY: 'test-key',
      });

      expect(service).toBeDefined();
      expect(service.send).toBeDefined();
    });

    it('should throw on unknown provider', () => {
      expect(() =>
        createEmailService({
          EMAIL_PROVIDER: 'unknown-provider',
          RESEND_API_KEY: 'test-key',
        })
      ).toThrow('Unknown email provider: unknown-provider');
    });

    it('should be case-insensitive for provider name', () => {
      const service = createEmailService({
        EMAIL_PROVIDER: 'RESEND',
        RESEND_API_KEY: 'test-key',
      });

      expect(service).toBeDefined();
      expect(service.send).toBeDefined();
    });

    it('should throw when resend provider lacks API key', () => {
      expect(() =>
        createEmailService({
          EMAIL_PROVIDER: 'resend',
        })
      ).toThrow('Resend API key is required');
    });
  });

  describe('service.send', () => {
    let service;

    beforeEach(() => {
      service = createEmailService({
        EMAIL_PROVIDER: 'resend',
        RESEND_API_KEY: 'test-key-123',
      });
    });

    it('should delegate to plugin send method', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'email-123' }),
      });

      const result = await service.send({
        to: 'user@example.com',
        subject: 'Test Email',
        html: '<p>Test content</p>',
      });

      expect(result.id).toBe('email-123');
    });

    it('should pass options correctly to plugin', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'email-456' }),
      });

      await service.send({
        to: 'recipient@example.com',
        subject: 'Password Reset',
        html: '<p>Reset your password</p>',
        text: 'Reset your password',
        from: 'noreply@app.com',
        replyTo: 'support@app.com',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-key-123',
            'Content-Type': 'application/json',
          }),
        })
      );

      const callArgs = global.fetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.to).toBe('recipient@example.com');
      expect(body.subject).toBe('Password Reset');
      expect(body.from).toBe('noreply@app.com');
      expect(body.reply_to).toBe('support@app.com');
    });

    it('should validate required fields', async () => {
      await expect(
        service.send({
          subject: 'Test',
          html: '<p>Test</p>',
        })
      ).rejects.toThrow('Email recipient (to) is required');
    });

    it('should handle plugin errors', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        statusText: 'Unauthorized',
        json: async () => ({ message: 'Invalid API key' }),
      });

      await expect(
        service.send({
          to: 'user@example.com',
          subject: 'Test',
          html: '<p>Test</p>',
        })
      ).rejects.toThrow('Resend API error: Invalid API key');
    });

    it('should return plugin response', async () => {
      const mockResponse = {
        id: 'email-789',
        from: 'noreply@growchat.app',
        to: 'user@example.com',
        created_at: '2024-01-01T00:00:00Z',
      };

      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await service.send({
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      expect(result).toEqual(mockResponse);
    });
  });

  describe('multiple service instances', () => {
    it('should create independent service instances', () => {
      const service1 = createEmailService({
        EMAIL_PROVIDER: 'resend',
        RESEND_API_KEY: 'key-1',
      });

      const service2 = createEmailService({
        EMAIL_PROVIDER: 'resend',
        RESEND_API_KEY: 'key-2',
      });

      expect(service1).not.toBe(service2);
      expect(service1.send).not.toBe(service2.send);
    });
  });
});

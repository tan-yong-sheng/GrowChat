import { describe, expect, it } from 'vitest';
import { APP_LIMITS, APP_TTLS, APP_DEFAULTS } from '../config/app.js';

describe('app config', () => {
  describe('APP_LIMITS', () => {
    it('has maxAttachments', () => {
      expect(APP_LIMITS.maxAttachments).toBeTypeOf('number');
      expect(APP_LIMITS.maxAttachments).toBeGreaterThan(0);
    });

    it('has maxAttachmentBytes', () => {
      expect(APP_LIMITS.maxAttachmentBytes).toBeTypeOf('number');
      expect(APP_LIMITS.maxAttachmentBytes).toBeGreaterThan(0);
    });

    it('has maxAttachmentTotalBytes >= maxAttachmentBytes', () => {
      expect(APP_LIMITS.maxAttachmentTotalBytes).toBeGreaterThanOrEqual(
        APP_LIMITS.maxAttachmentBytes
      );
    });

    it('has maxTextAttachmentChars', () => {
      expect(APP_LIMITS.maxTextAttachmentChars).toBeTypeOf('number');
    });

    it('has pagination limits', () => {
      expect(APP_LIMITS.defaultPageSize).toBeTypeOf('number');
      expect(APP_LIMITS.maxPageSize).toBeGreaterThanOrEqual(APP_LIMITS.defaultPageSize);
    });

    it('has rate limits', () => {
      expect(APP_LIMITS.maxChatSendPerMinute).toBeTypeOf('number');
      expect(APP_LIMITS.maxLoginPerTenMinutes).toBeTypeOf('number');
      expect(APP_LIMITS.maxRegisterPerTenMinutes).toBeTypeOf('number');
      expect(APP_LIMITS.maxFileUploadPerHour).toBeTypeOf('number');
    });
  });

  describe('APP_TTLS', () => {
    it('has accessTokenSeconds', () => {
      expect(APP_TTLS.accessTokenSeconds).toBe(15 * 60); // 15 minutes
    });

    it('has refreshTokenSeconds', () => {
      expect(APP_TTLS.refreshTokenSeconds).toBe(7 * 24 * 60 * 60); // 7 days
    });

    it('has schemaCompatibilityWaitMs', () => {
      expect(APP_TTLS.schemaCompatibilityWaitMs).toBeTypeOf('number');
    });
  });

  describe('APP_DEFAULTS', () => {
    it('has appName', () => {
      expect(APP_DEFAULTS.appName).toBe('GrowChat');
    });

    it('has defaultModelFallback', () => {
      expect(APP_DEFAULTS.defaultModelFallback).toBeTypeOf('string');
    });
  });
});

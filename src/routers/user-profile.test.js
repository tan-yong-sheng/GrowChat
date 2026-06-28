import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  optionalString: vi.fn((v) => v),
  requirePlainObject: vi.fn((v) => v),
}));

vi.mock('../validation/request.js', () => ({
  optionalString: (...args) => mocks.optionalString(...args),
  requirePlainObject: (...args) => mocks.requirePlainObject(...args),
}));

vi.mock('../utils/sanitize.js', () => ({
  stripHtml: vi.fn((v) => v),
  escapeHtml: vi.fn((v) => v),
}));

import {
  serializeUserProfile,
  buildUserProfileResponse,
  buildSelfProfileUpdate,
} from './user-profile.js';
import { ValidationError } from '../errors/http-errors.js';

describe('user-profile', () => {
  describe('serializeUserProfile', () => {
    it('serializes user row to profile', () => {
      const row = {
        id: 'u1',
        email: 'u@e.com',
        name: 'User',
        account_status: 'active',
        settings: '{}',
        avatar: null,
        avatar_emoji: null,
        status: 'online',
        preferences: '{}',
        created_at: 1,
        last_active_at: null,
        updated_at: 1,
      };
      const result = serializeUserProfile(row);
      expect(result.id).toBe('u1');
      expect(result.account_status).toBe('active');
      expect(result.settings).toEqual({});
    });

    it('normalizes pending status', () => {
      const row = {
        id: 'u1',
        email: 'u@e.com',
        name: 'User',
        account_status: 'pending',
        settings: '{}',
        avatar: null,
        avatar_emoji: null,
        status: 'offline',
        preferences: '{}',
        created_at: 1,
        last_active_at: null,
        updated_at: 1,
      };
      const result = serializeUserProfile(row);
      expect(result.account_status).toBe('pending');
    });

    it('returns null for null row', () => {
      expect(serializeUserProfile(null)).toBeNull();
    });
  });

  describe('buildUserProfileResponse', () => {
    it('builds response with primary role and default model', () => {
      const row = {
        id: 'u1',
        email: 'u@e.com',
        name: 'User',
        account_status: 'active',
        settings: '{}',
        avatar: null,
        avatar_emoji: null,
        status: 'online',
        preferences: '{}',
        created_at: 1,
        last_active_at: null,
        updated_at: 1,
      };
      const result = buildUserProfileResponse(row, {
        defaultModelId: 'gpt-4o',
        primaryRole: 'member',
      });
      expect(result.user.primary_role).toBe('member');
      expect(result.app_config.default_model_id).toBe('gpt-4o');
    });
  });

  describe('buildSelfProfileUpdate', () => {
    it('builds update for name change', () => {
      mocks.optionalString.mockReturnValue('New Name');
      const result = buildSelfProfileUpdate({ name: 'New Name' });
      expect(result.updates).toContain('name = ?');
      expect(result.values).toContain('New Name');
    });

    it('rejects empty name after sanitization', () => {
      // When stripHtml returns empty string, the function throws ValidationError
      expect(() => buildSelfProfileUpdate({ name: '' })).toThrow('name cannot be empty');
    });

    it('rejects invalid status', () => {
      mocks.optionalString.mockReturnValue('busy');
      expect(() => buildSelfProfileUpdate({ status: 'busy' })).toThrow(ValidationError);
    });

    it('rejects no fields to update', () => {
      expect(() => buildSelfProfileUpdate({})).toThrow(ValidationError);
    });

    it('rejects avatar emoji over 50 chars', () => {
      mocks.optionalString.mockReturnValue('x'.repeat(51));
      expect(() => buildSelfProfileUpdate({ avatar_emoji: 'x'.repeat(51) })).toThrow(
        ValidationError
      );
    });

    it('allows settings when allowSettings is true', () => {
      mocks.requirePlainObject.mockReturnValue({ theme: 'dark' });
      const result = buildSelfProfileUpdate(
        { settings: { theme: 'dark' } },
        { allowSettings: true }
      );
      expect(result.updates).toContain('settings = ?');
    });

    it('ignores settings when allowSettings is false', () => {
      expect(() =>
        buildSelfProfileUpdate({ settings: { theme: 'dark' } }, { allowSettings: false })
      ).toThrow(ValidationError);
    });
  });
});

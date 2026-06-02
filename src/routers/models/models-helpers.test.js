import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getConfigValue: vi.fn(),
  normalizeModelId: vi.fn(),
  normalizeAttachmentCaps: vi.fn(),
  normalizeConnectionManualModels: vi.fn(),
}));

vi.mock('../../utils/app-config.js', () => ({
  getConfigValue: (...args) => mocks.getConfigValue(...args),
}));

vi.mock('../../admin/tool-servers.js', () => ({
  normalizeModelId: (...args) => mocks.normalizeModelId(...args),
  normalizeAttachmentCaps: (...args) => mocks.normalizeAttachmentCaps(...args),
}));

vi.mock('../../llm/connections.js', () => ({
  normalizeConnectionManualModels: (...args) => mocks.normalizeConnectionManualModels(...args),
}));

import {
  isValidModelId,
  loadAttachmentCapsFromRaw,
  applyAttachmentDefaults,
  getModelAttachmentCapsEntry,
  splitModelList,
  hasConnectionAuthCredentials,
  shouldSuppressDiscoveryWarning,
  applyAttachmentCapsPatch,
} from './models-helpers.js';

describe('models-helpers', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.normalizeModelId.mockImplementation((id) => String(id || '').trim());
    mocks.normalizeAttachmentCaps.mockImplementation((c) => c || {});
  });

  describe('isValidModelId', () => {
    it('accepts valid IDs', () => {
      expect(isValidModelId('gpt-4o')).toBe(true);
      expect(isValidModelId('conn_123__model')).toBe(true);
    });

    it('rejects empty', () => {
      expect(isValidModelId('')).toBe(false);
    });

    it('rejects IDs with whitespace', () => {
      expect(isValidModelId('gpt 4')).toBe(false);
    });

    it('rejects IDs longer than 200', () => {
      expect(isValidModelId('a'.repeat(201))).toBe(false);
    });
  });

  describe('loadAttachmentCapsFromRaw', () => {
    it('parses valid JSON', () => {
      const result = loadAttachmentCapsFromRaw('{"gpt-4o":{"attachments":{"image":true}}}');
      expect(result['gpt-4o']).toBeDefined();
    });

    it('returns empty for invalid JSON', () => {
      expect(loadAttachmentCapsFromRaw('bad')).toEqual({});
    });

    it('returns empty for array', () => {
      expect(loadAttachmentCapsFromRaw('[1]')).toEqual({});
    });
  });

  describe('applyAttachmentDefaults', () => {
    it('adds text default', () => {
      const result = applyAttachmentDefaults({ image: true });
      expect(result.text).toBe(true);
      expect(result.image).toBe(true);
    });

    it('applies defaults to empty input', () => {
      const result = applyAttachmentDefaults(null);
      expect(result.text).toBe(true);
    });
  });

  describe('getModelAttachmentCapsEntry', () => {
    it('returns entry with defaults', () => {
      const caps = { 'gpt-4o': { attachments: { image: true } } };
      const result = getModelAttachmentCapsEntry(caps, 'gpt-4o');
      expect(result.image).toBe(true);
      expect(result.text).toBe(true);
    });

    it('returns defaults for unknown model', () => {
      const result = getModelAttachmentCapsEntry({}, 'unknown');
      expect(result.text).toBe(true);
    });
  });

  describe('splitModelList', () => {
    it('splits comma-separated values', () => {
      expect(splitModelList('a,b,c')).toEqual(['a', 'b', 'c']);
    });

    it('splits semicolon-separated values', () => {
      expect(splitModelList('a;b;c')).toEqual(['a', 'b', 'c']);
    });

    it('trims whitespace', () => {
      expect(splitModelList(' a , b ')).toEqual(['a', 'b']);
    });

    it('returns empty for falsy input', () => {
      expect(splitModelList(null)).toEqual([]);
      expect(splitModelList('')).toEqual([]);
    });
  });

  describe('hasConnectionAuthCredentials', () => {
    it('returns true for key', () => {
      expect(hasConnectionAuthCredentials({ key: 'secret' })).toBe(true);
    });

    it('returns true for auth header', () => {
      expect(hasConnectionAuthCredentials({ headers: { Authorization: 'Bearer x' } })).toBe(true);
    });

    it('returns false for no credentials', () => {
      expect(hasConnectionAuthCredentials({})).toBe(false);
    });
  });

  describe('shouldSuppressDiscoveryWarning', () => {
    it('suppresses 401 when no credentials', () => {
      expect(shouldSuppressDiscoveryWarning({}, { error: { status: 401 } })).toBe(true);
    });

    it('does not suppress non-401', () => {
      expect(shouldSuppressDiscoveryWarning({}, { error: { status: 500 } })).toBe(false);
    });

    it('does not suppress 401 with credentials', () => {
      expect(shouldSuppressDiscoveryWarning({ key: 'secret' }, { error: { status: 401 } })).toBe(
        false
      );
    });
  });

  describe('applyAttachmentCapsPatch', () => {
    it('applies patches to caps', () => {
      mocks.normalizeModelId.mockReturnValue('gpt-4o');
      mocks.normalizeAttachmentCaps.mockReturnValue({ image: true });
      const caps = {};
      applyAttachmentCapsPatch(caps, { model_id: 'gpt-4o', attachments: { image: true } });
      expect(caps['gpt-4o']).toBeDefined();
      expect(caps['gpt-4o'].attachments.image).toBe(true);
    });

    it('removes null entries', () => {
      mocks.normalizeModelId.mockReturnValue('gpt-4o');
      mocks.normalizeAttachmentCaps.mockReturnValue({ image: null });
      const caps = { 'gpt-4o': { attachments: { image: true, pdf: true } } };
      applyAttachmentCapsPatch(caps, { model_id: 'gpt-4o', attachments: { image: null } });
      expect(caps['gpt-4o'].attachments.image).toBeUndefined();
    });

    it('throws for missing model_id', () => {
      mocks.normalizeModelId.mockReturnValue('');
      expect(() => applyAttachmentCapsPatch({}, { model_id: '' })).toThrow('model_id is required');
    });
  });
});

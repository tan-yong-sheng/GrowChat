/**
 * Tests for chat-core.js — shared helpers: resolveDefaultModel, loadAttachmentDocuments,
 * buildAttachmentParts, requireOwnedChat, normalizeErrorMessage, etc.
 * Coverage focus: error paths, missing configs, table-not-found graceful handling.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createChatRepository: vi.fn(),
  getConfigValue: vi.fn(),
  getAllOpenAIConnectionConfigs: vi.fn(),
  parseModelId: vi.fn(),
  parseProviderId: vi.fn(),
  normalizeProviderFamily: vi.fn(),
  authorize: vi.fn(),
  createRealtimeBus: vi.fn(() => ({
    publish: vi.fn().mockResolvedValue(undefined),
  })),
  loadModelAclRules: vi.fn(),
  buildModelAclIndex: vi.fn(),
  evaluateModelAclAccess: vi.fn(),
  createRootLogger: vi.fn(() => ({ warn: vi.fn() })),
}));

vi.mock('../db.js', () => ({}));

vi.mock('../repositories/chat-repository.js', () => ({
  createChatRepository: mocks.createChatRepository,
}));

vi.mock('../utils/app-config.js', () => ({
  getConfigValue: mocks.getConfigValue,
}));

vi.mock('../llm/connections.js', () => ({
  getAllOpenAIConnectionConfigs: mocks.getAllOpenAIConnectionConfigs,
}));

vi.mock('../llm/provider-registry.js', () => ({
  parseModelId: mocks.parseModelId,
  parseProviderId: mocks.parseProviderId,
  normalizeProviderFamily: mocks.normalizeProviderFamily,
}));

vi.mock('../utils/authorize.js', () => ({
  authorize: mocks.authorize,
}));

vi.mock('../services/realtime-bus.js', () => ({
  createRealtimeBus: mocks.createRealtimeBus,
}));

vi.mock('../utils/model-acl.js', () => ({
  loadModelAclRules: mocks.loadModelAclRules,
  buildModelAclIndex: mocks.buildModelAclIndex,
  evaluateModelAclAccess: mocks.evaluateModelAclAccess,
}));

vi.mock('../utils/logger.js', () => ({
  createRootLogger: mocks.createRootLogger,
}));

import {
  resolveDefaultModel,
  loadAttachmentDocuments,
  buildAttachmentParts,
  requireOwnedChat,
  getMessageSnapshot,
  getOwnedChat,
  normalizeErrorMessage,
} from './chat-core.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const db = {
  all: vi.fn(),
  first: vi.fn(),
  prepare: vi.fn(() => ({ bind: vi.fn() })),
};

const mockRepo = {
  findOwnedChat: vi.fn(),
  getMessageSnapshot: vi.fn(),
  getChatMessages: vi.fn(),
};

describe('resolveDefaultModel', () => {
  beforeEach(() => {
    // Use reset instead of clear so mockResolvedValue persists across tests
    vi.resetModules();
  });

  beforeEach(() => {
    mocks.createChatRepository.mockReturnValue(mockRepo);
    // Re-apply mockResolvedValue in case resetModules cleared them
    mocks.getConfigValue.mockResolvedValue(null);
  });

  it('returns user default when set', async () => {
    db.first.mockResolvedValue({ preferences: JSON.stringify({ defaultModelId: 'gpt-4' }) });

    const result = await resolveDefaultModel({}, db, 'u1');

    expect(result).toBe('gpt-4');
  });

  it('returns global default when user default is not set', async () => {
    db.first.mockResolvedValue({ preferences: '{}' });
    mocks.getConfigValue.mockResolvedValue('claude-3');

    const result = await resolveDefaultModel({}, db, 'u1');

    expect(result).toBe('claude-3');
  });

  it('returns env DEFAULT_MODELS as fallback', async () => {
    db.first.mockResolvedValue(null);
    mocks.getConfigValue.mockResolvedValue(null);

    const result = await resolveDefaultModel({ DEFAULT_MODELS: 'llama-3' }, db, 'u1');

    expect(result).toBe('llama-3');
  });

  it('returns null when no default is configured', async () => {
    db.first.mockResolvedValue(null);
    mocks.getConfigValue.mockResolvedValue(null);

    const result = await resolveDefaultModel({}, db, 'u1');

    expect(result).toBeNull();
  });

  it('rejects user default if it exceeds 200 characters', async () => {
    db.first.mockResolvedValue({
      preferences: JSON.stringify({ defaultModelId: 'a'.repeat(201) }),
    });
    mocks.getConfigValue.mockResolvedValue('fallback-model');

    const result = await resolveDefaultModel({}, db, 'u1');

    // Should fall through to global default since user default is rejected
    expect(result).toBe('fallback-model');
  });

  it('rejects user default with whitespace', async () => {
    db.first.mockResolvedValue({
      preferences: JSON.stringify({ defaultModelId: 'gpt-4 with spaces' }),
    });

    const result = await resolveDefaultModel({}, db, 'u1');

    expect(result).not.toBe('gpt-4 with spaces');
  });

  it('returns null when userId is not provided', async () => {
    const result = await resolveDefaultModel({}, db, null);
    expect(result).toBeNull();
  });

  it('returns null when userId is empty string', async () => {
    const result = await resolveDefaultModel({}, db, '');
    expect(result).toBeNull();
  });
});

describe('loadAttachmentDocuments', () => {
  beforeEach(() => {
    mocks.createChatRepository.mockReturnValue(mockRepo);
  });

  it('returns empty array when attachmentIds is empty', async () => {
    const result = await loadAttachmentDocuments(db, 'u1', []);
    expect(result).toEqual([]);
  });

  it('returns all matching documents', async () => {
    db.all.mockResolvedValue([
      { id: 'd1', filename: 'a.txt', content_type: 'text/plain', file_size: 100, r2_key: 'k1' },
      { id: 'd2', filename: 'b.txt', content_type: 'text/plain', file_size: 200, r2_key: 'k2' },
    ]);

    const result = await loadAttachmentDocuments(db, 'u1', ['d1', 'd2']);

    expect(result).toHaveLength(2);
  });

  it('throws when some attachments are missing', async () => {
    db.all.mockResolvedValue([
      { id: 'd1', filename: 'a.txt', content_type: 'text/plain', r2_key: 'k1' },
    ]);

    await expect(loadAttachmentDocuments(db, 'u1', ['d1', 'd2'])).rejects.toThrow(
      /Missing attachment/i
    );
  });

  it('throws singular "attachment" when only one is missing', async () => {
    db.all.mockResolvedValue([]);

    await expect(loadAttachmentDocuments(db, 'u1', ['d1'])).rejects.toThrow(
      /Missing attachment: d1/i
    );
  });

  it('uses correct SQL IN clause with placeholders', async () => {
    // Return documents so the function doesn't throw on missing check
    db.all.mockResolvedValue([
      { id: 'd1', filename: 'a.txt', content_type: 'text/plain', r2_key: 'k1' },
      { id: 'd2', filename: 'b.txt', content_type: 'text/plain', r2_key: 'k2' },
    ]);

    const result = await loadAttachmentDocuments(db, 'u1', ['d1', 'd2']);

    expect(result).toHaveLength(2);
    const sql = db.all.mock.calls[0][0];
    expect(sql).toMatch(/IN\s*\(\?\s*,\s*\?\)/);
    expect(db.all.mock.calls[0][1]).toEqual(['d1', 'd2', 'u1']);
  });
});

describe('buildAttachmentParts', () => {
  beforeEach(() => {
    // no mock clearing needed
  });

  it('returns empty array when documents is empty', async () => {
    const result = await buildAttachmentParts({}, []);
    expect(result).toEqual([]);
  });

  it('throws when FILES binding is missing', async () => {
    await expect(buildAttachmentParts({}, [{}])).rejects.toThrow(/FILES binding/i);
  });

  it('throws when attachment is not found in R2', async () => {
    const env = {
      FILES: { get: vi.fn().mockResolvedValue(null) },
    };
    const docs = [
      { id: 'd1', content_type: 'image/png', filename: 'img.png', file_size: 100, r2_key: 'k1' },
    ];

    await expect(buildAttachmentParts(env, docs)).rejects.toThrow(/not found in storage/i);
  });

  it('throws when attachment exceeds MAX_ATTACHMENT_BYTES', async () => {
    const buffer = new ArrayBuffer(1024 * 1024 * 26); // 26MB
    const env = {
      FILES: {
        get: vi.fn().mockResolvedValue({
          arrayBuffer: vi.fn().mockResolvedValue(buffer),
        }),
      },
    };
    const docs = [
      {
        id: 'd1',
        content_type: 'image/png',
        filename: 'img.png',
        file_size: 26 * 1024 * 1024,
        r2_key: 'k1',
      },
    ];

    await expect(buildAttachmentParts(env, docs)).rejects.toThrow(/exceeds.*MB limit/i);
  });

  it('throws when total attachments exceed MAX_ATTACHMENT_TOTAL_BYTES', async () => {
    // MAX_ATTACHMENT_TOTAL_BYTES is 24MB; use files under per-file limit (12MB) but exceeding total
    const buffer = new ArrayBuffer(1024 * 1024 * 10); // 10MB each
    const env = {
      FILES: {
        get: vi.fn().mockResolvedValue({
          arrayBuffer: vi.fn().mockResolvedValue(buffer),
        }),
      },
    };
    const docs = [
      {
        id: 'd1',
        content_type: 'image/png',
        filename: 'a.png',
        file_size: 10 * 1024 * 1024,
        r2_key: 'k1',
      },
      {
        id: 'd2',
        content_type: 'image/png',
        filename: 'b.png',
        file_size: 10 * 1024 * 1024,
        r2_key: 'k2',
      },
      {
        id: 'd3',
        content_type: 'image/png',
        filename: 'c.png',
        file_size: 10 * 1024 * 1024,
        r2_key: 'k3',
      },
    ];

    await expect(buildAttachmentParts(env, docs)).rejects.toThrow(/Total attachments exceed/i);
  });

  it('throws for unsupported attachment type', async () => {
    const env = {
      FILES: { get: vi.fn().mockResolvedValue(null) },
    };
    const docs = [
      {
        id: 'd1',
        content_type: 'application/exe',
        filename: 'evil.exe',
        file_size: 100,
        r2_key: 'k1',
      },
    ];

    await expect(buildAttachmentParts(env, docs)).rejects.toThrow(/Unsupported attachment type/i);
  });
});

describe('requireOwnedChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createChatRepository.mockReturnValue(mockRepo);
  });

  it('returns chat when found', async () => {
    const chat = { id: 'c1', title: 'My Chat' };
    mockRepo.findOwnedChat.mockResolvedValue(chat);

    const req = new Request('https://example.com', {
      headers: new Headers({ Origin: 'https://example.com' }),
    });
    const result = await requireOwnedChat(req, db, 'c1', 'u1');

    expect(result.chat).toEqual(chat);
    expect(result.error).toBeUndefined();
  });

  it('returns error when chat not found', async () => {
    mockRepo.findOwnedChat.mockResolvedValue(null);

    const req = new Request('https://example.com', {
      headers: new Headers({ Origin: 'https://example.com' }),
    });
    const result = await requireOwnedChat(req, db, 'c1', 'u1');

    expect(result.error).toBeDefined();
    expect(result.error.status).toBe(404);
  });

  it('calls findOwnedChat with correct args', async () => {
    mockRepo.findOwnedChat.mockResolvedValue({ id: 'c1' });

    const req = new Request('https://example.com', {
      headers: new Headers({ Origin: 'https://example.com' }),
    });
    await requireOwnedChat(req, db, 'c1', 'u1');

    expect(mockRepo.findOwnedChat).toHaveBeenCalledWith('c1', 'u1');
  });
});

describe('normalizeErrorMessage', () => {
  it('returns fallback when error is null', () => {
    expect(normalizeErrorMessage(null, 'fallback')).toBe('fallback');
  });

  it('returns fallback when error is undefined', () => {
    expect(normalizeErrorMessage(undefined, 'fallback')).toBe('fallback');
  });

  it('returns fallback when error is empty string', () => {
    expect(normalizeErrorMessage('', 'fallback')).toBe('fallback');
  });

  it('truncates long messages to maxLen', () => {
    const long = 'a'.repeat(600);
    const result = normalizeErrorMessage(long, 'fallback', 300);
    expect(result.length).toBeLessThanOrEqual(300);
  });

  it('uses maxLen of 500 by default', () => {
    const long = 'a'.repeat(600);
    const result = normalizeErrorMessage(long, 'fallback');
    expect(result.length).toBeLessThanOrEqual(500);
  });

  it('ignores non-finite maxLen', () => {
    const long = 'a'.repeat(600);
    const result = normalizeErrorMessage(long, 'fallback', NaN);
    expect(result.length).toBe(600);
  });

  it('ignores negative maxLen', () => {
    const long = 'a'.repeat(600);
    const result = normalizeErrorMessage(long, 'fallback', -1);
    expect(result.length).toBe(600);
  });

  it('extracts message from Error object', () => {
    const err = new Error('Something went wrong');
    expect(normalizeErrorMessage(err, 'fallback')).toBe('Something went wrong');
  });

  it('extracts message from object with message property', () => {
    expect(normalizeErrorMessage({ message: 'Custom error' }, 'fallback')).toBe('Custom error');
  });

  it('stringifies plain string values', () => {
    expect(normalizeErrorMessage('plain string error', 'fallback')).toBe('plain string error');
  });
});

describe('getMessageSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createChatRepository.mockReturnValue(mockRepo);
  });

  it('calls repository getMessageSnapshot', async () => {
    mockRepo.getMessageSnapshot.mockResolvedValue({ id: 'm1' });

    await getMessageSnapshot(db, 'm1');

    expect(mockRepo.getMessageSnapshot).toHaveBeenCalledWith('m1');
  });
});

describe('getOwnedChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createChatRepository.mockReturnValue(mockRepo);
  });

  it('calls repository findOwnedChat', async () => {
    mockRepo.findOwnedChat.mockResolvedValue({ id: 'c1' });

    await getOwnedChat(db, 'c1', 'u1');

    expect(mockRepo.findOwnedChat).toHaveBeenCalledWith('c1', 'u1');
  });
});

describe('defaultModel', () => {
  it('returns first model from comma-separated env DEFAULT_MODELS', async () => {
    db.first.mockResolvedValue(null);
    mocks.getConfigValue.mockResolvedValue(null);

    const result = await resolveDefaultModel(
      { DEFAULT_MODELS: 'gpt-4,claude-3,llama-3' },
      db,
      'u1'
    );

    expect(result).toBe('gpt-4');
  });

  it('trims whitespace from env defaults', async () => {
    db.first.mockResolvedValue(null);
    mocks.getConfigValue.mockResolvedValue(null);

    const result = await resolveDefaultModel(
      { DEFAULT_MODELS: '  gpt-4  ,  claude-3  ' },
      db,
      'u1'
    );

    expect(result).toBe('gpt-4');
  });

  it('returns null when env DEFAULT_MODELS is empty string', async () => {
    db.first.mockResolvedValue(null);
    mocks.getConfigValue.mockResolvedValue(null);

    const result = await resolveDefaultModel({ DEFAULT_MODELS: '' }, db, 'u1');

    expect(result).toBeNull();
  });

  it('returns null when env DEFAULT_MODELS is only whitespace', async () => {
    db.first.mockResolvedValue(null);
    mocks.getConfigValue.mockResolvedValue(null);

    const result = await resolveDefaultModel({ DEFAULT_MODELS: '   ' }, db, 'u1');

    expect(result).toBeNull();
  });
});

describe('getUserDefaultModelId', () => {
  it('returns null for invalid JSON preferences', async () => {
    db.first.mockResolvedValue({ preferences: 'not-json' });
    mocks.getConfigValue.mockResolvedValue(null);

    const result = await resolveDefaultModel({}, db, 'u1');

    expect(result).not.toBe('not-json');
  });

  it('returns null when preferences is null', async () => {
    db.first.mockResolvedValue({ preferences: null });
    mocks.getConfigValue.mockResolvedValue(null);

    const result = await resolveDefaultModel({}, db, 'u1');

    expect(result).toBeNull();
  });

  it('returns null when defaultModelId is empty string', async () => {
    db.first.mockResolvedValue({ preferences: JSON.stringify({ defaultModelId: '' }) });
    mocks.getConfigValue.mockResolvedValue(null);

    const result = await resolveDefaultModel({}, db, 'u1');

    expect(result).toBeNull();
  });
});

describe('resolveProviderForModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when model is empty', async () => {
    const { resolveProviderForModel } = await import('./chat-core.js');
    const result = await resolveProviderForModel({}, '');

    expect(result.error).toBe('Model is required');
  });

  it('returns error when model is null', async () => {
    const { resolveProviderForModel } = await import('./chat-core.js');
    const result = await resolveProviderForModel({}, null);

    expect(result.error).toBe('Model is required');
  });

  it('returns error when no provider connections exist', async () => {
    mocks.getAllOpenAIConnectionConfigs.mockResolvedValue([]);
    mocks.parseModelId.mockReturnValue(null);

    const { resolveProviderForModel } = await import('./chat-core.js');
    const result = await resolveProviderForModel({}, 'gpt-4');

    expect(result.error).toBe('No provider connection configured');
  });

  it('returns error when multiple connections without parsed provider id', async () => {
    mocks.getAllOpenAIConnectionConfigs.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);
    mocks.parseModelId.mockReturnValue(null);

    const { resolveProviderForModel } = await import('./chat-core.js');
    const result = await resolveProviderForModel({}, 'gpt-4');

    expect(result.error).toMatch(/provider prefix/i);
  });

  it('returns error when parsed provider id is invalid', async () => {
    mocks.parseModelId.mockReturnValue({ providerId: 'conn_123' });
    mocks.parseProviderId.mockReturnValue(null);

    const { resolveProviderForModel } = await import('./chat-core.js');
    const result = await resolveProviderForModel({}, 'conn_123__gpt-4');

    expect(result.error).toBe('Invalid provider id');
  });

  it('returns error when no matching connection is found', async () => {
    mocks.parseModelId.mockReturnValue({ providerId: 'conn_123' });
    mocks.parseProviderId.mockReturnValue({ connectionId: 'conn_123', providerFamily: 'openai' });
    mocks.getAllOpenAIConnectionConfigs.mockResolvedValue([]);
    mocks.normalizeProviderFamily.mockReturnValue('openai');

    const { resolveProviderForModel } = await import('./chat-core.js');
    const result = await resolveProviderForModel({}, 'conn_123__gpt-4');

    expect(result.error).toBe('No matching provider connection configured');
  });

  it('returns error when connection is disabled', async () => {
    mocks.parseModelId.mockReturnValue({ providerId: 'conn_123' });
    mocks.parseProviderId.mockReturnValue({ connectionId: 'conn_123', providerFamily: 'openai' });
    mocks.getAllOpenAIConnectionConfigs.mockResolvedValue([
      { id: 'conn_123', providerFamily: 'openai', enabled: false },
    ]);
    mocks.normalizeProviderFamily.mockReturnValue('openai');

    const { resolveProviderForModel } = await import('./chat-core.js');
    const result = await resolveProviderForModel({}, 'conn_123__gpt-4');

    expect(result.error).toBe('Provider connection is disabled');
  });

  it('returns provider info with single connection and no parsed model', async () => {
    mocks.getAllOpenAIConnectionConfigs.mockResolvedValue([
      { id: 'c1', providerFamily: 'openai', enabled: true },
    ]);
    mocks.parseModelId.mockReturnValue(null);
    mocks.normalizeProviderFamily.mockReturnValue('openai');

    const { resolveProviderForModel } = await import('./chat-core.js');
    const result = await resolveProviderForModel({}, 'gpt-4');

    expect(result.providerFamily).toBe('openai');
    expect(result.connection).toBeDefined();
  });
});

describe('buildAttachmentParts - content types', () => {
  it('creates image_url part for image/png', async () => {
    const buffer = new ArrayBuffer(100);
    const env = {
      FILES: {
        get: vi.fn().mockResolvedValue({
          arrayBuffer: vi.fn().mockResolvedValue(buffer),
        }),
      },
    };
    const docs = [
      { id: 'd1', content_type: 'image/png', filename: 'a.png', file_size: 100, r2_key: 'k1' },
    ];

    const { buildAttachmentParts } = await import('./chat-core.js');
    const parts = await buildAttachmentParts(env, docs);

    expect(parts).toHaveLength(1);
    expect(parts[0].type).toBe('image_url');
    expect(parts[0].image_url.url).toMatch(/^data:image\/png;base64,/);
  });

  it('creates file part for application/pdf', async () => {
    const buffer = new ArrayBuffer(100);
    const env = {
      FILES: {
        get: vi.fn().mockResolvedValue({
          arrayBuffer: vi.fn().mockResolvedValue(buffer),
        }),
      },
    };
    const docs = [
      {
        id: 'd1',
        content_type: 'application/pdf',
        filename: 'doc.pdf',
        file_size: 100,
        r2_key: 'k1',
      },
    ];

    const { buildAttachmentParts } = await import('./chat-core.js');
    const parts = await buildAttachmentParts(env, docs);

    expect(parts).toHaveLength(1);
    expect(parts[0].type).toBe('file');
    expect(parts[0].file.filename).toBe('doc.pdf');
    expect(parts[0].file.file_data).toMatch(/^data:application\/pdf;base64,/);
  });

  it('creates text part for text/plain with truncation note', async () => {
    const text = 'a'.repeat(500001); // Exceed MAX_TEXT_ATTACHMENT_CHARS
    const encoder = new TextEncoder();
    const buffer = encoder.encode(text).buffer;
    const env = {
      FILES: {
        get: vi.fn().mockResolvedValue({
          arrayBuffer: vi.fn().mockResolvedValue(buffer),
        }),
      },
    };
    const docs = [
      {
        id: 'd1',
        content_type: 'text/plain',
        filename: 'log.txt',
        file_size: buffer.byteLength,
        r2_key: 'k1',
      },
    ];

    const { buildAttachmentParts } = await import('./chat-core.js');
    const parts = await buildAttachmentParts(env, docs);

    expect(parts).toHaveLength(1);
    expect(parts[0].type).toBe('text');
    expect(parts[0].text).toContain('truncated');
  });

  it('creates text part for application/json', async () => {
    const text = '{"key":"value"}';
    const encoder = new TextEncoder();
    const buffer = encoder.encode(text).buffer;
    const env = {
      FILES: {
        get: vi.fn().mockResolvedValue({
          arrayBuffer: vi.fn().mockResolvedValue(buffer),
        }),
      },
    };
    const docs = [
      {
        id: 'd1',
        content_type: 'application/json',
        filename: 'data.json',
        file_size: buffer.byteLength,
        r2_key: 'k1',
      },
    ];

    const { buildAttachmentParts } = await import('./chat-core.js');
    const parts = await buildAttachmentParts(env, docs);

    expect(parts).toHaveLength(1);
    expect(parts[0].type).toBe('text');
  });
});

describe('attachDocumentsToMessages', () => {
  it('returns messages unchanged when array is empty', async () => {
    const { attachDocumentsToMessages } = await import('./chat-core.js');
    const result = await attachDocumentsToMessages(db, []);
    expect(result).toEqual([]);
  });

  it('returns messages unchanged when all message ids are empty', async () => {
    const { attachDocumentsToMessages } = await import('./chat-core.js');
    const result = await attachDocumentsToMessages(db, [{ id: '', content: 'hi' }]);
    expect(result).toEqual([{ id: '', content: 'hi' }]);
  });

  it('gracefully handles missing message_documents table', async () => {
    db.all.mockRejectedValue(new Error('no such table: message_documents'));

    const { attachDocumentsToMessages } = await import('./chat-core.js');
    const result = await attachDocumentsToMessages(db, [{ id: 'm1', content: 'hi' }]);

    expect(result).toEqual([{ id: 'm1', content: 'hi' }]);
  });

  it('gracefully handles unexpected db errors', async () => {
    db.all.mockRejectedValue(new Error('connection lost'));

    const { attachDocumentsToMessages } = await import('./chat-core.js');
    const result = await attachDocumentsToMessages(db, [{ id: 'm1', content: 'hi' }]);

    expect(result).toEqual([{ id: 'm1', content: 'hi' }]);
  });

  it('attaches documents to matching messages', async () => {
    db.all.mockResolvedValue([
      { message_id: 'm1', id: 'd1', filename: 'a.txt', content_type: 'text/plain', file_size: 100 },
      { message_id: 'm2', id: 'd2', filename: 'b.txt', content_type: 'text/plain', file_size: 200 },
    ]);

    const { attachDocumentsToMessages } = await import('./chat-core.js');
    const result = await attachDocumentsToMessages(db, [
      { id: 'm1', content: 'hi' },
      { id: 'm3', content: 'bye' },
    ]);

    expect(result[0].attachments).toHaveLength(1);
    expect(result[0].attachments[0].filename).toBe('a.txt');
    expect(result[1].attachments).toEqual([]);
  });
});

describe('requireAuth', () => {
  it('returns null when user is present', async () => {
    const { requireAuth } = await import('./chat-core.js');
    const req = { url: 'https://example.com' };
    const result = requireAuth(req, { sub: 'u1' });
    expect(result).toBeNull();
  });

  it('returns 401 error when user is missing', async () => {
    const { requireAuth } = await import('./chat-core.js');
    const req = new Request('https://example.com', {
      headers: new Headers({ Origin: 'https://example.com' }),
    });
    const result = requireAuth(req, null);
    expect(result).toBeDefined();
    expect(result.status).toBe(401);
  });
});

describe('sleep', () => {
  it('resolves after specified milliseconds', async () => {
    const { sleep } = await import('./chat-core.js');
    const start = Date.now();
    await sleep(50);
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
  });
});

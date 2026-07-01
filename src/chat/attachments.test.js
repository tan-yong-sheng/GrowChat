import { describe, expect, it, vi } from 'vitest';
import {
  applyAttachmentDefaults,
  arrayBufferToBase64,
  formatUnsupportedAttachmentMessage,
  getAttachmentKind,
  getAttachmentKinds,
  getModelAttachmentCapsEntry,
  getUnsupportedAttachmentKinds,
  getUnsupportedAttachmentKindsStrict,
  inferUnsupportedAttachmentKind,
  isSupportedAttachmentType,
  isTextLikeContentType,
  isTransientModelError,
  loadModelAttachmentCaps,
  mergeTextAttachmentParts,
  normalizeAttachmentIds,
  recordAttachmentCapabilityFailure,
} from './attachments.js';

vi.mock('../utils/app-config.js', () => ({
  getConfigValue: vi.fn(),
  setConfigValue: vi.fn(),
}));

describe('chat attachment helpers', () => {
  it('normalizes attachment ids and caps the list', () => {
    expect(
      normalizeAttachmentIds([' a ', 'b', 'a', '', null, 'c', 'd', 'e', 'f', 'g', 'h'])
    ).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
  });

  it('identifies supported and text-like content types', () => {
    expect(isTextLikeContentType('application/json')).toBe(true);
    expect(isTextLikeContentType('text/plain')).toBe(true);
    expect(isSupportedAttachmentType('application/pdf')).toBe(true);
    expect(isSupportedAttachmentType('image/png')).toBe(true);
    expect(isSupportedAttachmentType('application/octet-stream')).toBe(false);
  });

  it('derives attachment kinds from content types', () => {
    expect(getAttachmentKind('image/png')).toBe('image');
    expect(getAttachmentKind('application/pdf')).toBe('pdf');
    expect(
      getAttachmentKinds([{ content_type: 'text/plain' }, { content_type: 'audio/mpeg' }])
    ).toEqual(['text', 'audio']);
  });

  it('merges text attachment parts', () => {
    expect(
      mergeTextAttachmentParts('hello', [
        { type: 'text', text: ' first ' },
        { type: 'image_url', image_url: {} },
        { type: 'text', text: 'second' },
      ])
    ).toBe('hello\n\nfirst\n\nsecond');
  });

  it('formats unsupported attachment messages and resolves caps', () => {
    expect(formatUnsupportedAttachmentMessage(['image', 'pdf'])).toBe(
      'Selected model does not support image, pdf attachments.'
    );
    expect(applyAttachmentDefaults({ audio: true })).toMatchObject({ text: true, audio: true });
    expect(
      getModelAttachmentCapsEntry({ model1: { attachments: { image: false } } }, 'model1')
    ).toMatchObject({ text: true, image: false });
  });

  it('filters unsupported kinds', () => {
    expect(getUnsupportedAttachmentKinds({ image: false, pdf: true }, ['image', 'pdf'])).toEqual([
      'image',
    ]);
    expect(getUnsupportedAttachmentKindsStrict({ image: true }, ['image', 'audio'])).toEqual([
      'audio',
    ]);
  });

  it('recognizes transient and inferred model errors', () => {
    expect(isTransientModelError('request timed out')).toBe(true);
    expect(isTransientModelError('bad request')).toBe(false);
    expect(inferUnsupportedAttachmentKind('vision model failed', ['image', 'pdf'])).toBe('image');
    expect(inferUnsupportedAttachmentKind('unknown', ['text'])).toBe('text');
  });

  it('encodes array buffers as base64', () => {
    const bytes = new Uint8Array([72, 105]);
    expect(arrayBufferToBase64(bytes.buffer)).toBe('SGk=');
  });

  it('records attachment capability failure with Unix-second timestamp (#126)', async () => {
    const { getConfigValue, setConfigValue } = await import('../utils/app-config.js');
    getConfigValue.mockResolvedValue('{}');
    setConfigValue.mockResolvedValue(undefined);
    const db = {};
    await recordAttachmentCapabilityFailure({
      db,
      modelId: 'model-1',
      attachmentKinds: ['image'],
      err: new Error('vision model does not support image attachments'),
    });
    expect(setConfigValue).toHaveBeenCalledTimes(1);
    const [, , serialized] = setConfigValue.mock.calls[0];
    const saved = JSON.parse(serialized);
    const entry = saved['model-1'];
    expect(entry).toBeDefined();
    expect(entry.updated_at).toBeTypeOf('number');
    // Unix seconds are roughly 1.7e9; milliseconds would be 1.7e12
    expect(entry.updated_at).toBeLessThan(1e12);
    expect(entry.attachments.image).toBe(false);
  });

  it('normalizes legacy millisecond timestamps on read (#126)', async () => {
    const { getConfigValue } = await import('../utils/app-config.js');
    const legacyMs = Date.now(); // millisecond timestamp
    const legacyBlob = JSON.stringify({
      'legacy-model': {
        attachments: { image: false },
        updated_at: legacyMs,
      },
    });
    getConfigValue.mockResolvedValue(legacyBlob);
    const db = {};
    const caps = await loadModelAttachmentCaps(db);
    expect(caps['legacy-model'].updated_at).toBeLessThan(1e12);
    expect(caps['legacy-model'].updated_at).toBe(Math.floor(legacyMs / 1000));
  });
});

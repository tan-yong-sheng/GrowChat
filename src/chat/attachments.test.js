import { describe, expect, it } from 'vitest';
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
  mergeTextAttachmentParts,
  normalizeAttachmentIds,
} from './attachments.js';

describe('chat attachment helpers', () => {
  it('normalizes attachment ids and caps the list', () => {
    expect(normalizeAttachmentIds([' a ', 'b', 'a', '', null, 'c', 'd', 'e', 'f', 'g', 'h'])).toEqual([
      'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h',
    ]);
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
    expect(getAttachmentKinds([{ content_type: 'text/plain' }, { content_type: 'audio/mpeg' }])).toEqual(['text', 'audio']);
  });

  it('merges text attachment parts', () => {
    expect(mergeTextAttachmentParts('hello', [
      { type: 'text', text: ' first ' },
      { type: 'image_url', image_url: {} },
      { type: 'text', text: 'second' },
    ])).toBe('hello\n\nfirst\n\nsecond');
  });

  it('formats unsupported attachment messages and resolves caps', () => {
    expect(formatUnsupportedAttachmentMessage(['image', 'pdf'])).toBe('Selected model does not support image, pdf attachments.');
    expect(applyAttachmentDefaults({ audio: true })).toMatchObject({ text: true, audio: true });
    expect(getModelAttachmentCapsEntry({ model1: { attachments: { image: false } } }, 'model1')).toMatchObject({ text: true, image: false });
  });

  it('filters unsupported kinds', () => {
    expect(getUnsupportedAttachmentKinds({ image: false, pdf: true }, ['image', 'pdf'])).toEqual(['image']);
    expect(getUnsupportedAttachmentKindsStrict({ image: true }, ['image', 'audio'])).toEqual(['audio']);
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
});

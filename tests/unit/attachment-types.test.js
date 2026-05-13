import { describe, expect, it } from 'vitest';
import {
  TEXT_LIKE_ACCEPT_TYPES,
  getActiveModelAttachmentCaps,
  getAllowedAttachmentKinds,
  getAllowedNonLocalKinds,
  getAttachmentKindFromType,
  getFileContentType,
  inferContentTypeFromName,
  isAttachmentAllowedByModel,
  isSupportedAttachmentType,
  isTextLikeContentType,
} from '../../public/js/shared/utils/attachment-types.js';

describe('attachment type helpers', () => {
  it('infers content types from file names', () => {
    expect(inferContentTypeFromName('photo.JPG')).toBe('image/jpeg');
    expect(inferContentTypeFromName('notes.md')).toBe('text/markdown');
    expect(inferContentTypeFromName('unknown.bin')).toBe('');
  });

  it('reads explicit file content types before inferring from name', () => {
    expect(getFileContentType({ type: 'application/pdf', name: 'ignored.txt' })).toBe('application/pdf');
    expect(getFileContentType({ name: 'report.csv' })).toBe('text/csv');
  });

  it('recognizes text-like and supported attachment types', () => {
    expect(isTextLikeContentType('application/json')).toBe(true);
    expect(isTextLikeContentType('text/plain')).toBe(true);
    expect(isSupportedAttachmentType('image/png')).toBe(true);
    expect(isSupportedAttachmentType('application/pdf')).toBe(true);
    expect(isSupportedAttachmentType('application/octet-stream')).toBe(false);
  });

  it('classifies attachment kinds', () => {
    expect(getAttachmentKindFromType('image/png')).toBe('image');
    expect(getAttachmentKindFromType('application/pdf')).toBe('pdf');
    expect(getAttachmentKindFromType('application/json')).toBe('text');
    expect(getAttachmentKindFromType('audio/mpeg')).toBe('audio');
  });

  it('derives model attachment caps and allowed kinds', () => {
    const state = {
      activeModelId: 'm1',
      models: [
        { id: 'm1', attachments: { image: true, pdf: false } },
      ],
    };

    expect(getActiveModelAttachmentCaps(state)).toMatchObject({ text: true, image: true, pdf: false });
    expect(getAllowedAttachmentKinds(state)).toEqual(['image', 'text-local']);
    expect(getAllowedAttachmentKinds(state, { localTextLabel: 'text (local)' })).toEqual(['image', 'text (local)']);
    expect(getAllowedNonLocalKinds(state)).toEqual(['image']);
  });

  it('checks model attachment permissions', () => {
    const state = {
      activeModelId: 'm1',
      models: [
        { id: 'm1', attachments: { image: true, pdf: false, text: true } },
      ],
    };

    expect(isAttachmentAllowedByModel(state, 'text/plain')).toBe(true);
    expect(isAttachmentAllowedByModel(state, 'image/png')).toBe(true);
    expect(isAttachmentAllowedByModel(state, 'application/pdf')).toBe(false);
  });

  it('exposes the accepted text-like mime list', () => {
    expect(TEXT_LIKE_ACCEPT_TYPES).toContain('text/*');
    expect(TEXT_LIKE_ACCEPT_TYPES).toContain('application/json');
  });
});


